// ボットの動作確認（Discord と Cloudflare を使わず、ローカルで偽の環境を作って試す）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { runSchedule, buildQuestion, questionMessage, answeredMessage } from "../src/worker.js";

const BANK = JSON.parse(readFileSync(new URL("../../questions.json", import.meta.url), "utf8"));
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.endsWith("questions.json")) return new Response(JSON.stringify(BANK));
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, method: init.method, body });
  if (url.endsWith("/threads")) return Response.json({ id: `th${calls.length}` });
  return Response.json({ id: "m1" });
};
const kvStore = new Map();
const KV = {
  get: async (k, t) => (kvStore.has(k) ? (t === "json" ? JSON.parse(kvStore.get(k)) : kvStore.get(k)) : null),
  put: async (k, v) => { kvStore.set(k, v); },
};
const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("hex");
const env = { KV, DISCORD_PUBLIC_KEY: pub, DISCORD_TOKEN: "tok", DISCORD_APPLICATION_ID: "app", APP_URL: "https://4ratama.github.io/daily-toeic/" };
const waits = [];
const ctx = { waitUntil: p => waits.push(p) };
async function send(ix, sign = true) {
  const body = JSON.stringify(ix), ts = "1700000000";
  const sig = Buffer.from(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(ts + body))).toString("hex");
  const res = await worker.fetch(new Request("https://x/", { method: "POST", body,
    headers: { "X-Signature-Ed25519": sign ? sig : "00".repeat(64), "X-Signature-Timestamp": ts } }), env, ctx);
  await Promise.all(waits.splice(0));
  return { status: res.status, data: res.status === 200 ? await res.json() : null };
}

test("署名が正しくないと拒否、PINGには応答", async () => {
  assert.equal((await send({ type: 1 }, false)).status, 401);
  assert.deepEqual((await send({ type: 1 })).data, { type: 1 });
});

test("/setup でPart別スレッドを4つ作り、各スレッドに出題", async () => {
  const r = await send({ type: 2, token: "t", guild_id: "g", channel_id: "c1", channel: { type: 0 }, member: { user: { id: "u1" } }, data: { name: "setup" } });
  assert.equal(r.data.type, 5);
  const threads = calls.filter(c => c.url.endsWith("/channels/c1/threads"));
  assert.equal(threads.length, 4);
  assert.deepEqual(threads.map(t => t.body.name), ["📘 Part 5 文法", "📘 Part 5 語彙", "📘 Part 7 読解", "📘 Part 7 言い換え"]);
  const cfg = JSON.parse(kvStore.get("cfg"));
  assert.equal(cfg.channelId, "c1"); assert.equal(cfg.userId, "u1");
  assert.equal(Object.keys(cfg.threads).length, 4);
  const edit = calls.find(c => c.url.endsWith("/messages/@original"));
  assert.match(edit.body.content, /準備ができました/);
});

test("曜日→時→分で時刻を追加し、削除できる", async () => {
  const home = await send({ type: 2, data: { name: "remind" } });
  assert.equal(home.data.data.flags, 64);
  let r = await send({ type: 3, data: { custom_id: "rd|days", values: ["1", "3"] } });
  assert.equal(r.data.type, 7);
  assert.match(r.data.data.content, /月・水/);
  assert.equal(r.data.data.flags, undefined);
  const hourSel = r.data.data.components[0].components[0];
  assert.equal(hourSel.custom_id, "rd|h|13"); assert.equal(hourSel.options.length, 24);
  r = await send({ type: 3, data: { custom_id: "rd|h|13", values: ["6"] } });
  assert.equal(r.data.data.components[0].components[0].custom_id, "rd|m|13|6");
  r = await send({ type: 3, data: { custom_id: "rd|m|13|6", values: ["45"] } });
  assert.match(r.data.data.content, /\*\*06:45\*\* を追加/);
  let cfg = JSON.parse(kvStore.get("cfg"));
  assert.deepEqual(cfg.schedule[1], ["06:45", "07:30", "21:00"]);
  assert.deepEqual(cfg.schedule[2], ["07:30", "21:00"]);
  r = await send({ type: 3, data: { custom_id: "rd|delmenu" } });
  assert.ok(r.data.data.components[0].components[0].options.some(o => o.value === "3-06:45"));
  r = await send({ type: 3, data: { custom_id: "rd|del", values: ["3-06:45", "0-21:00"] } });
  cfg = JSON.parse(kvStore.get("cfg"));
  assert.deepEqual(cfg.schedule[3], ["07:30", "21:00"]);
  assert.deepEqual(cfg.schedule[0], ["07:30"]);
});

