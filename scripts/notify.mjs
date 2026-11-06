// 通知の送信（GitHub Actionsから10分ごとに実行）
// config.json の時刻を過ぎていて、今日まだ送っていない通知だけを送る。
// 送った記録は state/sent.json に残し、二重送信を防ぐ。
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DISCORD_WEBHOOK_URL;
const app = process.env.APP_URL;
const force = process.env.FORCE === "true"; // 手動テスト：時刻に関係なく1通送る
if (!url) { console.error("DISCORD_WEBHOOK_URL が設定されていません"); process.exit(1); }

const cfg = JSON.parse(readFileSync("config.json", "utf8"));
const state = JSON.parse(readFileSync("state/sent.json", "utf8"));

const now = new Date(Date.now() + 9 * 3600 * 1000); // 日本時間
const ymd = now.toISOString().slice(0, 10);
const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
const weekday = now.getUTCDay(); // 0=日
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const times = [...new Set((cfg.times || []).filter(t => /^\d{2}:\d{2}$/.test(t)))].sort();
const WINDOW = 90; // Actionsの遅延を見込み、予定時刻から90分以内なら送る

const dayOk = cfg.days === "weekdays" ? weekday >= 1 && weekday <= 5
  : cfg.days === "weekends" ? weekday === 0 || weekday === 6 : true;

const sentToday = state.sent[ymd] || [];
const due = force ? ["test"] : dayOk
  ? times.filter(t => !sentToday.includes(t) && minutes >= toMin(t) && minutes < toMin(t) + WINDOW)
  : [];
if (!due.length) { console.log("送る通知はありません"); process.exit(0); }

const tips = [
  "倒置の合図：Only / Not only / Hardly / No sooner / Should / Had が文頭に来たら疑問文の語順。",
  "that節が原形になる動詞：ask, request, insist, recommend, suggest, require。",
  "前置詞か接続詞か：後ろが名詞なら despite / because of、S+Vなら although / because。",
  "比較級の強調は much / far / even / still。very は使えない。",
  "Each / Every / Most of + 不可算名詞 は単数扱い。",
  "非制限用法（カンマの後）では that は使えない。",
  "by は期限（までに）、until は継続（までずっと）。",
];
const date = `${now.getUTCMonth() + 1}月${now.getUTCDate()}日`;
const tip = tips[now.getUTCDate() % tips.length];

for (const t of due) {
  const first = t === "test" || t === times[0];
  const content = t === "test"
    ? `🔔 テスト通知です。この通知が届いていれば設定は完了です。\n${app}`
    : first
      ? `☀️ **${date} の5ターム**（1ターム約5分）\n移動中に1つずつ進めましょう。\n💡 今日の文法ポイント：${tip}\n${app}`
      : `⏰ **${t}** の学習時間です。残っているタームを1つ進めましょう。\n${app}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "TOEIC Daily", content }),
  });
  if (!res.ok) { console.error("送信失敗:", res.status, await res.text()); process.exit(1); }
  console.log("送信しました:", t);
  if (t !== "test") sentToday.push(t);
}

// 今日の分だけ残す
state.sent = { [ymd]: sentToday };
writeFileSync("state/sent.json", JSON.stringify(state, null, 1) + "\n");
