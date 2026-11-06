// TOEIC Daily ホーム画面ウィジェット（iPhoneアプリ「Scriptable」用）
// ・今日の1問（Discordの朝の通知と同じ問題）と、次の学習時刻を表示します
// ・タップすると学習ページが開きます
// 使い方は README の「iPhoneのホーム画面ウィジェット」を見てください。

const APP = "https://4ratama.github.io/daily-toeic/";
const PAPER = new Color("#fbf8ef"), INK = new Color("#2b2b33"), MUTED = new Color("#7a7468"), ACCENT = new Color("#2f6fde");

async function loadJSON(path) {
  const r = new Request(APP + path + "?t=" + Date.now());
  r.timeoutInterval = 10;
  return await r.loadJSON();
}

function jstNow() { return new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000); }

async function build() {
  const w = new ListWidget();
  w.backgroundColor = PAPER;
  w.setPadding(12, 14, 12, 14);
  w.url = APP;
  const now = jstNow();

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("TOEIC Daily");
  title.font = Font.boldSystemFont(13); title.textColor = ACCENT;
  head.addSpacer();
  const date = head.addText(`${now.getMonth() + 1}/${now.getDate()}`);
  date.font = Font.mediumSystemFont(12); date.textColor = MUTED;
  w.addSpacer(6);

  try {
    const [bank, cfg] = await Promise.all([loadJSON("questions.json"), loadJSON("config.json").catch(() => ({ times: [] }))]);
    const g = bank.grammar;
    const dayNo = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const q = g[dayNo % g.length];
    const fam = config.widgetFamily || "medium";

    const label = w.addText("今日の1問（Part 5）");
    label.font = Font.semiboldSystemFont(11); label.textColor = MUTED;
    w.addSpacer(2);
    const qt = w.addText(q.q);
    qt.font = Font.systemFont(fam === "small" ? 12 : 14); qt.textColor = INK;
    qt.minimumScaleFactor = 0.7; qt.lineLimit = fam === "small" ? 4 : 3;

    w.addSpacer();
    // 次の学習時刻（config.json の通知時刻）
    const mins = now.getHours() * 60 + now.getMinutes();
    const times = (cfg.times || []).slice().sort();
    const next = times.find(t => { const [h, m] = t.split(":").map(Number); return h * 60 + m > mins; });
    const foot = w.addText(next ? `次の学習 ${next}　タップして解く ›` : "1タームだけでも記録が続きます ›");
    foot.font = Font.mediumSystemFont(11); foot.textColor = ACCENT;
  } catch (e) {
    const t = w.addText("今日の5タームをはじめよう ›");
    t.font = Font.boldSystemFont(15); t.textColor = INK;
  }
  // 30分ごとに更新（iOSの都合で前後します）
  w.refreshAfterDate = new Date(Date.now() + 30 * 60000);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
