// 通知の送信（GitHub Actionsから10分ごとに実行）
// config.json の時刻を過ぎていて、今日まだ送っていない通知だけを送る。
// 送った記録は state/sent.json に残し、二重送信を防ぐ。
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DISCORD_WEBHOOK_URL;
const app = (process.env.APP_URL || "").replace(/\?v=([0-9a-f]{7})[0-9a-f]*/, "?v=$1"); // 版番号は短く
const force = process.env.FORCE === "true"; // 手動テスト：時刻に関係なく1通送る
if (!url) {
  // 未設定のうちは定期実行を失敗扱いにしない（失敗メールが10分ごとに届くのを防ぐ）。手動テストだけ失敗にする。
  console.error("DISCORD_WEBHOOK_URL が設定されていません。リポジトリの Settings → Secrets and variables → Actions で登録してください。");
  process.exit(force ? 1 : 0);
}

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
const WD = "日月火水木金土";
const date = `${now.getUTCMonth() + 1}月${now.getUTCDate()}日（${WD[weekday]}）`;
const tip = tips[now.getUTCDate() % tips.length];

// 今日の1問（文法からその日ごとに1問。答えはタップで開くネタバレ表示）
function questionOfDay() {
  try {
    const bank = JSON.parse(readFileSync("questions.json", "utf8")).grammar;
    const q = bank[Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000) % bank.length];
    const L = "ABCD";
    // 選択肢の並びは日付で決まった順に入れ替える（1番目が必ず正解にならないように）
    const order = [0, 1, 2, 3].sort((a, b) => ((a * 7 + now.getUTCDate()) % 4) - ((b * 7 + now.getUTCDate()) % 4));
    const choices = order.map((k, i) => `**${L[i]}**　${q.choices[k]}`).join("\n");
    const ans = L[order.indexOf(0)];
    return { name: "🧩 今日の1問（Part 5）", value: `${q.q}\n\n${choices}\n\n答え：||**${ans}**　${q.choices[0]}　／　${q.point || ""}||` };
  } catch (e) { return null; }
}

const COLOR = { morning: 0x2f6fde, reminder: 0xf2994a, test: 0x27ae60 };
function message(t) {
  const open = `👉 **[アプリを開いて学習する](${app})**`;
  // テスト送信は、朝の通知と同じ見た目で送る（見え方の確認用）
  if (t === "test" || t === times[0]) {
    const q = questionOfDay();
    return {
      content: t === "test" ? "🔔 テスト送信（毎朝こんな形で届きます）" : `☀️ おはようございます！ ${date} の学習の時間です`,
      embeds: [{
        title: `📚 ${date} の5ターム`, url: app, color: COLOR.morning,
        description: [
          "⏱️ 1ターム約5分。通学中に1つずつ進めましょう。",
          "",
          "**今日のメニュー**",
          "1️⃣ 文法（Part 5）　6問",
          "2️⃣ 語彙（Part 5）　6問",
          "3️⃣ 長文読解（Part 7）　3問",
          "4️⃣ 言い換え単語　8問",
          "5️⃣ 復習　最大12問",
        ].join("\n"),
        fields: [
          { name: "💡 今日の文法ポイント", value: tip },
          ...(q ? [q] : []),
          { name: "​", value: open },
        ],
        footer: { text: "1タームだけでも連続記録が続きます 🔥" },
      }],
    };
  }
  return {
    content: `⏰ ${t} になりました。学習の時間です`,
    embeds: [{
      title: "🔥 今日の連続記録をつなげよう", url: app, color: COLOR.reminder,
      description: [
        "まだ残っているタームはありませんか？",
        "",
        "✅ 1ターム（約5分）だけでも記録が続きます",
        "🌙 間違えた問題は「帰りの復習」でもう一度",
        "",
        open,
      ].join("\n"),
    }],
  };
}

for (const t of due) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "TOEIC Daily", ...message(t) }),
  });
  if (!res.ok) { console.error("送信失敗:", res.status, await res.text()); process.exit(1); }
  console.log("送信しました:", t);
  if (t !== "test") sentToday.push(t);
}

// 今日の分だけ残す
state.sent = { [ymd]: sentToday };
writeFileSync("state/sent.json", JSON.stringify(state, null, 1) + "\n");
