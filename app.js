"use strict";
// TOEIC Daily: 1日5ターム（各約5分）。学習記録はこの端末のブラウザに保存されます。

const STORE_KEY = "toeic-daily-v1";
const INTERVALS = [1, 3, 7, 16, 35]; // 正解するたびに次の出題までの日数が伸びる
const TERMS = [
  { id: 1, name: "文法（Part 5）", desc: "時制・関係詞・倒置など 6問", kind: "grammar", n: 6 },
  { id: 2, name: "語彙（Part 5）", desc: "語法・コロケーション 6問", kind: "vocab", n: 6 },
  { id: 3, name: "長文読解（Part 7）", desc: "短い文書を読んで 3問", kind: "reading", n: 1 },
  { id: 4, name: "言い換え単語", desc: "同義語を素早く選ぶ 8問", kind: "para", n: 8 },
  { id: 5, name: "復習＋文法", desc: "間違えた問題を優先 6問", kind: "review", n: 6 },
];
const GENRE_NAMES = { grammar: "文法", vocab: "語彙", reading: "長文読解", para: "言い換え" };

let BANK = null;
let S = load();
const app = document.getElementById("app");

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.items) return s;
  } catch (e) {}
  return { items: {}, days: {}, picks: {} };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
}
function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function genreOf(id) {
  return { g: "grammar", v: "vocab", p: "para", r: "reading" }[id[0]];
}

// ---- 間隔反復（ライトナー方式）----
function record(id, correct) {
  const it = S.items[id] || { box: 0, seen: 0, ok: 0 };
  it.seen++;
  if (correct) { it.ok++; it.box = Math.min(it.box + 1, INTERVALS.length); it.due = today(INTERVALS[it.box - 1]); it.wrong = false; }
  else { it.box = 0; it.due = today(1); it.wrong = true; }
  S.items[id] = it;
  save();
}
function pick(list, n, exclude) {
  const t = today();
  const avail = list.filter(x => !exclude.has(x.id));
  const due = avail.filter(x => S.items[x.id] && S.items[x.id].due <= t);
  const fresh = avail.filter(x => !S.items[x.id]);
  const later = avail.filter(x => S.items[x.id] && S.items[x.id].due > t)
    .sort((a, b) => S.items[a.id].due.localeCompare(S.items[b.id].due));
  return [...shuffle(due), ...fresh, ...later].slice(0, n);
}

// その日のタームの問題は一度決めたら固定（途中で閉じても同じ問題で再開できる）
function buildTerm(term) {
  const t = today();
  S.picks[t] = S.picks[t] || {};
  if (S.picks[t][term.id]) return S.picks[t][term.id].map(findItem).filter(Boolean);
  for (const d of Object.keys(S.picks)) if (d !== t) delete S.picks[d];
  const used = new Set(Object.values(S.picks[t]).flat());
  let items;
  if (term.kind === "review") {
    const all = [...BANK.grammar, ...BANK.vocab, ...BANK.para];
    const wrongDue = all.filter(x => !used.has(x.id) && S.items[x.id] && S.items[x.id].wrong && S.items[x.id].due <= t);
    items = shuffle(wrongDue).slice(0, term.n);
    const ex = new Set([...used, ...items.map(x => x.id)]);
    items = items.concat(pick(BANK.grammar, term.n - items.length, ex));
  } else {
    items = pick(BANK[term.kind], term.n, used);
  }
  S.picks[t][term.id] = items.map(x => x.id);
  save();
  return items;
}
function findItem(id) {
  return BANK[genreOf(id)].find(x => x.id === id);
}

