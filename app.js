"use strict";
// TOEIC Daily: 1日5ターム（各約5分）。学習記録はこの端末のブラウザに保存されます。

const STORE_KEY = "toeic-daily-v1";

// ---- 忘却曲線に基づく反復ルール ----
// stage 0〜6。正解かつ「自信あり」かつ制限時間内で1段上がる。0日＝当日の帰りに再出題。
const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
const MAX_STAGE = 6;
const MASTER_NEED = { grammar: 2, vocab: 1, para: 1, reading: 1 }; // stage 6 で正解した回数がこれに達したら定着
const TIME_LIMIT = { grammar: 20, vocab: 20, para: 10, reading: 180 }; // 秒（長文は3問合計）
const REVIEW_MAX = 12;

const TERMS = [
  { id: 1, name: "文法（Part 5）", desc: "時制・関係詞・倒置など 6問", kind: "grammar", n: 6 },
  { id: 2, name: "語彙（Part 5）", desc: "語法・コロケーション 6問", kind: "vocab", n: 6 },
  { id: 3, name: "長文読解（Part 7）", desc: "短い文書を読んで 3問", kind: "reading", n: 1 },
  { id: 4, name: "言い換え単語", desc: "同義語を素早く選ぶ 8問", kind: "para", n: 8 },
  { id: 5, name: "復習", desc: "期限が来た問題（最大12問）", kind: "review", n: REVIEW_MAX },
];
const WRONGS = { id: 7, name: "要復習の問題を解く", desc: "最後に間違えた問題だけ（最大12問）", kind: "wrongs" };
const EVENING = { id: 6, name: "帰りの復習", desc: "今日間違えた問題をもう一度", kind: "evening" };
// 各問題が TOEIC のどの大問にあたるか
const QUESTION_PART = {
  grammar: { part: 5, label: "Part 5 短文穴埋め・文法", note: "1文の空所に入る語句を4択で選ぶ。本番は30問、1問20秒が目安。" },
  vocab: { part: 5, label: "Part 5 短文穴埋め・語彙", note: "意味・語法・コロケーションで選ぶ語彙問題。Part 5 の約半分を占める。" },
  para: { part: 7, label: "Part 7 読解・言い換え語彙", note: "本文と設問・選択肢は別の言葉で言い換えられる。同義語問題としても出る。" },
  reading: { part: 7, label: "Part 7 読解（シングルパッセージ）", note: "メール・告知・広告などを読んで答える。本番は54問、1問約1分が目安。" },
};
// ホームの「パート別ガイド」
const PARTS = [
  { n: 1, sec: "Listening", name: "写真描写", count: "6問", time: "約5分",
    what: "写真について流れる4つの英文から、最も適切に描写しているものを選ぶ。",
    trend: "人物の動作（is -ing）、物の状態（has been placed、is being ～の違い）が中心。最近は人物のいない風景写真も多い。",
    tip: "流れる前に写真の「人・物・場所」を見ておく。写っていない物や、推測でしか言えない文は外す。" },
  { n: 2, sec: "Listening", name: "応答問題", count: "25問", time: "約9分",
    what: "質問や発言に対して、最も適切な応答を3つから選ぶ。問題用紙には何も印刷されていない。",
    trend: "疑問詞の質問にそのまま答えない「間接的な応答」（例：「さあ、田中さんに聞いて」）が増えている。",
    tip: "冒頭の疑問詞を確実に聞き取る。質問と同じ単語・似た音の単語が入った選択肢は、ひっかけのことが多い。" },
  { n: 3, sec: "Listening", name: "会話問題", count: "39問（13会話×3問）", time: "約18分",
    what: "2〜3人の会話を聞いて、設問3問に答える。図表を見て答える問題、話し手の意図を問う問題もある。",
    trend: "3人の会話、図表問題、意図問題（\"What does the man mean when he says ～?\"）が毎回出る。",
    tip: "会話が流れる前に、設問3問を先に読んでおく（先読み）。答えはだいたい会話の順に出てくる。" },
  { n: 4, sec: "Listening", name: "説明文問題", count: "30問（10トーク×3問）", time: "約16分",
    what: "電話のメッセージ、アナウンス、ラジオなど1人の話を聞いて、設問3問に答える。",
    trend: "トークの種類はだいたい決まっている。1問目は「目的・話し手は誰か」、3問目は「次に何をするか」が多い。",
    tip: "冒頭の数秒で、トークの種類と場面をつかむ。リスニングが得意な人は、ここで満点を狙う。" },
  { n: 5, sec: "Reading", name: "短文穴埋め", count: "30問", time: "目標10分（1問20秒）",
    what: "1文の空所に入る語句を4つから選ぶ。文法（品詞・時制・関係詞・接続詞）と語彙が約半々。",
    trend: "選択肢が同じ語の品詞違いになる「品詞問題」が最多。前置詞と接続詞の区別、倒置、仮定法も定番。",
    tip: "文全体を訳さず、まず選択肢を見て問題のタイプを判断する。品詞問題なら空所の前後だけで解ける。→ あなたの弱点です。このアプリで毎日集中的に練習します。" },
  { n: 6, sec: "Reading", name: "長文穴埋め", count: "16問（4文書×4問）", time: "目標8分",
    what: "メールや記事の4つの空所に、語句または1文を入れる。",
    trend: "文脈を見ないと決まらない時制・接続副詞（However / Therefore など）、文挿入問題が各文書に1問ある。",
    tip: "空所のある文だけでなく、その前後の文まで読む。文挿入は代名詞や指示語（this, these）がつながりの手がかりになる。" },
  { n: 7, sec: "Reading", name: "読解", count: "54問（1文書29問・複数文書25問）", time: "目標55分",
    what: "メール、広告、記事、チャットなどを読んで答える。2〜3文書を照らし合わせる問題もある。",
    trend: "NOT問題（当てはまらないもの）、同義語問題、意図問題、文挿入問題が毎回出る。複数文書では、2つの文書の情報を組み合わせる問題が必ずある。",
    tip: "設問を先に読み、答えの根拠を本文で探す。正解の選択肢は、本文が言い換えられていることが多い。" },
];
const GENRE_NAMES = { grammar: "文法", vocab: "語彙", reading: "長文読解", para: "言い換え" };

