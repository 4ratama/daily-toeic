// TOEIC Daily Discord ボット（Cloudflare Workers で動かす）
// - Discord からのボタン・コマンドを HTTP で受け取る（Interactions 方式。常時稼働のサーバーは不要）
// - Cron Trigger で5分ごとに起動し、曜日別に設定された時刻にリマインドを送る
// - 問題は GitHub Pages の questions.json を読む（学習アプリと同じデータ）

const API = "https://discord.com/api/v10";
const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 表示は月曜はじまり
const WINDOW_MIN = 20; // 予定時刻からこの分数以内なら送る（Cron の遅れ対策）
const MAX_TIMES_PER_DAY = 6;
const LETTERS = ["A", "B", "C", "D", "E"];

// Part（スレッド）ごとの設定。kind は questions.json のキー
export const KINDS = {
  grammar: { short: "g", thread: "Part 5 文法", label: "Part 5 短文穴埋め・文法", color: 0x7c5cff,
    intro: "1文の空所に入る語句を4択で選びます。本番は1問20秒が目安です。" },
  vocab: { short: "v", thread: "Part 5 語彙", label: "Part 5 短文穴埋め・語彙", color: 0x3fa7ff,
    intro: "意味・語法・コロケーションで選ぶ語彙問題です。" },
  reading: { short: "r", thread: "Part 7 読解", label: "Part 7 読解（シングルパッセージ）", color: 0x2ecc9a,
    intro: "メールや告知を読んで、設問に1問ずつ答えます。設問を先に読んでから本文を探すのがコツです。" },
  para: { short: "p", thread: "Part 7 言い換え", label: "Part 7 読解・言い換え語彙", color: 0xff9f43,
    intro: "本文と選択肢の言い換えに強くなるための同義語問題です。1問5〜10秒で答えましょう。" },
};
const KIND_BY_SHORT = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.short, k]));

// ---------------- 共通 ----------------
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function jstNow(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { ymd: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.getUTCDay(),
    label: `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${DAY_NAMES[d.getUTCDay()]}）` };
}
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