// 問題を「1問ずつ」の形に展開
function toQuestions(items) {
  const qs = [];
  for (const it of items) {
    const g = genreOf(it.id);
    if (g === "reading") {
      it.questions.forEach((q, i) => qs.push({ id: it.id, sub: i, passage: it.passage, title: it.title,
        q: q.q, answer: q.choices[0], choices: shuffle(q.choices), exp: q.exp, last: i === it.questions.length - 1 }));
    } else if (g === "para") {
      const others = shuffle(BANK.para.filter(p => p.id !== it.id)).slice(0, 3).map(p => p.answer);
      qs.push({ id: it.id, q: `“${it.word}” に最も近い意味は？`, answer: it.answer,
        choices: shuffle([it.answer, ...others]), exp: `${it.word} ＝ ${it.answer}（${it.ja}）` });
    } else {
      qs.push({ id: it.id, q: it.q, answer: it.choices[0], choices: shuffle(it.choices), exp: it.exp });
    }
  }
  return qs;
}

// ---- 画面 ----
function streak() {
  let n = 0;
  for (let i = 0; ; i++) {
    const d = S.days[today(-i)];
    if (d && d.done && d.done.length) n++;
    else if (i === 0) continue; // 今日まだでも昨日までの連続は数える
    else break;
  }
  return n;
}
function doneToday() { return (S.days[today()] && S.days[today()].done) || []; }

function home() {
  const done = doneToday();
  const acc = {};
  for (const [id, it] of Object.entries(S.items)) {
    const g = genreOf(id); acc[g] = acc[g] || { seen: 0, ok: 0 };
    acc[g].seen += it.seen; acc[g].ok += it.ok;
  }
  const d = new Date();
  const rows = Object.keys(GENRE_NAMES).map(g => {
    const a = acc[g];
    return `<tr><td>${GENRE_NAMES[g]}</td><td>${a ? `${Math.round(a.ok / a.seen * 100)}%（${a.seen}問）` : "まだ"}</td></tr>`;
  }).join("");
  app.innerHTML = `
    <div class="top"><h1>今日の5ターム</h1><button class="link" id="settings" aria-label="通知の設定">⚙︎ 通知</button></div>
    <div class="muted">${d.getMonth() + 1}月${d.getDate()}日・1タームは約5分です</div>
    <div class="stats">
      <div class="stat"><b>${done.length}/5</b><span>今日の完了</span></div>
      <div class="stat"><b>${streak()}日</b><span>連続学習</span></div>
    </div>
    <div class="terms">${TERMS.map(t => `
      <button class="term ${done.includes(t.id) ? "done" : ""}" data-term="${t.id}">
        <span class="num">${done.includes(t.id) ? "✓" : t.id}</span>
        <span class="body"><span class="name">${t.name}</span><br><span class="desc">${t.desc}</span></span>
      </button>`).join("")}
    </div>
    <div class="card" style="margin-top:16px">
      <h2>ジャンル別の正答率</h2>
      <table class="genres">${rows}</table>
    </div>`;
  app.querySelectorAll(".term").forEach(b => b.onclick = () => startTerm(+b.dataset.term));
  document.getElementById("settings").onclick = settings;
  window.scrollTo(0, 0);
}

function startTerm(termId) {
  const term = TERMS.find(t => t.id === termId);
  const qs = toQuestions(buildTerm(term));
  const st = { term, qs, i: 0, score: 0, answered: false };
  history.replaceState(null, "", `?term=${termId}`);
  showQ(st);
}