let BANK = null;
let S = load();
const app = document.getElementById("app");

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
  if (!s || !s.items) s = { items: {}, days: {}, picks: {} };
  s.similar = s.similar || {};
  // 旧形式（box）からの移行
  for (const it of Object.values(s.items)) {
    if (it.stage === undefined) {
      it.stage = Math.min(it.box || 0, MAX_STAGE); it.lapses = it.wrong ? 1 : 0; it.mastered_streak = 0;
      it.due_slot = "morning"; delete it.box; delete it.wrong;
    }
  }
  return s;
}
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
  window.dispatchEvent(new Event("toeic:saved")); // sync.js がPC・スマホ間で同期
}
function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
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
function findItem(id) {
  return BANK[genreOf(id)].find(x => x.id === id);
}
function examSoon() {
  if (!S.examDate) return false;
  const d = daysBetween(today(), S.examDate);
  return d >= 0 && d <= 14;
}

// 解答の記録。evening=帰りの復習中の解答（同日に何度も出ないよう、間違えても翌日へ）
function record(id, correct, confident, sec, evening = false) {
  const g = genreOf(id);
  const it = S.items[id] || { stage: 0, lapses: 0, mastered_streak: 0, seen: 0, ok: 0 };
  it.seen++;
  if (correct) it.ok++;
  it.last = { date: today(), correct, confident, sec: Math.round(sec) };
  it.due_slot = "morning";
  if (it.mastered && examSoon()) it.rechecked = true;
  if (!correct) {
    it.stage = 0; it.lapses++; it.mastered_streak = 0; it.mastered = false;
    if (evening) it.due = today(1);
    else { it.due = today(); it.due_slot = "evening"; }
    if (g === "grammar") addSimilar(id);
  } else if (confident && sec <= TIME_LIMIT[g]) {
    if (it.stage >= MAX_STAGE) {
      it.mastered_streak++;
      if (it.mastered_streak >= MASTER_NEED[g]) it.mastered = true;
    } else it.stage++;
    it.due = today(INTERVALS[it.stage]);
  } else {
    // 正解だが迷った・時間超過 → stage 据え置き
    it.due = today(Math.max(1, INTERVALS[it.stage]));
  }
  S.items[id] = it;
  save();
}
// 文法で間違えたら、同じ分野の類題を2問、翌日の復習に追加
function addSimilar(id) {
  const tag = findItem(id).tag;
  const tmr = today(1);
  const queued = new Set(Object.values(S.similar).flat());
  const cands = BANK.grammar.filter(x => x.tag === tag && x.id !== id && !queued.has(x.id) && !(S.items[x.id] && S.items[x.id].mastered));
  const fresh = cands.filter(x => !S.items[x.id]);
  const rest = cands.filter(x => S.items[x.id]);
  const add = [...shuffle(fresh), ...shuffle(rest)].slice(0, 2).map(x => x.id);
  S.similar[tmr] = [...(S.similar[tmr] || []), ...add];
}

// 復習の候補：期限が来た問題（帰りの枠のものを除く）＋類題＋試験前の定着済み再確認
function reviewCandidates(exclude = new Set()) {
  const t = today();
  const similar = new Set(Object.entries(S.similar).filter(([d]) => d <= t).flatMap(([, ids]) => ids));
  const out = [];
  for (const g of ["grammar", "vocab", "para", "reading"]) {
    for (const x of BANK[g]) {
      if (exclude.has(x.id)) continue;
      const it = S.items[x.id];
      const recheck = it && it.mastered && examSoon() && !it.rechecked;
      const due = it && !it.mastered && it.due <= t && !(it.due_slot === "evening" && it.due === t);
      if (due || recheck || similar.has(x.id)) {
        const overdue = it && it.due ? daysBetween(it.due, t) : 0;
        out.push({ x, overdue, g });
      }
    }
  }
  // 期限切れの長い順、同じなら文法を優先
  out.sort((a, b) => b.overdue - a.overdue || (a.g === "grammar" ? -1 : 0) - (b.g === "grammar" ? -1 : 0));
  return out.map(o => o.x);
}