test("全Partの問題がボタン付きで作れて、答えると正誤と解説が出る", () => {
  for (const kind of ["grammar", "vocab", "reading", "para"]) {
    for (const it of BANK[kind]) {
      const subs = kind === "reading" ? it.questions.length : 1;
      for (let s = 0; s < subs; s++) {
        const q = buildQuestion(BANK, kind, it.id, s);
        const msg = questionMessage(q);
        const btns = msg.components[0].components;
        assert.equal(btns.length, q.choices.length);
        for (const b of btns) assert.ok(b.custom_id.length <= 100 && b.label.length <= 80, b.custom_id);
        // ボタンの custom_id から問題を復元できる
        const [, , qid, sub, ord] = btns[0].custom_id.split("|");
        const kindOf = { g: "grammar", v: "vocab", r: "reading", p: "para" };
        const again = buildQuestion(BANK, kind, qid, Number(sub), kind === "para" ? ord.split(".") : ord.split("").map(Number));
        assert.equal(again.choices[again.answer], kind === "para" ? it.answer : (kind === "reading" ? it.questions[s] : it).choices[0]);
        const done = answeredMessage(again, again.answer, msg);
        assert.match(done.embeds[0].fields[0].name, /正解/);
        assert.equal(done.components[0].components[again.answer].style, 3);
      }
    }
  }
});

test("ボタンで解答 → 次の問題がスレッドに届く（長文は次の設問へ）", async () => {
  const q = buildQuestion(BANK, "reading", "r001", 0);
  const msg = questionMessage(q);
  const wrong = (q.answer + 1) % 4;
  let r = await send({ type: 3, token: "t2", message: msg, data: { custom_id: msg.components[0].components[wrong].custom_id } });
  assert.equal(r.data.type, 7);
  assert.match(r.data.data.embeds[0].fields[0].name, /不正解/);
  const next = r.data.data.components[1].components[0];
  assert.equal(next.custom_id, "n|r|r001|1");
  calls.length = 0;
  r = await send({ type: 3, token: "t2", message: r.data.data, data: { custom_id: next.custom_id } });
  assert.equal(r.data.data.components.length, 1); // 「次へ」ボタンが消える
  const fu = calls.find(c => c.url.endsWith("/webhooks/app/t2"));
  assert.match(fu.body.embeds[0].description, /Q2\/3/);
});

test("リマインドは曜日の時刻に1回だけ送り、その日の最初は各スレッドに出題", async () => {
  // 2026-11-09 は月曜。cfg.schedule[1] = 06:45, 07:30, 21:00（前のテストで追加）
  const at = (hm) => Date.parse(`2026-11-09T${hm}:00+09:00`);
  calls.length = 0;
  assert.equal(await runSchedule(env, at("06:40")), "送る時刻なし");
  assert.equal(await runSchedule(env, at("06:47")), "送信: 06:45");
  const posts = calls.filter(c => c.method === "POST");
  assert.match(posts[0].body.content, /<@u1> ☀️/);
  assert.equal(posts.length, 5); // チャンネル1 + スレッド4
  calls.length = 0;
  assert.equal(await runSchedule(env, at("06:52")), "送る時刻なし");
  assert.equal(await runSchedule(env, at("07:31")), "送信: 07:30");
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.content, /⏰ \*\*07:30\*\*/);
  // 火曜（2026-11-10）は 06:45 を設定していない
  assert.equal(await runSchedule(env, Date.parse("2026-11-10T06:47:00+09:00")), "送る時刻なし");
});

test("/quiz はPartのスレッド内ならそのPartから出す", async () => {
  const cfg = JSON.parse(kvStore.get("cfg"));
  const r = await send({ type: 2, channel_id: cfg.threads.vocab, data: { name: "quiz" } });
  assert.match(r.data.data.components[0].components[0].custom_id, /^a\|v\|/);
  const r2 = await send({ type: 2, channel_id: "c1", data: { name: "quiz", options: [{ name: "part", value: "para" }] } });
  assert.match(r2.data.data.components[0].components[0].custom_id, /^a\|p\|/);
});
