// Discordのウェブフックに「今日の学習」の通知を送る（GitHub Actionsから実行）
const url = process.env.DISCORD_WEBHOOK_URL;
const app = process.env.APP_URL;
const slot = process.env.SLOT || "morning";
if (!url) { console.error("DISCORD_WEBHOOK_URL が設定されていません"); process.exit(1); }

const now = new Date(Date.now() + 9 * 3600 * 1000); // 日本時間
const date = `${now.getUTCMonth() + 1}月${now.getUTCDate()}日`;
const tips = [
  "倒置の合図：Only / Not only / Hardly / No sooner / Should / Had が文頭に来たら疑問文の語順。",
  "that節が原形になる動詞：ask, request, insist, recommend, suggest, require。",
  "前置詞か接続詞か：後ろが名詞なら despite / because of、S+Vなら although / because。",
  "比較級の強調は much / far / even / still。very は使えない。",
  "Each / Every / Most of + 不可算名詞 は単数扱い。",
  "非制限用法（カンマの後）では that は使えない。",
  "by は期限（までに）、until は継続（までずっと）。",
];
const tip = tips[now.getUTCDate() % tips.length];
const content = slot === "evening"
  ? `🌙 **${date}** まだ残っているタームはありませんか？1ターム5分だけでも続けましょう。\n${app}`
  : `☀️ **${date} の5ターム**（1ターム約5分）\n通学中に1つずつ進めましょう。\n💡 今日の文法ポイント：${tip}\n${app}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "TOEIC Daily", content }),
});
if (!res.ok) { console.error("送信失敗:", res.status, await res.text()); process.exit(1); }
console.log("送信しました:", slot);