async function discord(env, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (toeic-daily, 1.0)" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Discord API ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
// インタラクションのあとに追加でメッセージを送る（トークンは15分有効）
const followup = (env, token, body) => fetch(`${API}/webhooks/${env.DISCORD_APPLICATION_ID}/${token}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then(r => { if (!r.ok) return r.text().then(t => { throw new Error(`followup ${r.status} ${t}`); }); });
const editOriginal = (env, token, body) => fetch(`${API}/webhooks/${env.DISCORD_APPLICATION_ID}/${token}/messages/@original`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

// ---------------- 設定の保存（Workers KV） ----------------
const DEFAULT_SCHEDULE = { 0: ["07:30", "21:00"], 1: ["07:30", "21:00"], 2: ["07:30", "21:00"], 3: ["07:30", "21:00"],
  4: ["07:30", "21:00"], 5: ["07:30", "21:00"], 6: ["07:30", "21:00"] };
async function loadCfg(env) {
  const cfg = (await env.KV.get("cfg", "json")) || {};
  cfg.schedule ||= structuredClone(DEFAULT_SCHEDULE);
  cfg.threads ||= {};
  return cfg;
}
const saveCfg = (env, cfg) => env.KV.put("cfg", JSON.stringify(cfg));

// ---------------- 問題データ ----------------
let bankCache = null, bankAt = 0;
export async function loadBank(env) {
  if (bankCache && Date.now() - bankAt < 10 * 60 * 1000) return bankCache;
  const res = await fetch(new URL("questions.json", env.APP_URL), { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`questions.json を読めませんでした（${res.status}）`);
  bankCache = await res.json(); bankAt = Date.now();
  return bankCache;
}

// 直近に出した問題は避けて1つ選ぶ
async function pickItem(env, bank, kind) {
  const items = bank[kind] || [];
  if (!items.length) throw new Error(`${kind} の問題がありません`);
  const key = `recent:${kind}`;
  const recent = (await env.KV.get(key, "json")) || [];
  const keep = Math.min(recent.length, Math.floor(items.length / 2));
  const avoid = new Set(recent.slice(-keep));
  const pool = items.filter(it => !avoid.has(it.id));
  const it = (pool.length ? pool : items)[Math.floor(Math.random() * (pool.length || items.length))];
  await env.KV.put(key, JSON.stringify([...recent, it.id].slice(-30)));
  return it;
}

// 1問ぶんのデータ。order は「表示位置 → 元の選択肢」の並び（元データは1番目が正解）
export function buildQuestion(bank, kind, id, sub = 0, order = null) {
  const it = (bank[kind] || []).find(x => x.id === id);
  if (!it) return null;
  if (kind === "para") {
    // 言い換え：他の単語の answer を誤答に使う。order は表示順の問題ID
    if (!order) order = shuffle([it.id, ...shuffle(bank.para.filter(p => p.id !== it.id && !(it.group && p.group === it.group))).slice(0, 3).map(p => p.id)]);
    const byId = Object.fromEntries(bank.para.map(p => [p.id, p]));
    if (order.some(x => !byId[x])) return null;
    return { kind, id, sub: 0, order, text: `“${it.word}” に最も近い意味は？`,
      choices: order.map(x => byId[x].answer), answer: order.indexOf(it.id),
      point: `${it.word} ＝ ${it.answer}（${it.ja}）`,
      exp: "本番では Part 7 の同義語問題や、設問と本文の言い換えとして出てきます。" };
  }
  const q = kind === "reading" ? it.questions[sub] : it;
  if (!q) return null;
  if (!order) order = shuffle(q.choices.map((_, i) => i));
  return { kind, id, sub, order, text: q.q, choices: order.map(i => q.choices[i]), answer: order.indexOf(0),
    point: q.point || "", exp: q.exp || "", tag: it.tag || "",
    title: kind === "reading" ? it.title : "", passage: kind === "reading" && sub === 0 ? it.passage : "",
    total: kind === "reading" ? it.questions.length : 1 };
}

// ---------------- 問題メッセージ ----------------
// custom_id: a|<kind>|<id>|<sub>|<order>|<選んだ位置>
const orderStr = q => (q.kind === "para" ? q.order.join(".") : q.order.join(""));
const parseOrder = (kind, s) => (kind === "para" ? s.split(".") : s.split("").map(Number));

export function questionMessage(q, heading = "") {
  const k = KINDS[q.kind];
  const longChoices = q.choices.some(c => c.length > 30);
  let desc = "";
  if (q.passage) desc += `${q.passage}\n\n`;
  else if (q.kind === "reading") desc += `*（上の文書「${q.title}」について）*\n\n`;
  desc += `**${q.kind === "reading" ? `Q${q.sub + 1}/${q.total}. ` : ""}${q.text}**`;
  if (longChoices) desc += "\n\n" + q.choices.map((c, i) => `**(${LETTERS[i]})** ${c}`).join("\n");
  const sub = [q.tag, q.kind === "reading" && q.sub === 0 ? q.title : ""].filter(Boolean).join("｜");
  return {
    content: heading || undefined,
    embeds: [{ author: { name: k.label + (sub ? `｜${sub}` : "") }, description: cut(desc, 4000), color: k.color }],
    components: [{ type: 1, components: q.choices.map((c, i) => ({
      type: 2, style: 2,
      label: longChoices ? LETTERS[i] : cut(`${LETTERS[i]}. ${c}`, 80),
      custom_id: `a|${k.short}|${q.id}|${q.sub}|${orderStr(q)}|${i}`,
    })) }],
  };
}

// 解答後のメッセージ（ボタンを色付きで無効化し、解説と「次へ」を付ける）
export function answeredMessage(q, picked, original) {
  const k = KINDS[q.kind];
  const ok = picked === q.answer;
  const longChoices = q.choices.some(c => c.length > 30);
  const embed = { ...(original?.embeds?.[0] || questionMessage(q).embeds[0]) };
  embed.color = ok ? 0x2ecc71 : 0xe74c3c;
  embed.fields = [
    { name: ok ? "⭕ 正解！" : `❌ 不正解（あなたの答え：${LETTERS[picked]}）`, value: cut(`正解は **${LETTERS[q.answer]}. ${q.choices[q.answer]}**`, 1024) },
    ...(q.point ? [{ name: "💡 ポイント", value: cut(q.point, 1024) }] : []),
    ...(q.exp ? [{ name: "解説", value: cut(q.exp, 1024) }] : []),
  ];
  const isLastSub = q.kind !== "reading" || q.sub + 1 >= q.total;
  const next = isLastSub
    ? { type: 2, style: 1, label: q.kind === "reading" ? "次の文書 ▶" : "次の問題 ▶", custom_id: `n|${k.short}` }
    : { type: 2, style: 1, label: `Q${q.sub + 2} へ ▶`, custom_id: `n|${k.short}|${q.id}|${q.sub + 1}` };
  return {
    embeds: [embed],
    components: [
      { type: 1, components: q.choices.map((c, i) => ({
        type: 2, disabled: true,
        style: i === q.answer ? 3 : i === picked ? 4 : 2,
        label: longChoices ? LETTERS[i] : cut(`${LETTERS[i]}. ${c}`, 80),
        custom_id: `x|${i}`,
      })) },
      { type: 1, components: [next] },
    ],
  };
}

// ---------------- リマインド設定パネル ----------------
const fmtSchedule = s => DAY_ORDER.map(d => `\`${DAY_NAMES[d]}\` ${(s[d] || []).length ? s[d].join("　") : "—（なし）"}`).join("\n");
const dayList = days => days.map(d => DAY_NAMES[d]).join("・");

export function remindHome(cfg, notice = "") {
  return {
    flags: 64,
    content: `${notice ? notice + "\n\n" : ""}**⏰ リマインドの時刻（日本時間）**\n${fmtSchedule(cfg.schedule)}\n\n時刻を追加するときは、下で曜日を選んでください（複数選べます）。`,
    components: [
      { type: 1, components: [{ type: 3, custom_id: "rd|days", placeholder: "① 時刻を追加する曜日を選ぶ", min_values: 1, max_values: 7,
        options: DAY_ORDER.map(d => ({ label: `${DAY_NAMES[d]}曜日`, value: String(d) })) }] },
      { type: 1, components: [
        { type: 2, style: 4, label: "時刻を削除する", custom_id: "rd|delmenu" },
        { type: 2, style: 2, label: "閉じる", custom_id: "rd|close" },
      ] },
    ],
  };
}
function remindHour(days) {
  return {
    content: `**${dayList(days)}** に追加します。\n② 何時に送りますか？`,
    components: [
      { type: 1, components: [{ type: 3, custom_id: `rd|h|${days.join("")}`, placeholder: "② 時を選ぶ",
        options: Array.from({ length: 24 }, (_, i) => (i + 5) % 24).map(h => ({ label: `${h}時`, value: String(h) })) }] },
      { type: 1, components: [{ type: 2, style: 2, label: "← 戻る", custom_id: "rd|home" }] },
    ],
  };
}
function remindMinute(days, h) {
  return {
    content: `**${dayList(days)}** の **${h}時** 台に追加します。\n③ 何分にしますか？`,
    components: [
      { type: 1, components: [{ type: 3, custom_id: `rd|m|${days.join("")}|${h}`, placeholder: "③ 分を選ぶ",
        options: Array.from({ length: 12 }, (_, i) => i * 5).map(m => ({ label: `${h}:${String(m).padStart(2, "0")}`, value: String(m) })) }] },
      { type: 1, components: [{ type: 2, style: 2, label: "← 戻る", custom_id: "rd|home" }] },
    ],
  };
}
function remindDelete(cfg) {
  const opts = [];
  for (const d of DAY_ORDER) for (const t of cfg.schedule[d] || []) opts.push({ label: `${DAY_NAMES[d]}曜日 ${t}`, value: `${d}-${t}` });
  if (!opts.length) return remindHome(cfg, "削除できる時刻がありません。");
  return {
    content: `消したい時刻を選んでください（複数選べます）。${opts.length > 25 ? "\n※一度に表示できるのは25件までです。" : ""}`,
    components: [
      { type: 1, components: [{ type: 3, custom_id: "rd|del", placeholder: "削除する時刻を選ぶ", min_values: 1,
        max_values: Math.min(opts.length, 25), options: opts.slice(0, 25) }] },
      { type: 1, components: [{ type: 2, style: 2, label: "← 戻る", custom_id: "rd|home" }] },
    ],
  };
}

async function handleRemindComponent(env, parts, values) {
  const cfg = await loadCfg(env);
  const update = ({ flags, ...data }) => json({ type: 7, data }); // 更新では flags を送らない
  const [, step, a, b] = parts;
  if (step === "home") return update(remindHome(cfg));
  if (step === "close") return update({ content: "設定を閉じました。`/remind` でいつでも開けます。", components: [] });
  if (step === "days") return update(remindHour(values.map(Number)));
  if (step === "h") return update(remindMinute(a.split("").map(Number), Number(values[0])));
  if (step === "m") {
    const days = a.split("").map(Number);
    const t = `${String(b).padStart(2, "0")}:${String(values[0]).padStart(2, "0")}`;
    const full = [];
    for (const d of days) {
      const list = new Set(cfg.schedule[d] || []);
      if (!list.has(t) && list.size >= MAX_TIMES_PER_DAY) { full.push(DAY_NAMES[d]); continue; }
      list.add(t);
      cfg.schedule[d] = [...list].sort();
    }
    await saveCfg(env, cfg);
    const added = days.filter(d => !full.includes(DAY_NAMES[d]));
    let msg = added.length ? `✅ **${dayList(added)}** に **${t}** を追加しました。` : "";
    if (full.length) msg += `\n⚠️ ${full.join("・")} は1日${MAX_TIMES_PER_DAY}回までなので追加しませんでした。`;
    return update(remindHome(cfg, msg.trim()));
  }
  if (step === "delmenu") return update(remindDelete(cfg));
  if (step === "del") {
    for (const v of values) {
      const [d, t] = v.split("-");
      cfg.schedule[d] = (cfg.schedule[d] || []).filter(x => x !== t);
    }
    await saveCfg(env, cfg);
    return update(remindHome(cfg, `🗑️ ${values.length}件の時刻を削除しました。`));
  }
  return update(remindHome(cfg));
}

// ---------------- コマンド ----------------
async function cmdSetup(env, ix, ctx) {
  const ch = ix.channel || {};
  if (!ix.guild_id || ![0, 5].includes(ch.type)) {
    return json({ type: 4, data: { flags: 64, content: "サーバーの通常のテキストチャンネルで実行してください（スレッドの中では使えません）。" } });
  }
  ctx.waitUntil((async () => {
    try {
      const cfg = await loadCfg(env);
      const bank = await loadBank(env);
      const sameChannel = cfg.channelId === ix.channel_id;
      cfg.channelId = ix.channel_id;
      cfg.guildId = ix.guild_id;
      cfg.userId = (ix.member?.user || ix.user).id;
      const made = [];
      for (const [kind, k] of Object.entries(KINDS)) {
        let tid = sameChannel ? cfg.threads[kind] : null;
        if (tid) { try { await discord(env, "GET", `/channels/${tid}`); } catch { tid = null; } }
        if (!tid) {
          const th = await discord(env, "POST", `/channels/${ix.channel_id}/threads`, { name: `📘 ${k.thread}`, type: 11, auto_archive_duration: 10080 });
          tid = th.id;
          await discord(env, "POST", `/channels/${tid}/messages`, { content: `**${k.label}**\n${k.intro}\n\nボタンで答えると、正解と解説が出ます。「次の問題 ▶」で続けられます。\`/quiz\` でもこのスレッドに出題できます。` });
          const it = await pickItem(env, bank, kind);
          await discord(env, "POST", `/channels/${tid}/messages`, questionMessage(buildQuestion(bank, kind, it.id)));
          made.push(kind);
        }
        cfg.threads[kind] = tid;
      }
      await saveCfg(env, cfg);
      await editOriginal(env, ix.token, {
        content: `✅ 準備ができました。\n${Object.keys(KINDS).map(k => `・<#${cfg.threads[k]}>${made.includes(k) ? "（新しく作成）" : ""}`).join("\n")}\n\nリマインドはこのチャンネルに届きます。時刻は \`/remind\` で曜日ごとに変えられます。\n今の設定：\n${fmtSchedule(cfg.schedule)}`,
      });
    } catch (e) {
      console.error(e);
      await editOriginal(env, ix.token, { content: `⚠️ 準備に失敗しました：${cut(String(e.message || e), 1500)}\nボットに「公開スレッドの作成」「スレッドでメッセージを送信」の権限があるか確認してください。` });
    }
  })());
  return json({ type: 5, data: { flags: 64 } });
}

async function cmdQuiz(env, ix) {
  const cfg = await loadCfg(env);
  const opt = ix.data.options?.find(o => o.name === "part")?.value;
  const inThread = Object.entries(cfg.threads).find(([, id]) => id === ix.channel_id)?.[0];
  const kind = opt || inThread || "grammar";
  const bank = await loadBank(env);
  const it = await pickItem(env, bank, kind);
  return json({ type: 4, data: questionMessage(buildQuestion(bank, kind, it.id)) });
}

// ---------------- ボタン ----------------
async function handleComponent(env, ix, ctx) {
  const id = ix.data.custom_id;
  const parts = id.split("|");
  if (parts[0] === "rd") return handleRemindComponent(env, parts, ix.data.values || []);
  if (parts[0] === "a") {
    const [, s, qid, sub, ord, pick] = parts;
    const kind = KIND_BY_SHORT[s];
    const bank = await loadBank(env);
    const q = buildQuestion(bank, kind, qid, Number(sub), parseOrder(kind, ord));
    if (!q) return json({ type: 4, data: { flags: 64, content: "この問題は見つかりませんでした（問題データが更新された可能性があります）。" } });
    return json({ type: 7, data: answeredMessage(q, Number(pick), ix.message) });
  }
  if (parts[0] === "n") {
    // 「次へ」ボタンを消してから、同じ場所に次の問題を送る
    const [, s, qid, sub] = parts;
    const kind = KIND_BY_SHORT[s];
    const comps = (ix.message?.components || []).slice(0, 1);
    ctx.waitUntil((async () => {
      const bank = await loadBank(env);
      const q = qid ? buildQuestion(bank, kind, qid, Number(sub)) : buildQuestion(bank, kind, (await pickItem(env, bank, kind)).id);
      await followup(env, ix.token, questionMessage(q));
    })().catch(e => console.error(e)));
    return json({ type: 7, data: { components: comps } });
  }
  return json({ type: 6 });
}

// ---------------- リマインド送信（Cron） ----------------
export async function runSchedule(env, nowMs = Date.now()) {
  const cfg = await env.KV.get("cfg", "json");
  if (!cfg?.channelId) return "未設定（/setup がまだ）";
  const schedule = cfg.schedule || DEFAULT_SCHEDULE;
  const now = jstNow(nowMs);
  const todays = [...(schedule[now.day] || [])].sort();
  const sentKey = `sent:${now.ymd}`;
  const sent = (await env.KV.get(sentKey, "json")) || [];
  const due = todays.filter(t => !sent.includes(t) && now.min >= toMin(t) && now.min < toMin(t) + WINDOW_MIN);
  if (!due.length) return "送る時刻なし";
  // 先に記録してから送る（Cron が重なっても二重に送らない）
  await env.KV.put(sentKey, JSON.stringify([...sent, ...due]), { expirationTtl: 3 * 86400 });
  const threads = cfg.threads || {};
  const links = Object.keys(KINDS).filter(k => threads[k]).map(k => `<#${threads[k]}>`).join("　");
  const t = due[due.length - 1];
  const first = t === todays[0];
  const mention = cfg.userId ? `<@${cfg.userId}> ` : "";
  const content = first
    ? `${mention}☀️ **${now.label} ${t}** 今日の学習を始めましょう。\n各スレッドに今日の1問を出しました👇\n${links}`
    : `${mention}⏰ **${t}** の学習時間です。どれか1つのスレッドで1問だけでもOK👇\n${links}`;
  await discord(env, "POST", `/channels/${cfg.channelId}/messages`, {
    content,
    allowed_mentions: { users: cfg.userId ? [cfg.userId] : [] },
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "アプリで5タームを進める", url: env.APP_URL }] }],
  });
  if (first) {
    const bank = await loadBank(env);
    for (const kind of Object.keys(KINDS)) {
      if (!threads[kind]) continue;
      try {
        const it = await pickItem(env, bank, kind);
        await discord(env, "POST", `/channels/${threads[kind]}/messages`, questionMessage(buildQuestion(bank, kind, it.id), `📅 **${now.label} の1問目**`));
      } catch (e) { console.error(e); }
    }
  }
  return `送信: ${due.join(",")}`;
}

