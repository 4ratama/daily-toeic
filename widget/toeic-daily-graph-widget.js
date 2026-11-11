// TOEIC Daily 成長グラフのウィジェット（iPhoneアプリ「Scriptable」用）
// ・予想スコアの推移（グラフ）と、成長度（2週間前との差・7日間の正答率・定着数）を表示します
// ・記録は、アプリの「PCとスマホの記録を同期」で作られる secret Gist から読みます（同期をオンにしておく必要があります）
// ・タップすると学習ページが開きます
// 使い方は README の「成長グラフのウィジェット」を見てください。

const APP = "https://4ratama.github.io/daily-toeic/";
const FILE = "toeic-daily-sync.json";
const MAIN = "toeic-daily-v1";
const TOKEN_KEY = "toeic-daily-gist-token", GIST_KEY = "toeic-daily-gist-id";
const GOAL = 950;
const C = (l, d) => Color.dynamic(new Color(l), new Color(d));
const PAPER = C("#fbf8f1", "#22211e"), INK = C("#34373c", "#e9e5da"), MUTED = C("#7c7f85", "#a6a197");
const BLUE = C("#2f5d8c", "#9cc0e6"), RED = C("#cf4436", "#ff8b78");
// DrawContext の画像はライト・ダークで描き分けられないので、どちらの背景でも読める中間の色にする
const P = { blue: "#4f86bf", red: "#e0604f", line: "#9a978f", muted: "#8f8b82", bar: "#9a978f" };

