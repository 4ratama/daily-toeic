// questions.json の形式チェック（node scripts/check-questions.mjs）
// アプリとDiscordボットの両方が読むので、壊れた問題が入らないように確かめる
import { readFileSync } from "node:fs";

const bank = JSON.parse(readFileSync(new URL("../questions.json", import.meta.url), "utf8"));
const errors = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);
const ids = new Set();
const prefix = { grammar: "g", vocab: "v", para: "p", reading: "r" };
const TAGS = ["接続詞・前置詞", "準動詞", "仮定法", "品詞", "関係詞", "主述一致", "倒置", "比較", "時制・態", "代名詞", "数量・限定詞"];

function checkChoices(id, q) {
  if (!Array.isArray(q.choices) || q.choices.length !== 4) return fail(id, "選択肢は4つ必要");
  if (new Set(q.choices.map(c => c.trim().toLowerCase())).size !== 4) fail(id, "選択肢が重複している");
  for (const c of q.choices) {
    if (!c || !c.trim()) fail(id, "空の選択肢がある");
    // ボットのボタンは「A. 」を付けて80文字まで
    if (c.length > 76) fail(id, `選択肢が長すぎる（${c.length}文字）: ${c}`);
  }
  if (!q.exp) fail(id, "解説がない");
}

for (const [kind, p] of Object.entries(prefix)) {
  const list = bank[kind];
  if (!Array.isArray(list) || !list.length) { fail(kind, "問題がない"); continue; }
  for (const it of list) {
    if (!new RegExp(`^${p}\\d{3}$`).test(it.id || "")) fail(it.id, `ID は ${p}000 の形にする`);
    if (ids.has(it.id)) fail(it.id, "ID が重複している");
    ids.add(it.id);
    if (it.level !== undefined && ![1, 2, 3].includes(it.level)) fail(it.id, "level は 1〜3");
    if (kind === "grammar" || kind === "vocab") {
      if ((it.q.match(/_____/g) || []).length !== 1) fail(it.id, "空所 _____ はちょうど1つ");
      checkChoices(it.id, it);
      if (!it.point) fail(it.id, "ポイントがない");
      if (kind === "grammar" && !TAGS.includes(it.tag)) fail(it.id, `未知の分野タグ: ${it.tag}`);
    } else if (kind === "reading") {
      if (!it.title || !it.passage) fail(it.id, "タイトルか本文がない");
      if (!Array.isArray(it.questions) || !it.questions.length) fail(it.id, "設問がない");
      (it.questions || []).forEach((q, i) => { checkChoices(`${it.id}-${i + 1}`, q); if (!q.q) fail(`${it.id}-${i + 1}`, "設問文がない"); });
    } else if (kind === "para") {
      if (!it.word || !it.answer || !it.ja) fail(it.id, "word / answer / ja が必要");
    }
  }
}

// 文法・語彙は同じ問題文を2回入れない
const stems = new Map();
for (const it of [...bank.grammar, ...bank.vocab]) {
  if (stems.has(it.q)) fail(it.id, `${stems.get(it.q)} と同じ問題文`);
  stems.set(it.q, it.id);
}
// 言い換えは、他の単語の answer が誤答になるので answer と word を重複させない
for (const key of ["answer", "word"]) {
  const seen = new Map();
  for (const it of bank.para) {
    const v = it[key].toLowerCase();
    if (seen.has(v)) fail(it.id, `${seen.get(v)} と ${key} が同じ: ${v}`);
    seen.set(v, it.id);
  }
}

if (errors.length) {
  console.error(`questions.json に ${errors.length} 件の問題があります:\n` + errors.join("\n"));
  process.exit(1);
}
const count = Object.fromEntries(Object.keys(prefix).map(k => [k, bank[k].length]));
console.log("questions.json OK", JSON.stringify(count));