// 新しい問題（未出題 → それもなければ期限の遠い順）
function pickNew(list, n, exclude) {
  const t = today();
  const avail = list.filter(x => !exclude.has(x.id) && !(S.items[x.id] && (S.items[x.id].mastered || S.items[x.id].due <= t)));
  const fresh = shuffle(avail.filter(x => !S.items[x.id])); // 未出題から毎回ランダムに
  const later = avail.filter(x => S.items[x.id]).sort((a, b) => S.items[b.id].due.localeCompare(S.items[a.id].due));
  return [...fresh, ...later].slice(0, n);
}

// その日のタームの問題は一度決めたら固定（途中で閉じても同じ問題で再開できる）
function buildTerm(term) {
  const t = today();
  S.picks[t] = S.picks[t] || {};
  if (S.picks[t][term.id]) return S.picks[t][term.id].map(findItem).filter(Boolean);
  for (const d of Object.keys(S.picks)) if (d !== t) delete S.picks[d];
  for (const d of Object.keys(S.similar)) if (d < today(-7)) delete S.similar[d];
  const used = new Set(Object.values(S.picks[t]).flat());
  let items;
  if (term.kind === "review") {
    items = reviewCandidates(used).slice(0, REVIEW_MAX);
    // 復習が少ない日は文法の新出で6問まで補う
    if (items.length < 6) items = items.concat(pickNew(BANK.grammar, 6 - items.length, new Set([...used, ...items.map(x => x.id)])));
    items = shuffle(items);
  } else {
    let n = term.n;
    // 復習が12問を超える日は、新出の語彙を半分に減らす
    if (term.kind === "vocab" && reviewCandidates(used).length > REVIEW_MAX) n = Math.ceil(n / 2);
    items = pickNew(BANK[term.kind], n, new Set([...used, ...reviewCandidates(used).slice(0, REVIEW_MAX).map(x => x.id)]));
  }
  S.picks[t][term.id] = items.map(x => x.id);
  save();
  return items;
}
// 出た問題の分類：未出題 / 正解（最後に正解） / 要復習（最後に不正解）
function statusOf(id) {
  const it = S.items[id];
  if (!it || !it.last) return it ? (it.lapses ? "wrong" : "correct") : "new";
  return it.last.correct ? "correct" : "wrong";
}
function wrongItems() {
  return ["grammar", "vocab", "para", "reading"].flatMap(g => BANK[g].filter(x => statusOf(x.id) === "wrong"));
}
function statusHtml() {
  const rows = Object.keys(GENRE_NAMES).map(g => {
    const c = { new: 0, correct: 0, wrong: 0 };
    BANK[g].forEach(x => c[statusOf(x.id)]++);
    return `<tr><td>${GENRE_NAMES[g]}</td><td class="st-new">${c.new}</td><td class="st-correct">${c.correct}</td><td class="st-wrong">${c.wrong}</td></tr>`;
  }).join("");
  const w = wrongItems().length;
  return `
    <div class="card status-card">
      <h2>問題の分類</h2>
      <table class="status-table"><tr><th></th><th>未出題</th><th>正解</th><th>要復習</th></tr>${rows}</table>
      <div class="muted">新しい問題は未出題の中からランダムに出ます。最後に間違えた問題は「要復習」に入り、正解すると「正解」に移ります。</div>
      ${w ? `<div class="row2"><button class="btn" id="wrongsGo">要復習を解く（${Math.min(w, 12)}問）</button><button class="btn ghost" id="wrongsList">一覧を見る</button></div>` : ""}
    </div>`;
}
function wrongList() {
  history.replaceState(null, "", "?wrongs=1");
  const items = wrongItems();
  app.innerHTML = `
    <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">要復習の問題（${items.length}問）</span></div>
    ${items.map(x => {
      const g = genreOf(x.id), it = S.items[x.id];
      const q = g === "reading" ? `${x.title}（${x.questions.length}問）` : g === "para" ? `${x.word} ＝ ？` : x.q;
      const ans = g === "reading" ? x.questions.map(y => y.choices[0]).join(" ／ ") : g === "para" ? `${x.answer}（${x.ja}）` : x.choices[0];
      const point = g === "reading" ? x.questions.map(y => y.point).filter(Boolean).join(" ／ ") : x.point;
      return `<div class="card wrong-item">
        <div class="part-badge">${esc(QUESTION_PART[g].label)}${x.tag ? `<span class="part-tag">${esc(x.tag)}</span>` : ""}</div>
        <div class="q">${esc(q)}</div>
        <div><b>正解</b>　${esc(ans)}</div>
        ${point ? `<div class="point">ポイント：${esc(point)}</div>` : ""}
        <div class="muted">間違えた回数 ${it.lapses || 0}回・最後に解いた日 ${it.last ? it.last.date : "-"}</div>
      </div>`;
    }).join("") || `<div class="card">要復習の問題はありません。</div>`}
    ${items.length ? `<button class="btn" id="go">この問題を解く</button>` : ""}
    <button class="btn ghost" id="back2">ホームに戻る</button>`;
  document.getElementById("back").onclick = goHome;
  document.getElementById("back2").onclick = goHome;
  const go = document.getElementById("go"); if (go) go.onclick = () => startTerm(WRONGS.id);
  window.scrollTo(0, 0);
}