// ---------------- 署名の確認 ----------------
const hex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
export async function verify(req, body, publicKey) {
  const sig = req.headers.get("X-Signature-Ed25519");
  const ts = req.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !/^[0-9a-f]+$/i.test(sig)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === "GET") return new Response("TOEIC Daily bot is running.");
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = await req.text();
    if (!(await verify(req, body, env.DISCORD_PUBLIC_KEY))) return new Response("Bad signature", { status: 401 });
    const ix = JSON.parse(body);
    try {
      if (ix.type === 1) return json({ type: 1 }); // PING
      if (ix.type === 2) {
        const name = ix.data.name;
        if (name === "setup") return await cmdSetup(env, ix, ctx);
        if (name === "remind") return json({ type: 4, data: remindHome(await loadCfg(env)) });
        if (name === "quiz") return await cmdQuiz(env, ix);
      }
      if (ix.type === 3) return await handleComponent(env, ix, ctx);
    } catch (e) {
      console.error(e);
      return json({ type: 4, data: { flags: 64, content: `⚠️ エラーが起きました：${cut(String(e.message || e), 1500)}` } });
    }
    return json({ type: 4, data: { flags: 64, content: "このコマンドには対応していません。" } });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env, event.scheduledTime).then(r => console.log(r)));
  },
};