function showQ(st) {
  const q = st.qs[st.i];
  if (!q) return finish(st);
  st.answered = false;
  const L = "ABCD";
  app.innerHTML = `
    <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">${st.term.name}　${st.i + 1}/${st.qs.length}</span></div>
    <div class="bar"><i style="width:${st.i / st.qs.length * 100}%"></i></div>
    ${q.passage ? `<div class="card"><div class="muted">${esc(q.title)}</div><div class="passage">${esc(q.passage)}</div></div>` : ""}
    <div class="card">
      <div class="q">${esc(q.q)}</div>
      <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="lbl">${L[k]}</span>${esc(c)}</button>`).join("")}</div>
      <div id="after"></div>
    </div>`;
  document.getElementById("back").onclick = goHome;
  app.querySelectorAll(".choice").forEach(b => b.onclick = () => answer(st, +b.dataset.k));
  if (!q.passage || q.sub === 0) window.scrollTo(0, 0);
}

function answer(st, k) {
  if (st.answered) return;
  st.answered = true;
  const q = st.qs[st.i];
  const correct = q.choices[k] === q.answer;
  if (correct) st.score++;
  // 長文は3問まとめて1つの記録（全問正解で正解扱い）
  if (q.passage) {
    st.readOk = (q.sub === 0 ? true : st.readOk) && correct;
    if (q.last) record(q.id, st.readOk);
  } else record(q.id, correct);
  app.querySelectorAll(".choice").forEach((b, idx) => {
    b.disabled = true;
    if (q.choices[idx] === q.answer) b.classList.add("ok");
    else if (idx === k) b.classList.add("ng");
  });
  const last = st.i === st.qs.length - 1;
  document.getElementById("after").innerHTML = `
    <div class="exp"><b class="${correct ? "ok" : "ng"}">${correct ? "正解" : "不正解"}</b>　${esc(q.exp)}</div>
    <button class="btn" id="next">${last ? "結果を見る" : "次へ"}</button>`;
  const nb = document.getElementById("next");
  nb.onclick = () => { st.i++; showQ(st); };
  nb.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function finish(st) {
  const t = today();
  S.days[t] = S.days[t] || { done: [] };
  if (!S.days[t].done.includes(st.term.id)) S.days[t].done.push(st.term.id);
  save();
  const done = doneToday();
  const next = TERMS.find(x => !done.includes(x.id));
  app.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="muted">${st.term.name}</div>
      <div class="big">${st.score} / ${st.qs.length}</div>
      <div>${done.length === 5 ? "今日の5タームを全部終えました。お疲れさまでした！" : `今日はあと${5 - done.length}タームです。`}</div>
    </div>
    ${next ? `<button class="btn" id="nextTerm">次のターム：${next.name}</button>` : ""}
    <button class="btn ghost" id="home">ホームに戻る</button>`;
  if (next) document.getElementById("nextTerm").onclick = () => startTerm(next.id);
  document.getElementById("home").onclick = goHome;
  window.scrollTo(0, 0);
}

// ---- 通知の設定（config.json を GitHub に保存し、Actions がその時刻に Discord へ送る）----
const TOKEN_KEY = "toeic-daily-token";
function repoInfo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const name = location.pathname.split("/").filter(Boolean)[0];
  return m && name ? { owner: m[1], repo: name } : { owner: "4ratama", repo: "daily-toeic" };
}
function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
async function gh(path, opts = {}) {
  const { owner, repo } = repoInfo();
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const msg = res.status === 401 ? "トークンが正しくないか、期限が切れています。"
      : res.status === 403 || res.status === 404 ? "トークンの権限が足りません（Contents と Actions の Read and write が必要です）。"
      : `GitHubとの通信に失敗しました（${res.status}）。`;
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}
const b64encode = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64decode = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));

async function loadConfig() {
  if (getToken()) {
    try { const f = await gh("/contents/config.json"); return { cfg: JSON.parse(b64decode(f.content)), sha: f.sha }; } catch (e) {}
  }
  try { const r = await fetch("config.json", { cache: "no-cache" }); return { cfg: await r.json(), sha: null }; }
  catch (e) { return { cfg: { times: ["07:30", "21:00"], days: "everyday" }, sha: null }; }
}