// 帰りの復習：今日間違えて、まだやり直していない問題（毎回その場で作る）
function eveningItems() {
  const t = today();
  return Object.entries(S.items)
    .filter(([, it]) => it.due_slot === "evening" && it.due === t)
    .map(([id]) => findItem(id)).filter(Boolean);
}

// 問題を「1問ずつ」の形に展開
function toQuestions(items) {
  const qs = [];
  for (const it of items) {
    const g = genreOf(it.id);
    if (g === "reading") {
      it.questions.forEach((q, i) => qs.push({ id: it.id, g, sub: i, passage: it.passage, title: it.title,
        q: q.q, answer: q.choices[0], choices: shuffle(q.choices), exp: q.exp, point: q.point, last: i === it.questions.length - 1 }));
    } else if (g === "para") {
      const others = shuffle(BANK.para.filter(p => p.id !== it.id && !(it.group && p.group === it.group))).slice(0, 3).map(p => p.answer);
      qs.push({ id: it.id, g, q: `“${it.word}” に最も近い意味は？`, answer: it.answer,
        choices: shuffle([it.answer, ...others]), exp: `${it.word} ＝ ${it.answer}（${it.ja}）。本番では Part 7 の同義語問題や、設問と本文の言い換えとして出てきます。`, point: `${it.word} ＝ ${it.answer}` });
    } else {
      qs.push({ id: it.id, g, q: it.q, answer: it.choices[0], choices: shuffle(it.choices), exp: it.exp, tag: it.tag, point: it.point });
    }
  }
  return qs;
}

// ---- やる気の仕組み（XP・レベル・連続記録・休み券・バッジ・自己ベスト）と弱点分析・予想スコア ----
const XP_CORRECT = 10, XP_ALL_TERMS = 50, FREEZE_MAX = 2, FREEZE_EVERY = 7;
const TITLES = [[1, "Rookie"], [5, "900 Club"], [10, "950 Challenger"], [20, "990 Master"]];
const BADGES = [
  { id: "first_full", icon: "🏁", name: "初めての5ターム完走", desc: "1日で5タームを全部終える" },
  { id: "combo10", icon: "🔥", name: "文法10連続正解", desc: "文法問題を10問続けて正解" },
  { id: "streak7", icon: "📅", name: "7日連続", desc: "7日続けて学習" },
  { id: "streak30", icon: "🗓️", name: "30日連続", desc: "30日続けて学習" },
  { id: "early", icon: "🌅", name: "朝7時台に完了", desc: "朝7時台にタームを終える" },
  { id: "comeback", icon: "↩️", name: "おかえり", desc: "途切れた後に再開する" },
  { id: "speed", icon: "⚡", name: "スピードスター", desc: "文法タームを全問正解・平均10秒以内" },
  { id: "tag_master", icon: "👑", name: "単元マスター", desc: "文法の単元を1つ80%以上にする" },
];