// ---------- 記録を読む（GitHub の secret Gist） ----------
async function api(path, token) {
  const r = new Request("https://api.github.com" + path);
  r.headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` };
  r.timeoutInterval = 15;
  const json = await r.loadJSON();
  if (r.response && r.response.statusCode >= 400) throw new Error(r.response.statusCode === 401 ? "トークンが正しくないか期限切れです" : `GitHub ${r.response.statusCode}`);
  return json;
}
async function askToken() {
  const a = new Alert();
  a.title = "GitHubのトークン";
  a.message = "アプリの同期で使っているトークン（Gistsの権限つき）を貼ってください。iPhoneのキーチェーンにだけ保存されます。";
  a.addSecureTextField("github_pat_...");
  a.addAction("保存"); a.addCancelAction("やめる");
  if ((await a.present()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) { Keychain.set(TOKEN_KEY, t); if (Keychain.contains(GIST_KEY)) Keychain.remove(GIST_KEY); }
  return t || null;
}
async function loadState(token) {
  let id = Keychain.contains(GIST_KEY) ? Keychain.get(GIST_KEY) : null;
  if (!id) {
    for (let page = 1; page <= 5 && !id; page++) {
      const list = await api(`/gists?per_page=100&page=${page}`, token);
      const g = list.find(x => x.files && x.files[FILE]);
      if (g) id = g.id;
      if (!Array.isArray(list) || list.length < 100) break;
    }
    if (!id) throw new Error("同期の記録が見つかりません。アプリの設定で同期をオンにしてください");
    Keychain.set(GIST_KEY, id);
  }
  const g = await api(`/gists/${id}`, token);
  const f = g.files && g.files[FILE];
  if (!f) { Keychain.remove(GIST_KEY); throw new Error("同期の記録が見つかりません"); }
  const text = f.truncated ? await new Request(f.raw_url).loadString() : f.content;
  return JSON.parse(text).keys[MAIN] || {};
}
// 通信できないときのために、最後に読めた記録を端末に残す
const fm = FileManager.local(), cachePath = fm.joinPath(fm.cacheDirectory(), "toeic-daily-graph.json");
function saveCache(s) { try { fm.writeString(cachePath, JSON.stringify({ at: Date.now(), trend: s.trend || {}, log: (s.m && s.m.log) || [], mastered: Object.values(s.items || {}).filter(x => x.mastered).length })); } catch (e) {} }
function readCache() { try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch (e) { return null; } }

// ---------- 数値にする ----------
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayOffset(o) { const d = new Date(); d.setDate(d.getDate() + o); return ymd(d); }
function summarize(data, range) {
  const tr = { ...(data.trend || {}) };
  // 古いアプリの記録（trend なし）でも、直近14日の回答から回答数と正答率は出す
  for (const x of data.log || []) if (!tr[x.d]) tr[x.d] = { n: 0, ok: 0, _log: true };
  for (const x of data.log || []) if (tr[x.d]._log) { tr[x.d].n++; tr[x.d].ok += x.ok; }
  const days = [];
  for (let i = -(range - 1); i <= 0; i++) { const d = dayOffset(i); days.push({ d, ...(tr[d] || {}) }); }
  const preds = Object.keys(tr).sort().filter(d => tr[d].pred != null).map(d => ({ d, v: tr[d].pred }));
  const now = preds[preds.length - 1] || null;
  const diff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const ago = now ? preds.filter(p => diff(p.d, now.d) >= 14).pop() || preds[0] : null;
  const win = (from, to) => { const xs = days.slice(days.length - to, days.length - from); const n = xs.reduce((a, x) => a + (x.n || 0), 0); return { n, acc: n ? xs.reduce((a, x) => a + (x.ok || 0), 0) / n * 100 : null }; };
  return { days, now, ago, w1: win(0, 7), w0: win(7, 14), mastered: data.mastered };
}

// ---------- グラフを描く ----------
function chartImage(sum, w, h, withBars) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const pl = 26, pr = 6, pt = 6, pb = 4, n = sum.days.length;
  const x = i => pl + (n <= 1 ? 0 : i / (n - 1) * (w - pl - pr));
  const pts = sum.days.map((d, i) => ({ i, v: d.pred })).filter(p => p.v != null);
  const lo = pts.length ? Math.max(10, Math.floor((Math.min(...pts.map(p => p.v), GOAL) - 25) / 25) * 25) : 850, hi = 990;
  const y = v => pt + (hi - v) / (hi - lo) * (h - pt - pb);
  ctx.setFont(Font.systemFont(8));
  const label = (v, color) => { ctx.setTextColor(new Color(color)); ctx.drawTextInRect(String(v), new Rect(0, y(v) - 5, pl - 4, 10)); };
  // 1日の回答数（薄い棒）
  if (withBars) {
    const maxN = Math.max(10, ...sum.days.map(d => d.n || 0)), bw = Math.max(1, (w - pl - pr) / n * 0.55);
    ctx.setFillColor(new Color(P.bar, 0.35));
    sum.days.forEach((d, i) => { if (d.n) { const bh = d.n / maxN * (h - pt - pb) * 0.35; ctx.fillRect(new Rect(x(i) - bw / 2, h - pb - bh, bw, bh)); } });
  }
  // 目盛り・目標線
  for (const v of [lo, hi]) {
    const p = new Path(); p.move(new Point(pl, y(v))); p.addLine(new Point(w - pr, y(v)));
    ctx.addPath(p); ctx.setStrokeColor(new Color(P.line, 0.5)); ctx.setLineWidth(0.6); ctx.strokePath(); label(v, P.muted);
  }
  for (let sx = pl; sx < w - pr; sx += 7) {
    const p = new Path(); p.move(new Point(sx, y(GOAL))); p.addLine(new Point(Math.min(sx + 4, w - pr), y(GOAL)));
    ctx.addPath(p); ctx.setStrokeColor(new Color(P.red, 0.85)); ctx.setLineWidth(1); ctx.strokePath();
  }
  label(GOAL, P.red);
  // 予想スコアの線
  if (pts.length) {
    const p = new Path();
    pts.forEach((q, k) => { const pt2 = new Point(x(q.i), y(q.v)); if (k) p.addLine(pt2); else p.move(pt2); });
    ctx.addPath(p); ctx.setStrokeColor(new Color(P.blue)); ctx.setLineWidth(2); ctx.strokePath();
    const last = pts[pts.length - 1];
    ctx.setFillColor(new Color(P.blue)); ctx.fillEllipse(new Rect(x(last.i) - 3, y(last.v) - 3, 6, 6));
  } else {
    ctx.setTextColor(new Color(P.muted)); ctx.setFont(Font.systemFont(10));
    ctx.drawTextInRect("40問解くと予想スコアの記録が始まります", new Rect(pl, h / 2 - 8, w - pl - pr, 16));
  }
  return ctx.getImage();
}

// ---------- ウィジェット ----------
function text(stack, s, font, color) { const t = stack.addText(String(s)); t.font = font; t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.7; return t; }
function signed(v, unit = "") { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}${unit}`; }
function header(w, note) {
  const head = w.addStack(); head.centerAlignContent();
  text(head, "TOEIC Daily", Font.boldSystemFont(12), BLUE);
  head.addSpacer();
  text(head, note, Font.mediumSystemFont(10), MUTED);
}
function scoreBlock(stack, sum, big) {
  text(stack, "予想スコア（目安）", Font.mediumSystemFont(10), MUTED);
  text(stack, sum.now ? sum.now.v : "—", Font.boldRoundedSystemFont(big), INK);
  if (sum.now && sum.ago && sum.ago !== sum.now) {
    const d = sum.now.v - sum.ago.v;
    text(stack, `${signed(d)}（${+sum.ago.d.slice(5, 7)}/${+sum.ago.d.slice(8)}から）`, Font.semiboldSystemFont(11), d >= 0 ? RED : MUTED);
  }
}
function statLine(stack, label, value, delta) {
  const r = stack.addStack(); r.centerAlignContent();
  text(r, label, Font.systemFont(10), MUTED); r.addSpacer(4);
  text(r, value, Font.semiboldSystemFont(12), INK);
  if (delta) { r.addSpacer(3); text(r, delta, Font.mediumSystemFont(10), delta.startsWith("−") ? MUTED : RED); }
}
async function build() {
  const fam = config.widgetFamily || "medium";
  const w = new ListWidget();
  w.backgroundColor = PAPER; w.setPadding(12, 14, 12, 14); w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 60 * 60000); // 1時間ごと（iOSの都合で前後します）

  let token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
  if (config.runsInApp && token) {
    const a = new Alert();
    a.title = "TOEIC 成長"; a.addAction("プレビューを見る"); a.addAction("トークンを入れ直す");
    if ((await a.present()) === 1) token = await askToken() || token;
  }
  if (!token && config.runsInApp) token = await askToken();
  let data = null, note = "";
  if (token) {
    try {
      const s = await loadState(token); saveCache(s);
      data = { trend: s.trend || {}, log: (s.m && s.m.log) || [], mastered: Object.values(s.items || {}).filter(x => x.mastered).length };
    } catch (e) { note = e.message; }
  }
  if (!data) { const c = readCache(); if (c) { data = c; note = note ? "前回の記録を表示中" : ""; } }
  if (!data) {
    header(w, "");
    w.addSpacer();
    text(w, token ? note || "記録を読めませんでした" : "Scriptableでこのスクリプトを開き、トークンを入れてください", Font.mediumSystemFont(12), INK).lineLimit = 4;
    w.addSpacer();
    return w;
  }
  const sum = summarize(data, fam === "small" ? 14 : 30);
  const now = new Date();
  header(w, note || `${now.getMonth() + 1}/${now.getDate()} 更新`);
  w.addSpacer(4);
  if (fam === "small") {
    scoreBlock(w, sum, 30);
    w.addSpacer(2);
    w.addImage(chartImage(sum, 130, 44, false)).imageSize = new Size(130, 44);
    w.addSpacer(2);
    if (sum.w1.acc !== null) statLine(w, "正答率7日", `${Math.round(sum.w1.acc)}%`, sum.w0.acc !== null ? signed(sum.w1.acc - sum.w0.acc, "pt") : "");
  } else {
    const row = w.addStack(); row.topAlignContent();
    const left = row.addStack(); left.layoutVertically(); left.size = new Size(112, 0);
    scoreBlock(left, sum, fam === "large" ? 36 : 30);
    left.addSpacer(6);
    if (sum.w1.acc !== null) statLine(left, "正答率7日", `${Math.round(sum.w1.acc)}%`, sum.w0.acc !== null ? signed(sum.w1.acc - sum.w0.acc, "pt") : "");
    statLine(left, "回答7日", `${sum.w1.n}問`, "");
    if (data.mastered != null) statLine(left, "定着", `${data.mastered}問`, "");
    row.addSpacer(6);
    const cw = 180, ch = fam === "large" ? 120 : 104;
    row.addImage(chartImage(sum, cw, ch, true)).imageSize = new Size(cw, ch);
    if (fam === "large") {
      w.addSpacer(8);
      text(w, "棒：1日の回答数　青線：予想スコア　赤点線：目標950", Font.systemFont(10), MUTED);
    }
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