async function settings() {
  app.innerHTML = `<div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">通知の設定</span></div><div class="card">読み込み中…</div>`;
  document.getElementById("back").onclick = goHome;
  const { cfg } = await loadConfig();
  let times = (cfg.times || []).slice();
  const render = (msg = "") => {
    app.innerHTML = `
      <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">通知の設定</span></div>
      <div class="card">
        <h2>Discordに通知する時刻</h2>
        <div class="muted">通学の時間に合わせて最大5つまで。最初の時刻は「今日の5ターム」、2つ目以降は「続きをやろう」の通知になります。実際の通知は数分〜十数分遅れることがあります。</div>
        <div id="times">${times.map((t, i) => `
          <div class="row"><input type="time" value="${t}" data-i="${i}" class="time"><button class="link del" data-i="${i}">削除</button></div>`).join("")}
        </div>
        ${times.length < 5 ? `<button class="btn ghost" id="add">＋ 時刻を追加</button>` : ""}
        <h2 style="margin-top:18px">通知する曜日</h2>
        <select id="days" class="input">
          <option value="everyday" ${cfg.days === "everyday" ? "selected" : ""}>毎日</option>
          <option value="weekdays" ${cfg.days === "weekdays" ? "selected" : ""}>平日のみ（月〜金）</option>
          <option value="weekends" ${cfg.days === "weekends" ? "selected" : ""}>週末のみ（土日）</option>
        </select>
      </div>
      <div class="card">
        <h2>GitHubのトークン</h2>
        <div class="muted">設定を保存するために最初に1回だけ入力します。この端末の中だけに保存されます。作り方はREADMEを見てください。</div>
        <input type="password" id="token" class="input" placeholder="github_pat_..." value="${esc(getToken())}" autocomplete="off">
      </div>
      ${msg ? `<div class="exp">${msg}</div>` : ""}
      <button class="btn" id="save">保存する</button>
      <button class="btn ghost" id="test">テスト通知を今すぐ送る</button>`;
    document.getElementById("back").onclick = goHome;
    const sync = () => {
      times = [...app.querySelectorAll(".time")].map(x => x.value).filter(Boolean);
      cfg.days = document.getElementById("days").value;
      setToken(document.getElementById("token").value.trim());
    };
    app.querySelectorAll(".del").forEach(b => b.onclick = () => { sync(); times.splice(+b.dataset.i, 1); render(); });
    const add = document.getElementById("add");
    if (add) add.onclick = () => { sync(); times.push("12:00"); render(); };
    document.getElementById("save").onclick = async () => {
      sync();
      if (!getToken()) return render("先にGitHubのトークンを入力してください。");
      const next = { times: [...new Set(times)].sort(), days: cfg.days };
      try {
        let sha = null;
        try { sha = (await gh("/contents/config.json")).sha; } catch (e) {}
        await gh("/contents/config.json", { method: "PUT", body: JSON.stringify({
          message: "Update notification times from the app", content: b64encode(JSON.stringify(next, null, 2) + "\n"), ...(sha ? { sha } : {}) }) });
        times = next.times;
        render(`<b class="ok">保存しました。</b>次の通知から、${times.join("、") || "（なし）"} に届きます。`);
      } catch (e) { render(`<b class="ng">保存できませんでした。</b>${esc(e.message)}`); }
    };
    document.getElementById("test").onclick = async () => {
      sync();
      if (!getToken()) return render("先にGitHubのトークンを入力してください。");
      try {
        await gh("/actions/workflows/notify.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { test: "true" } }) });
        render(`<b class="ok">送信を依頼しました。</b>1〜2分でDiscordに届きます。`);
      } catch (e) { render(`<b class="ng">送れませんでした。</b>${esc(e.message)}`); }
    };
  };
  render();
}

function goHome() { history.replaceState(null, "", location.pathname); home(); }

async function init() {
  try {
    const r = await fetch("questions.json", { cache: "no-cache" });
    BANK = await r.json();
  } catch (e) {
    app.innerHTML = `<div class="card">問題データを読み込めませんでした。通信状況を確認して再読み込みしてください。</div>`;
    return;
  }
  const t = +new URLSearchParams(location.search).get("term");
  if (TERMS.some(x => x.id === t)) startTerm(t); else home();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