function M() {
  if (!S.m) {
    // 以前の記録から連続日数を引き継ぐ
    const days = Object.keys(S.days).filter(d => S.days[d].done && S.days[d].done.length).sort();
    S.m = { xp: 0, streak: days.length ? streak() : 0, lastDay: days.pop() || null, freezes: 0, frozen: [], badges: {}, best: {}, combo: 0, log: [], comebackDay: null };
  }
  return S.m;
}
function levelOf(xp) {
  // Lv n に必要な累計XP = 50 × (n-1) × n
  let n = 1; while (50 * n * (n + 1) <= xp) n++;
  const cur = 50 * (n - 1) * n, next = 50 * n * (n + 1);
  return { level: n, into: xp - cur, need: next - cur, title: TITLES.filter(([lv]) => n >= lv).pop()[1] };
}
function award(id, gained) {
  const m = M();
  if (m.badges[id]) return;
  m.badges[id] = today();
  gained.push(BADGES.find(b => b.id === id));
}
// 解答ごと：XP・コンボ・記録（予想スコア用に直近14日分）
function onAnswer(g, correct, sec, st) {
  const m = M();
  m.log.push({ d: today(), g, ok: correct ? 1 : 0, s: Math.round(sec) });
  const cut = today(-14); m.log = m.log.filter(x => x.d >= cut);
  if (g === "grammar") {
    m.combo = correct ? m.combo + 1 : 0;
    if (m.combo >= 10) award("combo10", st.badges);
  }
  st.combo = correct ? (st.combo || 0) + 1 : 0;
  if (correct) {
    let xp = XP_CORRECT + Math.min(10, Math.max(0, st.combo - 2) * 2); // 3連続目から +2ずつ（最大+10）
    if (m.comebackDay === today()) xp *= 2; // 戻ってきた日は2倍
    m.xp += xp; st.xp = (st.xp || 0) + xp;
  }
}
// ターム完了時：連続記録・休み券・自己ベスト・バッジ・完走ボーナス
function onTermDone(st) {
  const m = M(), t = today(), res = { badges: st.badges, xp: st.xp || 0, record: false, levelBefore: st.levelBefore };
  if (m.lastDay !== t) {
    const gap = m.lastDay ? daysBetween(m.lastDay, t) - 1 : 0;
    if (!m.lastDay) m.streak = 1;
    else if (gap === 0) m.streak++;
    else if (gap <= m.freezes) { // 休み券で穴埋め
      m.freezes -= gap;
      for (let i = gap; i >= 1; i--) m.frozen.push(today(-i));
      m.streak++; res.usedFreeze = gap;
    } else { m.streak = 1; m.comebackDay = t; award("comeback", res.badges); }
    m.lastDay = t;
    if (m.streak % FREEZE_EVERY === 0 && m.freezes < FREEZE_MAX) { m.freezes++; res.newFreeze = true; }
    if (m.streak >= 7) award("streak7", res.badges);
    if (m.streak >= 30) award("streak30", res.badges);
    m.frozen = m.frozen.filter(d => d >= today(-120));
  }
  if (new Date().getHours() === 7) award("early", res.badges);
  if (TERMS.includes(st.term)) {
    const sec = (performance.now() - st.termStart) / 1000;
    const b = m.best[st.term.id], rate = st.score / st.qs.length;
    if (!b || rate > b.score / b.total || (rate === b.score / b.total && sec < b.sec)) {
      res.record = !!b; m.best[st.term.id] = { score: st.score, total: st.qs.length, sec: Math.round(sec), date: t };
    }
    if (st.term.kind === "grammar" && st.score === st.qs.length && sec / st.qs.length <= 10) award("speed", res.badges);
    if (doneToday().length === 5 && !(S.days[t] && S.days[t].bonus)) {
      S.days[t].bonus = true; m.xp += XP_ALL_TERMS; res.xp += XP_ALL_TERMS; res.allBonus = true;
      award("first_full", res.badges);
    }
  }
  if (grammarGauge().some(x => x.pct >= 80)) award("tag_master", res.badges);
  res.levelAfter = levelOf(m.xp).level;
  save();
  return res;
}
// 表示用の連続日数（今日まだでも、昨日まで続いていれば・休み券で埋まるなら続いている扱い）
function streakNow() {
  const m = M();
  if (!m.lastDay) return 0;
  const gap = daysBetween(m.lastDay, today()) - 1;
  return gap <= 0 || gap <= m.freezes ? m.streak : 0;
}
// 文法力ゲージ：単元ごとに、各問題の stage（定着で満点）から習得度％を出す
function grammarGauge() {
  const by = {};
  for (const q of BANK.grammar) {
    const it = S.items[q.id];
    const v = !it ? 0 : it.mastered ? 1 : Math.min(it.stage, 4) / 4;
    (by[q.tag] = by[q.tag] || { tag: q.tag, sum: 0, n: 0, seen: 0 }).sum += v;
    by[q.tag].n++; if (it) by[q.tag].seen++;
  }
  return Object.values(by).map(x => ({ tag: x.tag, pct: Math.round(x.sum / x.n * 100), seen: x.seen, n: x.n }))
    .sort((a, b) => a.pct - b.pct);
}
// 予想スコア（目安）：直近14日の正答率と回答時間から、リーディングを推定。リスニングは前回の結果からの推定値。
const LISTENING_ESTIMATE = 470;
function predictScore() {
  const log = M().log, need = 40;
  if (log.length < need) return { enough: false, left: need - log.length };
  const acc = gs => { const xs = log.filter(x => gs.includes(x.g)); return xs.length ? xs.reduce((a, x) => a + x.ok, 0) / xs.length : null; };
  const p5 = acc(["grammar", "vocab"]), p7 = acc(["reading", "para"]);
  const a = p5 !== null && p7 !== null ? 0.46 * p5 + 0.54 * p7 : (p5 ?? p7);
  const gs = log.filter(x => x.g === "grammar"), avgSec = gs.length ? gs.reduce((s, x) => s + x.s, 0) / gs.length : 20;
  const slow = Math.max(0, Math.min(30, (avgSec - 20) * 3)); // 1問20秒を超えるほど本番で時間が足りなくなる
  const reading = Math.max(5, Math.min(495, Math.round((5 + 490 * Math.pow(a, 1.6) - slow) / 5) * 5));
  const total = reading + LISTENING_ESTIMATE;
  return { enough: true, reading, low: Math.max(10, total - 20), high: Math.min(990, total + 20), avgSec: Math.round(avgSec), n: log.length };
}
// 学習カレンダー（直近12週）
function calendarHtml() {
  const m = M(), cells = [];
  const start = -(7 * 11 + new Date().getDay()); // 12週前の日曜から
  for (let i = start; i <= 0; i++) {
    const d = today(i), n = (S.days[d] && S.days[d].done.length) || 0;
    const frozen = m.frozen.includes(d);
    cells.push(`<i class="cal-cell${frozen ? " frozen" : ""}" data-n="${n}" title="${d}：${frozen ? "休み券" : `${n}ターム`}"></i>`);
  }
  return `<div class="calendar">${cells.join("")}</div>`;
}
function motivationHtml() {
  const m = M(), lv = levelOf(m.xp), pred = predictScore(), gauge = grammarGauge();
  const examLeft = S.examDate ? daysBetween(today(), S.examDate) : null;
  return `
    <div class="card level-card">
      <div class="level-row"><span class="level">Lv.${lv.level}</span><span class="title">${lv.title}</span><span class="xp">${m.xp} XP</span></div>
      <div class="xp-bar"><i style="width:${Math.round(lv.into / lv.need * 100)}%"></i></div>
      <div class="muted">次のレベルまで ${lv.need - lv.into} XP・休み券 <span class="freeze">${m.freezes ? `${m.freezes}枚` : "なし"}</span>（${FREEZE_EVERY}日続けるごとに1枚、最大${FREEZE_MAX}枚）</div>
    </div>
    <div class="card score-pred">
      <h2>予想スコア <span class="muted">（目安）</span></h2>
      ${pred.enough
        ? `<div class="score-range">${pred.low}〜${pred.high}</div>
           <div class="muted">リーディング推定 ${pred.reading}（直近${pred.n}問の正答率と、文法の平均${pred.avgSec}秒から計算）＋リスニングは前回結果からの推定 ${LISTENING_ESTIMATE}。</div>
           <div class="goal-track"><span>905</span><i style="left:${Math.max(0, Math.min(100, (((pred.low + pred.high) / 2) - 905) / 85 * 100))}%"></i><span>950</span><span>990</span></div>`
        : `<div class="muted">あと${pred.left}問解くと表示されます。</div>`}
      ${examLeft !== null && examLeft >= 0 ? `<div class="countdown">試験まであと <b>${examLeft}</b> 日</div>` : `<div class="muted">設定で試験日を入れると、カウントダウンが出ます。</div>`}
    </div>
    <div class="card grammar-gauge">
      <h2>文法力ゲージ <span class="muted">（弱い単元から順に）</span></h2>
      ${gauge.map(x => `<div class="gauge-row"><span class="gauge-name">${esc(x.tag)}</span><span class="gauge"><i style="width:${x.pct}%"></i></span><span class="gauge-pct">${x.pct}%</span></div>`).join("")}
    </div>
    <div class="card">
      <h2>学習カレンダー</h2>
      ${calendarHtml()}
    </div>
    <div class="card badges">
      <h2>バッジ <span class="muted">${Object.keys(m.badges).length}/${BADGES.length}</span></h2>
      <div class="badge-list">${BADGES.map(b => `<div class="badge ${m.badges[b.id] ? "earned" : ""}" title="${esc(b.desc)}"><span class="badge-icon">${b.icon}</span><span class="badge-name">${esc(b.name)}</span></div>`).join("")}</div>
    </div>`;
}
function resultExtrasHtml(res) {
  const parts = [];
  if (res.xp) parts.push(`<div class="xp-gain">+${res.xp} XP${res.allBonus ? `（5ターム完走ボーナス +${XP_ALL_TERMS}含む）` : ""}${M().comebackDay === today() ? "・おかえりボーナスで2倍" : ""}</div>`);
  if (res.levelAfter > res.levelBefore) parts.push(`<div class="levelup">レベルアップ！ Lv.${res.levelAfter}「${levelOf(M().xp).title}」</div>`);
  if (res.record) parts.push(`<div class="new-record">NEW RECORD</div>`);
  if (res.newFreeze) parts.push(`<div class="muted">休み券を1枚もらいました</div>`);
  if (res.usedFreeze) parts.push(`<div class="muted">休み券を${res.usedFreeze}枚使って、連続記録を守りました</div>`);
  for (const b of res.badges) parts.push(`<div class="badge earned new-badge"><span class="badge-icon">${b.icon}</span><span class="badge-name">バッジ獲得：${esc(b.name)}</span></div>`);
  return parts.length ? `<div class="result-extras">${parts.join("")}</div>` : "";
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

function termButton(t, done, label) {
  return `
      <button class="term ${done ? "done" : ""}" data-term="${t.id}">
        <span class="num">${done ? "✓" : label}</span>
        <span class="body"><span class="name">${t.name}</span><br><span class="desc">${t.desc}</span></span>
      </button>`;
}

function home() {
  const done = doneToday();
  const acc = {};
  let mastered = 0;
  for (const [id, it] of Object.entries(S.items)) {
    const g = genreOf(id); acc[g] = acc[g] || { seen: 0, ok: 0 };
    acc[g].seen += it.seen; acc[g].ok += it.ok;
    if (it.mastered) mastered++;
  }
  const d = new Date();
  const rows = Object.keys(GENRE_NAMES).map(g => {
    const a = acc[g];
    return `<tr><td>${GENRE_NAMES[g]}</td><td>${a ? `${Math.round(a.ok / a.seen * 100)}%（${a.seen}問）` : "まだ"}</td></tr>`;
  }).join("");
  const eve = eveningItems().length;
  const examLeft = S.examDate ? daysBetween(today(), S.examDate) : null;
  app.innerHTML = `
    <div class="top"><h1>今日の5ターム</h1><button class="link" id="settings" aria-label="設定">設定</button></div>
    <div class="muted">${d.getMonth() + 1}月${d.getDate()}日・1タームは約5分です${examLeft !== null && examLeft >= 0 ? `・試験まであと${examLeft}日` : ""}</div>
    <div class="stats">
      <div class="stat"><b>${done.length}/5</b><span>今日の完了</span></div>
      <div class="stat"><b>${streakNow()}日</b><span>連続学習</span></div>
      <div class="stat"><b>${mastered}</b><span>定着した問題</span></div>
    </div>
    <button class="term guide-entry" id="guide">
      <span class="num">G</span>
      <span class="body"><span class="name">TOEICのパート別ガイド</span><br><span class="desc">Part 1〜7の形式・出題傾向・コツ</span></span>
    </button>
    <div class="terms">${TERMS.map(t => termButton(t, done.includes(t.id), t.id)).join("")}
      ${eve ? termButton({ ...EVENING, desc: `今日間違えた ${eve}問をもう一度` }, false, "夜") : ""}
    </div>
    ${statusHtml()}
    ${motivationHtml()}
    <div class="card" style="margin-top:16px">
      <h2>ジャンル別の正答率</h2>
      <table class="genres">${rows}</table>
      <div class="muted" style="margin-top:8px">正解して「自信あり」を選び、制限時間内（文法・語彙20秒、言い換え10秒）に答えると次の復習までの間隔が 1→3→7→14→30→60日と伸びます。</div>
    </div>`;
  app.querySelectorAll(".term").forEach(b => b.onclick = () => startTerm(+b.dataset.term));
  document.getElementById("settings").onclick = settings;
  document.getElementById("guide").onclick = guide;
  const wg = document.getElementById("wrongsGo"); if (wg) wg.onclick = () => startTerm(WRONGS.id);
  const wl = document.getElementById("wrongsList"); if (wl) wl.onclick = wrongList;
  window.scrollTo(0, 0);
}

function guide() {
  history.replaceState(null, "", "?guide=1");
  const card = p => `
    <div class="card part-card" id="part${p.n}">
      <div class="part-head"><span class="part-num">Part ${p.n}</span><span class="muted">${p.sec}・${esc(p.count)}・${esc(p.time)}</span></div>
      <h2>${esc(p.name)}</h2>
      <p><b>形式</b>　${esc(p.what)}</p>
      <p><b>出題傾向</b>　${esc(p.trend)}</p>
      <p><b>攻略のコツ</b>　${esc(p.tip)}</p>
    </div>`;
  app.innerHTML = `
    <div class="guide">
      <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">パート別ガイド</span></div>
      <div class="card">
        <h1>TOEIC L&amp;R の全体像</h1>
        <p>リスニング45分・100問（Part 1〜4）、リーディング75分・100問（Part 5〜7）の合計200問、990点満点です。</p>
        <p class="muted">このアプリの問題は Part 5（文法・語彙）と Part 7（読解・言い換え）に対応しています。各問題の上に、どのPartの問題かが表示されます。</p>
        <div class="part-jump">${PARTS.map(p => `<a href="#part${p.n}">Part ${p.n}</a>`).join("")}</div>
      </div>
      <h2 class="sec-title">Listening</h2>
      ${PARTS.filter(p => p.sec === "Listening").map(card).join("")}
      <h2 class="sec-title">Reading</h2>
      ${PARTS.filter(p => p.sec === "Reading").map(card).join("")}
      <button class="btn ghost" id="back2">ホームに戻る</button>
    </div>`;
  document.getElementById("back").onclick = goHome;
  document.getElementById("back2").onclick = goHome;
  app.querySelectorAll(".part-jump a").forEach(a => a.onclick = e => {
    e.preventDefault(); document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
  });
  window.scrollTo(0, 0);
}

function startTerm(termId) {
  const term = termId === EVENING.id ? EVENING : termId === WRONGS.id ? WRONGS : TERMS.find(t => t.id === termId);
  const items = term === EVENING ? eveningItems() : term === WRONGS ? shuffle(wrongItems()).slice(0, 12) : buildTerm(term);
  if (!items.length) { goHome(); return; }
  const qs = toQuestions(items);
  const st = { term, qs, i: 0, score: 0, answered: false, badges: [], xp: 0, termStart: performance.now(), levelBefore: levelOf(M().xp).level };
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
      <div class="part-badge">${esc(QUESTION_PART[q.g].label)}${q.tag ? `<span class="part-tag">${esc(q.tag)}</span>` : ""}</div>
      ${st.i === 0 || st.qs[st.i - 1].g !== q.g ? `<div class="part-note muted">${esc(QUESTION_PART[q.g].note)}</div>` : ""}
      <div class="q">${esc(q.q)}</div>
      <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="lbl">${L[k]}</span>${esc(c)}</button>`).join("")}</div>
      <div id="after"></div>
    </div>`;
  document.getElementById("back").onclick = goHome;
  app.querySelectorAll(".choice").forEach(b => b.onclick = () => answer(st, +b.dataset.k));
  if (!q.passage || q.sub === 0) { window.scrollTo(0, 0); st.passageStart = performance.now(); }
  st.qStart = performance.now();
}

function answer(st, k) {
  if (st.answered) return;
  st.answered = true;
  const q = st.qs[st.i];
  const sec = (performance.now() - st.qStart) / 1000;
  const correct = q.choices[k] === q.answer;
  if (correct) st.score++;
  app.querySelectorAll(".choice").forEach((b, idx) => {
    b.disabled = true;
    if (q.choices[idx] === q.answer) b.classList.add("ok");
    else if (idx === k) b.classList.add("ng");
  });
  const limit = q.passage ? null : TIME_LIMIT[q.g];
  const over = limit && sec > limit;
  const last = st.i === st.qs.length - 1;
  const nextLabel = last ? "結果を見る" : "次へ";
  const evening = st.term === EVENING || st.term === WRONGS; // その場の解き直しは、間違えても翌日へ
  const done = confident => {
    // 長文は3問まとめて1つの記録（全問正解・全問自信ありで1段上がる）
    if (q.passage) {
      if (q.sub === 0) st.read = { ok: true, conf: true };
      st.read.ok = st.read.ok && correct;
      st.read.conf = st.read.conf && confident;
      if (q.last) record(q.id, st.read.ok, st.read.conf, (performance.now() - st.passageStart) / 1000, evening);
    } else record(q.id, correct, confident, sec, evening);
    onAnswer(q.g, correct, sec, st);
    st.i++; showQ(st);
  };
  const timeNote = limit ? `<span class="muted">（${Math.round(sec)}秒${over ? `・目標${limit}秒を超えました` : ""}）</span>` : "";
  const similar = !correct && q.g === "grammar" && !evening ? `<div class="muted" style="margin-top:6px">「${esc(q.tag)}」の類題を明日の復習に2問追加します。</div>` : "";
  document.getElementById("after").innerHTML = `
    <div class="exp"><b class="${correct ? "ok" : "ng"}">${correct ? "正解" : "不正解"}</b>${timeNote}　正解は「${esc(q.answer)}」
      ${q.point ? `<div class="point">ポイント：${esc(q.point)}</div>` : ""}
      <div class="exp-body">${esc(q.exp)}</div>${similar}</div>
    ${correct
      ? `<div class="muted" style="margin-top:12px">この問題、自信を持って答えられましたか？</div>
         <div class="row2"><button class="btn" id="conf">自信あり</button><button class="btn ghost" id="unsure">迷った</button></div>`
      : `<button class="btn" id="next">${nextLabel}</button>`}`;
  if (correct) {
    document.getElementById("conf").onclick = () => done(true);
    document.getElementById("unsure").onclick = () => done(false);
  } else document.getElementById("next").onclick = () => done(false);
  document.getElementById("after").lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function finish(st) {
  const t = today();
  if (TERMS.includes(st.term)) {
    S.days[t] = S.days[t] || { done: [] };
    if (!S.days[t].done.includes(st.term.id)) S.days[t].done.push(st.term.id);
    save();
  }
  const res = onTermDone(st);
  const done = doneToday();
  const next = TERMS.find(x => !done.includes(x.id));
  const eve = eveningItems().length;
  app.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="muted">${st.term.name}</div>
      <div class="big">${st.score} / ${st.qs.length}</div>
      <div>${done.length === 5 ? "今日の5タームを全部終えました。お疲れさまでした！" : `今日はあと${5 - done.length}タームです。`}</div>
      ${resultExtrasHtml(res)}
      ${eve ? `<div class="muted" style="margin-top:6px">間違えた問題は、帰りの復習（${eve}問）でもう一度出ます。</div>` : ""}
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
  app.innerHTML = `<div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">設定</span></div><div class="card">読み込み中…</div>`;
  document.getElementById("back").onclick = goHome;
  const { cfg } = await loadConfig();
  let times = (cfg.times || []).slice();
  const render = (msg = "") => {
    app.innerHTML = `
      <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">設定</span></div>
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
        <h2>次のTOEICの試験日</h2>
        <div class="muted">試験の2週間前になると、定着済みの問題も1回ずつ復習に戻して再確認します。この端末だけに保存されます。</div>
        <input type="date" id="exam" class="input" value="${esc(S.examDate || "")}">
      </div>
      <div id="syncCard"></div>
      <div class="card">
        <h2>GitHubのトークン</h2>
        <div class="muted">通知の設定の保存と、記録の同期に使います。各端末で最初に1回だけ入力します。その端末の中だけに保存されます。作り方はREADMEを見てください。</div>
        <input type="password" id="token" class="input" placeholder="github_pat_..." value="${esc(getToken())}" autocomplete="off">
      </div>
      ${msg ? `<div class="exp">${msg}</div>` : ""}
      <button class="btn" id="save">保存する</button>
      <button class="btn ghost" id="test">テスト通知を今すぐ送る</button>`;
    document.getElementById("back").onclick = goHome;
    document.getElementById("exam").onchange = e => { S.examDate = e.target.value || null; save(); };
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
  const params = new URLSearchParams(location.search);
  if (TERMS.some(x => x.id === t) || t === EVENING.id || t === WRONGS.id) startTerm(t); else if (params.get("guide")) guide(); else if (params.get("wrongs")) wrongList(); else home();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
