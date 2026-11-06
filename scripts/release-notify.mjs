// GitHub Pages の公開が終わったら、Discordに最新版のURLを送る。
// URLに ?v=コミット番号 を付けて、Discordのアプリ内ブラウザでも古い画面が出ないようにする。
import { execSync } from "node:child_process";

const url = process.env.DISCORD_WEBHOOK_URL;
const app = process.env.APP_URL;
const sha = process.env.SHA;
if (!url) { console.log("DISCORD_WEBHOOK_URL が未設定のため送りません"); process.exit(0); }

const sh = c => execSync(c, { encoding: "utf8" }).trim();
const short = sha.slice(0, 7);
// マージコミットなら1つ目の親との差分（＝取り込まれた変更全体）
const files = sh(`git diff --name-only ${sha}^1 ${sha}`).split("\n").filter(Boolean);
// 学習画面に関係しない変更（送信記録・通知時刻・ボット・説明書）だけなら送らない
const ignore = f => f.startsWith("state/") || f === "config.json" || f.startsWith("bot/") || f.startsWith(".github/") || f.startsWith("scripts/") || f.endsWith(".md");
const changed = files.filter(f => !ignore(f));
if (!changed.length && process.env.FORCE !== "true") { console.log("画面に関係する変更がないため送りません:", files.join(", ")); process.exit(0); }

// マージなら取り込まれたコミット、そうでなければそのコミットの件名を並べる
const isMerge = sh(`git rev-list --parents -n 1 ${sha}`).split(" ").length > 2;
const subjects = (isMerge ? sh(`git log --format=%s ${sha}^1..${sha}^2`) : sh(`git log -1 --format=%s ${sha}`))
  .split("\n").filter(Boolean).slice(0, 5);
const what = [];
if (changed.some(f => f === "questions.json")) what.push("問題データ");
if (changed.some(f => /\.(css|svg|png)$/.test(f) || f === "fx.js" || f === "index.html")) what.push("デザイン");
if (changed.some(f => f === "app.js" || f === "sw.js")) what.push("機能");

const link = `${app}?v=${short}`;
const content = [
  `🆕 **アプリを更新しました**（${what.join("・") || "その他"}）`,
  ...subjects.map(s => `・${s}`),
  `新しい画面はこちらから開いてください👇`,
  link,
].join("\n");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "TOEIC Daily", content }),
});
if (!res.ok) { console.error("送信失敗:", res.status, await res.text()); process.exit(1); }
console.log("送信しました:", link);
