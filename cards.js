"use strict";
// 単語帳：毎日の5タームとは別に、いつでも使えるカード学習。
// モード：カード（めくって「覚えた／まだ」に仕分け）・学習（4択→記述の順に進め、間違えた語は同じラウンドでもう一度）・テスト・マッチ。
// 記録は localStorage の "toeic-daily-vocab" に保存（sync.js が単語ごとに t の新しい方を採用してマージ）。
// 形：{ v:1, words:{ <id>:{ lv:0未学習〜1学習中〜2習得, seen, miss, star, t, custom?:{term,def,ex}, deleted? } }, prefs:{}, best:{} }
// app.js の BANK・app・esc・shuffle・goHome を使います。
(() => {
  const VKEY = "toeic-daily-vocab";
  const ROUND = 7;       // 学習モード1ラウンドの語数
  const MATCH_PAIRS = 6; // マッチの組数
  let WORDS = null;
  let V = null;

  const DECKS = [
    { id: "adv", name: "950〜990点の語", desc: "Part 5・7 で差がつく上級語" },
    { id: "para", name: "言い換え", desc: "毎日の「言い換え単語」に出る語" },
    { id: "colloc", name: "語法・コロケーション", desc: "毎日の「語彙」問題のポイント" },
    { id: "mine", name: "自分の単語", desc: "自分で追加した語" },
  ];
  const EXTRA = { star: "★を付けた語", all: "すべての語" };
  const deckName = key => (DECKS.find(d => d.id === key) || {}).name || EXTRA[key] || "単語帳";

  // ---- 記録 ----
  function loadV() {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(VKEY)); } catch (e) {}
    if (!v || typeof v !== "object") v = {};
    v.v = 1; v.words = v.words || {}; v.prefs = v.prefs || {}; v.best = v.best || {};
    return v;
  }
  function saveV() {
    try { localStorage.setItem(VKEY, JSON.stringify(V)); } catch (e) {}
    try { window.dispatchEvent(new Event("toeic:saved")); } catch (e) {}
  }
  function touch(id, patch) {
    const w = V.words[id] || (V.words[id] = { lv: 0, seen: 0, miss: 0 });
    Object.assign(w, patch);
    w.t = Date.now();
  }
  const rec = c => V.words[c.id] || {};
  const lvOf = c => rec(c).lv || 0;
  const status = c => lvOf(c) >= 2 ? "m" : rec(c).seen ? "l" : "n"; // 習得・学習中・未学習
  function answered(c, correct, lv) {
    const w = rec(c);
    touch(c.id, { seen: (w.seen || 0) + 1, miss: (w.miss || 0) + (correct ? 0 : 1), lv: Math.max(w.lv || 0, lv) });
    saveV();
  }

  // ---- カードの一覧（words.json＋questions.json の言い換え・語彙＋自分の単語）----
  function allCards() {
    const out = [];
    for (const c of WORDS.cards || []) out.push({ id: c.id, deck: c.deck || "adv", term: c.term, def: c.def, ex: c.ex || "", pos: c.pos || "" });
    const bank = typeof BANK !== "undefined" && BANK ? BANK : {};
    for (const p of bank.para || []) out.push({ id: "c" + p.id, deck: "para", term: p.word, def: `${p.ja}（≒ ${p.answer}）`, ex: "", pos: "" });
    for (const q of bank.vocab || []) {
      const m = String(q.point || "").match(/^(.+?)「(.+?)」\s*$/);
      if (m) out.push({ id: "c" + q.id, deck: "colloc", term: m[1].trim(), def: m[2].trim(), ex: String(q.q).replace(/_{2,}/, q.choices[0]), pos: "" });
    }
    const mine = Object.entries(V.words).filter(([, w]) => w.custom && !w.deleted).sort((a, b) => (a[1].created || 0) - (b[1].created || 0));
    for (const [id, w] of mine) out.push({ id, deck: "mine", term: w.custom.term, def: w.custom.def, ex: w.custom.ex || "", pos: "", custom: true });
    return out;
  }
  function cardsOf(key) {
    const all = allCards();
    if (key === "all") return all;
    if (key === "star") return all.filter(c => rec(c).star);
    return all.filter(c => c.deck === key);
  }

  // ---- 共通 ----
  const canSpeak = "speechSynthesis" in window;
  function speak(text) {
    if (!canSpeak) return;
    try {
      const u = new SpeechSynthesisUtterance(String(text).replace(/[～~]/g, " "));
      u.lang = "en-US"; u.rate = .95;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }
  const norm = s => String(s).toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, " ").replace(/[～~＋+]/g, " ").replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim();
  function isRight(input, term) {
    const a = norm(input);
    if (!a) return false;
    return norm(term) === a || String(term).split(/\s*[\/／,、]\s*/).some(t => norm(t) === a);
  }
  function top(label, onBack) {
    return `<div class="top"><button class="link" id="back">‹ 戻る</button><span class="muted">${esc(label)}</span></div>`;
  }
  function bindBack(fn) { const b = document.getElementById("back"); if (b) b.onclick = fn; }
  function prog3(cards) {
    const n = { m: 0, l: 0, n: 0 };
    cards.forEach(c => n[status(c)]++);
    const t = cards.length || 1;
    return `<div class="prog3" aria-hidden="true"><i class="m" style="width:${n.m / t * 100}%"></i><i class="l" style="width:${n.l / t * 100}%"></i></div>
      <div class="prog3-legend muted"><span><i class="m"></i>習得 ${n.m}</span><span><i class="l"></i>学習中 ${n.l}</span><span><i class="n"></i>未学習 ${n.n}</span></div>`;
  }
  function distractors(c, pool, field, n = 3) {
    const seen = new Set([norm(c[field])]);
    const out = [];
    for (const x of shuffle(pool.length >= 4 ? pool : allCards())) {
      const k = norm(x[field]);
      if (x.id === c.id || seen.has(k)) continue;
      seen.add(k); out.push(x[field]);
      if (out.length >= n) break;
    }
    return out;
  }
  const go = q => history.replaceState(null, "", `?cards=${q}`);

  // ---- 単語帳のトップ ----
  async function open() {
    if (!WORDS) {
      try { WORDS = await (await fetch("words.json", { cache: "no-cache" })).json(); }
      catch (e) { WORDS = { cards: [] }; }
    }
    V = loadV(); // 同期で書き換わっていることがあるので毎回読み直す
    const key = new URLSearchParams(location.search).get("cards");
    if (key && (DECKS.some(d => d.id === key) || EXTRA[key])) deckView(key); else cardsHome();
  }
  function cardsHome() {
    go(1);
    const all = allCards();
    const starN = all.filter(c => rec(c).star).length;
    const row = (key, name, desc, cards) => `
      <button class="deck" data-deck="${key}">
        <span class="body"><span class="name">${esc(name)}</span><span class="cnt muted">${cards.length}語</span><br>
        <span class="desc">${esc(desc)}</span>
        <span class="mini"><i style="width:${cards.length ? cards.filter(c => status(c) === "m").length / cards.length * 100 : 0}%"></i></span></span>
      </button>`;
    app.innerHTML = `
      <div class="top"><button class="link" id="back">‹ ホーム</button><span class="muted">単語帳</span></div>
      <h1 class="cards-title">いつでも単語帳</h1>
      <div class="muted">毎日の5タームとは別に、すきな時にいつでも。習得の記録はこの端末に保存されます。</div>
      <div class="card" style="margin-top:12px">${prog3(all)}</div>
      <div class="decks">
        ${DECKS.map(d => row(d.id, d.name, d.desc, all.filter(c => c.deck === d.id))).join("")}
        ${starN ? row("star", EXTRA.star, "★を付けた語だけで練習", all.filter(c => rec(c).star)) : ""}
        ${row("all", EXTRA.all, "全部まとめて", all)}
      </div>
      <div class="row2"><button class="btn ghost" id="add">＋ 単語を追加</button><button class="btn ghost" id="bulk">まとめて追加</button></div>`;
    bindBack(goHome);
    app.querySelectorAll(".deck").forEach(b => b.onclick = () => deckView(b.dataset.deck));
    document.getElementById("add").onclick = () => editWord(null, cardsHome);
    document.getElementById("bulk").onclick = () => bulkAdd(cardsHome);
    window.scrollTo(0, 0);
  }

  // ---- デッキ：モード選択と単語リスト ----
  function deckView(key) {
    go(key);
    const cards = cardsOf(key);
    const modes = [
      ["flash", "カード", "めくって「覚えた／まだ」に仕分け"],
      ["learn", "学習", "4択→記述。間違えた語はもう一度"],
      ["test", "テスト", "○✕・4択・記述でまとめて採点"],
      ["match", "マッチ", "語と意味をタップでそろえるタイムアタック"],
    ];
    const statusMark = { m: `<span class="st m">習得</span>`, l: `<span class="st l">学習中</span>`, n: "" };
    app.innerHTML = `
      ${top(deckName(key))}
      <h1 class="cards-title">${esc(deckName(key))}</h1>
      <div class="muted">${cards.length}語</div>
      <div class="card" style="margin-top:10px">${prog3(cards)}</div>
      <div class="modes">${modes.map(([m, n, d]) => `
        <button class="mode" data-mode="${m}" ${cards.length < (m === "flash" ? 1 : 2) ? "disabled" : ""}><span class="name">${n}</span><span class="desc">${d}</span></button>`).join("")}
      </div>
      ${key === "mine" ? `<div class="row2"><button class="btn ghost" id="add">＋ 単語を追加</button><button class="btn ghost" id="bulk">まとめて追加</button></div>` : ""}
      ${cards.length ? `<div class="card wl-card"><h2>単語リスト</h2><div class="wl">${cards.map(c => `
        <div class="wl-row" data-id="${esc(c.id)}">
          <button class="star ${rec(c).star ? "on" : ""}" data-star="${esc(c.id)}" aria-label="★を付ける">${rec(c).star ? "★" : "☆"}</button>
          <div class="wl-body"><span class="wl-term">${esc(c.term)}</span>${c.pos ? `<span class="pos">${esc(c.pos)}</span>` : ""}${statusMark[status(c)]}<br>
            <span class="wl-def">${esc(c.def)}</span>${c.ex ? `<br><span class="wl-ex muted">${esc(c.ex)}</span>` : ""}</div>
          <div class="wl-tools">${canSpeak ? `<button class="link sm" data-say="${esc(c.id)}">音声</button>` : ""}${c.custom ? `<button class="link sm" data-edit="${esc(c.id)}">編集</button>` : ""}</div>
        </div>`).join("")}</div>
        <button class="link sm" id="reset" style="margin-top:12px">このデッキの学習記録をリセット</button></div>`
        : `<div class="card muted">${key === "star" ? "単語リストの☆をタップすると、ここに集まります。" : "まだ単語がありません。「＋ 単語を追加」から入れてください。"}</div>`}`;
    bindBack(cardsHome);
    const back = () => deckView(key);
    app.querySelectorAll(".mode").forEach(b => b.onclick = () => {
      const cs = cardsOf(key);
      ({ flash, learn, test: testSetup, match: matchStart })[b.dataset.mode](key, cs);
    });
    app.querySelectorAll("[data-star]").forEach(b => b.onclick = () => {
      const on = !V.words[b.dataset.star] || !V.words[b.dataset.star].star;
      touch(b.dataset.star, { star: on }); saveV();
      b.classList.toggle("on", on); b.textContent = on ? "★" : "☆";
    });
    app.querySelectorAll("[data-say]").forEach(b => b.onclick = () => speak(cards.find(c => c.id === b.dataset.say).term));
    app.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editWord(b.dataset.edit, back));
    const add = document.getElementById("add");
    if (add) { add.onclick = () => editWord(null, back); document.getElementById("bulk").onclick = () => bulkAdd(back); }
    const reset = document.getElementById("reset");
    if (reset) reset.onclick = () => {
      if (!confirm("このデッキの「習得・学習中」の記録を消して、最初から学習し直しますか？（★と自分の単語は残ります）")) return;
      cards.forEach(c => { if (V.words[c.id]) touch(c.id, { lv: 0, seen: 0, miss: 0 }); });
      saveV(); back();
    };
    window.scrollTo(0, 0);
  }

  // ---- カード（フラッシュカード）----
  function flash(key, cards) {
    const deck = V.prefs.shuffle ? shuffle(cards) : cards.slice();
    showFlash({ key, all: cards, deck, i: 0, know: [], still: [], hist: [] });
  }
  function face(c, side) {
    if (side === "term") return `<div class="fc-term">${esc(c.term)}</div>${c.pos ? `<div class="pos">${esc(c.pos)}</div>` : ""}`;
    return `<div class="fc-def">${esc(c.def)}</div>${c.ex ? `<div class="fc-ex">${esc(c.ex)}</div>` : ""}`;
  }
  function showFlash(st) {
    const c = st.deck[st.i];
    if (!c) return flashDone(st);
    const frontDef = V.prefs.front === "def";
    app.innerHTML = `
      ${top(`カード　${st.i + 1}/${st.deck.length}`)}
      <div class="bar"><i style="width:${st.i / st.deck.length * 100}%"></i></div>
      <div class="fc-count"><span>まだ <b>${st.still.length}</b></span><span>覚えた <b>${st.know.length}</b></span></div>
      <div class="flip" id="flip" role="button" aria-label="カードをめくる">
        <div class="flip-in">
          <div class="face front">${face(c, frontDef ? "def" : "term")}</div>
          <div class="face back">${face(c, frontDef ? "term" : "def")}</div>
        </div>
      </div>
      <div class="muted center">タップでめくる・右へスワイプで「覚えた」、左へ「まだ」</div>
      <div class="row2"><button class="btn ghost" id="still">まだ</button><button class="btn" id="know">覚えた</button></div>
      <div class="fc-tools">
        <button class="link sm" id="undo" ${st.hist.length ? "" : "disabled"}>1つ戻る</button>
        ${canSpeak ? `<button class="link sm" id="say">音声</button>` : ""}
        <button class="link sm" id="shuf">シャッフル：${V.prefs.shuffle ? "オン" : "オフ"}</button>
        <button class="link sm" id="front">表：${frontDef ? "意味" : "英語"}</button>
      </div>`;
    bindBack(() => deckView(st.key));
    const flip = document.getElementById("flip");
    const sort = know => {
      st.hist.push({ i: st.i, know });
      (know ? st.know : st.still).push(c);
      st.i++; showFlash(st);
    };
    // タップでめくる／スワイプで仕分け
    let x0 = null, dx = 0;
    flip.addEventListener("pointerdown", e => { x0 = e.clientX; dx = 0; flip.setPointerCapture(e.pointerId); flip.classList.add("drag"); });
    flip.addEventListener("pointermove", e => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      flip.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      flip.dataset.lean = dx > 40 ? "know" : dx < -40 ? "still" : "";
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null; flip.classList.remove("drag"); flip.style.transform = ""; flip.dataset.lean = "";
      if (Math.abs(dx) > 90) sort(dx > 0);
      else if (Math.abs(dx) < 8) flip.classList.toggle("flipped");
    };
    flip.addEventListener("pointerup", end);
    flip.addEventListener("pointercancel", () => { x0 = null; flip.classList.remove("drag"); flip.style.transform = ""; });
    flip.addEventListener("keydown", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip.classList.toggle("flipped"); } });
    flip.tabIndex = 0;
    document.getElementById("know").onclick = () => sort(true);
    document.getElementById("still").onclick = () => sort(false);
    document.getElementById("undo").onclick = () => {
      const h = st.hist.pop(); if (!h) return;
      (h.know ? st.know : st.still).pop(); st.i = h.i; showFlash(st);
    };
    const say = document.getElementById("say");
    if (say) say.onclick = () => speak(c.term);
    document.getElementById("shuf").onclick = () => {
      V.prefs.shuffle = !V.prefs.shuffle; saveV();
      const rest = st.deck.slice(st.i);
      st.deck = st.deck.slice(0, st.i).concat(V.prefs.shuffle ? shuffle(rest) : st.all.filter(x => rest.includes(x)));
      showFlash(st);
    };
    document.getElementById("front").onclick = () => { V.prefs.front = frontDef ? "term" : "def"; saveV(); showFlash(st); };
  }
  function flashDone(st) {
    const k = st.know.length, s = st.still.length;
    app.innerHTML = `
      ${top("カード")}
      <div class="card center">
        <h2>${s ? "ひと通り終わりました" : "全部「覚えた」になりました"}</h2>
        <div class="fc-sum"><span>覚えた <b class="ok">${k}</b></span><span>まだ <b>${s}</b></span></div>
        <div class="muted">${s ? "「まだ」の語だけで、もう一周できます。" : "学習モードで、書いて覚えられたか確かめましょう。"}</div>
      </div>
      ${s ? `<button class="btn" id="again">「まだ」の${s}枚をもう一度</button>` : `<button class="btn" id="learn">学習モードへ</button>`}
      <button class="btn ghost" id="restart">最初からやり直す</button>
      <button class="btn ghost" id="deck">デッキに戻る</button>`;
    bindBack(() => deckView(st.key));
    const again = document.getElementById("again");
    if (again) again.onclick = () => showFlash({ ...st, deck: V.prefs.shuffle ? shuffle(st.still) : st.still.slice(), i: 0, know: [], still: [], hist: [] });
    const lb = document.getElementById("learn");
    if (lb) lb.onclick = () => learn(st.key, st.all);
    document.getElementById("restart").onclick = () => flash(st.key, st.all);
    document.getElementById("deck").onclick = () => deckView(st.key);
    window.scrollTo(0, 0);
  }

  // ---- 学習（4択で「学習中」→記述で「習得」。間違えた語はそのラウンドの少し後でもう一度）----
  function learn(key, cards) {
    nextRound({ key, cards, roundNo: 0 });
  }
  function nextRound(ls) {
    const rest = ls.cards.filter(c => lvOf(c) < 2);
    if (!rest.length) return learnComplete(ls);
    const pick = [
      ...shuffle(rest.filter(c => lvOf(c) === 1)),
      ...shuffle(rest.filter(c => lvOf(c) === 0 && rec(c).seen)),
      ...rest.filter(c => !rec(c).seen),
    ].slice(0, ROUND);
    ls.roundNo++;
    ls.round = pick;
    ls.queue = shuffle(pick);
    ls.cleared = new Set();
    ls.missed = new Set();
    askLearn(ls);
  }
  function learnHead(ls) {
    return `${top(`学習　ラウンド${ls.roundNo}`)}
      <div class="bar"><i style="width:${ls.cleared.size / ls.round.length * 100}%"></i></div>`;
  }
  function askLearn(ls) {
    const c = ls.queue[0];
    if (!c) return roundDone(ls);
    const lv = lvOf(c);
    const after = (correct, promote) => {
      ls.queue.shift();
      if (correct) { ls.cleared.add(c.id); answered(c, true, promote); }
      else {
        ls.missed.add(c.id); answered(c, false, 0);
        ls.queue.splice(Math.min(ls.queue.length, 2 + Math.floor(Math.random() * 2)), 0, c); // 2〜3問あとに再出題
      }
    };
    if (lv === 0) {
      const choices = shuffle([c.def, ...distractors(c, ls.cards, "def")]);
      app.innerHTML = `
        ${learnHead(ls)}
        <div class="card">
          <div class="part-badge">4択${rec(c).seen ? "・もう一度" : ""}</div>
          <div class="lq">${esc(c.term)}${c.pos ? `<span class="pos">${esc(c.pos)}</span>` : ""}${canSpeak ? `<button class="link sm say" id="say">音声</button>` : ""}</div>
          <div class="muted">意味はどれ？</div>
          <div class="choices">${choices.map((t, k) => `<button class="choice" data-k="${k}"><span class="lbl">${"ABCD"[k]}</span>${esc(t)}</button>`).join("")}</div>
          <button class="link sm dunno" id="dunno">わからない</button>
          <div id="after"></div>
        </div>`;
      bindBack(() => deckView(ls.key));
      const say = document.getElementById("say"); if (say) say.onclick = () => speak(c.term);
      const pickK = k => {
        const correct = k >= 0 && choices[k] === c.def;
        app.querySelectorAll(".choice").forEach((b, i) => {
          b.disabled = true;
          if (choices[i] === c.def) b.classList.add("ok"); else if (i === k) b.classList.add("ng");
        });
        document.getElementById("dunno").remove();
        after(correct, 1);
        feedback(ls, c, correct, correct ? "" : `正解は「${esc(c.def)}」`);
      };
      app.querySelectorAll(".choice").forEach(b => b.onclick = () => pickK(+b.dataset.k));
      document.getElementById("dunno").onclick = () => pickK(-1);
    } else {
      app.innerHTML = `
        ${learnHead(ls)}
        <div class="card">
          <div class="part-badge">記述</div>
          <div class="lq ja">${esc(c.def)}</div>
          <div class="muted">英語で書いてください</div>
          <form id="wf" autocomplete="off"><input class="input" id="ans" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="英語を入力">
          <div class="hint muted" id="hintbox"></div>
          <button class="btn" type="submit">答える</button></form>
          <div class="row-links"><button class="link sm" id="hint">ヒント</button><button class="link sm" id="dunno">わからない</button></div>
          <div id="after"></div>
        </div>`;
      bindBack(() => deckView(ls.key));
      const input = document.getElementById("ans");
      setTimeout(() => input.focus(), 50);
      document.getElementById("hint").onclick = () => {
        document.getElementById("hintbox").textContent = "ヒント：" + c.term.replace(/[A-Za-z]+/g, w => w[0] + "＿".repeat(w.length - 1));
      };
      const submit = given => {
        input.disabled = true;
        app.querySelector("#wf .btn").remove();
        app.querySelector(".row-links").remove();
        const correct = isRight(given, c.term);
        if (correct) { after(true, 2); feedback(ls, c, true, ""); return; }
        after(false, 0);
        feedback(ls, c, false,
          `${given.trim() ? `あなたの答え：<s>${esc(given)}</s><br>` : ""}正解は「<b>${esc(c.term)}</b>」`,
          given.trim() ? () => {
            // 「実は合っていた」：記録を正解に直す
            ls.queue.splice(ls.queue.indexOf(c), 1); ls.missed.delete(c.id); ls.cleared.add(c.id);
            const w = rec(c); touch(c.id, { lv: 2, miss: Math.max(0, (w.miss || 1) - 1) }); saveV();
            askLearn(ls);
          } : null);
      };
      document.getElementById("wf").onsubmit = e => { e.preventDefault(); if (input.value.trim()) submit(input.value); };
      document.getElementById("dunno").onclick = () => submit("");
    }
    window.scrollTo(0, 0);
  }
  function feedback(ls, c, correct, html, override) {
    const box = document.getElementById("after");
    if (correct) {
      box.innerHTML = `<div class="exp"><b class="ok">正解</b>${lvOf(c) >= 2 ? "　習得しました" : ""}</div>`;
      setTimeout(() => askLearn(ls), 900);
      return;
    }
    box.innerHTML = `
      <div class="exp"><b class="ng">不正解</b>　${html}
        ${c.ex ? `<div class="exp-body">${esc(c.ex)}</div>` : ""}
        <div class="muted" style="margin-top:4px">このラウンドの中で、もう一度出ます。</div></div>
      <button class="btn" id="next">次へ</button>
      ${override ? `<button class="btn ghost" id="over">実は合っていた</button>` : ""}`;
    document.getElementById("next").onclick = () => askLearn(ls);
    if (override) document.getElementById("over").onclick = override;
    document.getElementById("next").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function roundDone(ls) {
    const left = ls.cards.filter(c => lvOf(c) < 2).length;
    app.innerHTML = `
      ${top(`学習　ラウンド${ls.roundNo}`)}
      <div class="card">
        <h2>ラウンド${ls.roundNo} 終了</h2>
        <div class="muted">${ls.missed.size ? `間違えた ${ls.missed.size}語も、最後は正解できました。` : "このラウンドは全問一発正解でした。"}</div>
        <div style="margin-top:10px">${prog3(ls.cards)}</div>
      </div>
      <div class="card"><div class="wl">${ls.round.map(c => `
        <div class="wl-row"><div class="wl-body"><span class="wl-term">${esc(c.term)}</span>${status(c) === "m" ? `<span class="st m">習得</span>` : `<span class="st l">学習中</span>`}${ls.missed.has(c.id) ? `<span class="st miss">間違えた</span>` : ""}<br><span class="wl-def">${esc(c.def)}</span></div></div>`).join("")}</div></div>
      ${left ? `<button class="btn" id="next">次のラウンドへ（残り${left}語）</button>` : `<button class="btn" id="next">結果を見る</button>`}
      <button class="btn ghost" id="deck">デッキに戻る</button>`;
    bindBack(() => deckView(ls.key));
    document.getElementById("next").onclick = () => nextRound(ls);
    document.getElementById("deck").onclick = () => deckView(ls.key);
    window.scrollTo(0, 0);
  }
  function learnComplete(ls) {
    app.innerHTML = `
      ${top("学習")}
      <div class="card center">
        <h2>このデッキの ${ls.cards.length}語を全部習得しました</h2>
        <div class="muted">テストで仕上がりを確かめるか、記録をリセットして最初から学習し直せます。</div>
      </div>
      <button class="btn" id="test">テストで確かめる</button>
      <button class="btn ghost" id="reset">最初から学習し直す</button>
      <button class="btn ghost" id="deck">デッキに戻る</button>`;
    bindBack(() => deckView(ls.key));
    document.getElementById("test").onclick = () => testSetup(ls.key, ls.cards);
    document.getElementById("reset").onclick = () => {
      ls.cards.forEach(c => touch(c.id, { lv: 0 })); saveV(); learn(ls.key, ls.cards);
    };
    document.getElementById("deck").onclick = () => deckView(ls.key);
  }

  // ---- テスト ----
  const TYPES = { tf: "○✕", mc: "4択", write: "記述" };
  function testSetup(key, cards) {
    const p = V.prefs.test || { n: 10, types: ["tf", "mc", "write"] };
    const counts = [5, 10, 20, 30].filter(n => n < cards.length).concat([cards.length]);
    app.innerHTML = `
      ${top("テスト")}
      <div class="card">
        <h2>テストを作る</h2>
        <div class="muted">${esc(deckName(key))}・${cards.length}語から出題します</div>
        <h2 style="margin-top:14px">問題数</h2>
        <select id="n" class="input">${counts.map(n => `<option value="${n}" ${n === Math.min(p.n, cards.length) ? "selected" : ""}>${n === cards.length ? `全部（${n}問）` : `${n}問`}</option>`).join("")}</select>
        <h2 style="margin-top:14px">問題の形式</h2>
        <div class="checks">${Object.entries(TYPES).map(([t, n]) => `<label class="check"><input type="checkbox" value="${t}" ${p.types.includes(t) ? "checked" : ""}> ${n}</label>`).join("")}</div>
      </div>
      <button class="btn" id="make">テストを始める</button>`;
    bindBack(() => deckView(key));
    document.getElementById("make").onclick = () => {
      const types = [...app.querySelectorAll(".check input:checked")].map(x => x.value);
      if (!types.length) return alert("形式を1つ以上選んでください。");
      const n = +document.getElementById("n").value;
      V.prefs.test = { n, types }; saveV();
      runTest(key, cards, shuffle(cards).slice(0, n), types);
    };
  }
  function runTest(key, pool, picked, types) {
    const order = shuffle(types);
    const qs = picked.map((c, i) => {
      const type = order[i % order.length];
      if (type === "tf") {
        const truth = Math.random() < .5;
        return { c, type, truth, shown: truth ? c.def : distractors(c, pool, "def", 1)[0] || c.def };
      }
      if (type === "mc") return { c, type, choices: shuffle([c.def, ...distractors(c, pool, "def")]) };
      return { c, type };
    }).sort((a, b) => Object.keys(TYPES).indexOf(a.type) - Object.keys(TYPES).indexOf(b.type));
    qs.forEach(q => { if (q.type === "tf" && q.shown === q.c.def) q.truth = true; });
    let num = 0;
    const section = t => qs.some(q => q.type === t) ? `<h2 class="sec-title">${TYPES[t]}</h2>` : "";
    const qhtml = (q, i) => {
      num++;
      const head = `<div class="tq-num muted">${num}.</div>`;
      if (q.type === "tf") return `<div class="card tq" data-i="${i}">${head}<div class="lq">${esc(q.c.term)}</div><div class="tf-def">＝ ${esc(q.shown)}</div>
        <div class="tchoices row2"><button class="choice" data-v="1">正しい</button><button class="choice" data-v="0">違う</button></div><div class="tres"></div></div>`;
      if (q.type === "mc") return `<div class="card tq" data-i="${i}">${head}<div class="lq">${esc(q.c.term)}</div>
        <div class="tchoices">${q.choices.map((t, k) => `<button class="choice" data-v="${k}"><span class="lbl">${"ABCD"[k]}</span>${esc(t)}</button>`).join("")}</div><div class="tres"></div></div>`;
      return `<div class="card tq" data-i="${i}">${head}<div class="lq ja">${esc(q.c.def)}</div>
        <input class="input" data-w="${i}" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="英語を入力"><div class="tres"></div></div>`;
    };
    let last = null, body = "";
    qs.forEach((q, i) => { if (q.type !== last) { body += section(q.type); last = q.type; } body += qhtml(q, i); });
    app.innerHTML = `${top(`テスト　${qs.length}問`)}<div class="tests">${body}</div><button class="btn" id="grade">採点する</button>`;
    bindBack(() => { if (confirm("テストをやめますか？")) deckView(key); });
    app.querySelectorAll(".tq").forEach(el => el.querySelectorAll(".tchoices .choice").forEach(b => b.onclick = () => {
      el.querySelectorAll(".choice").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel"); qs[+el.dataset.i].pick = b.dataset.v;
    }));
    document.getElementById("grade").onclick = () => {
      const blank = qs.filter((q, i) => q.type === "write" ? !app.querySelector(`[data-w="${i}"]`).value.trim() : q.pick === undefined).length;
      if (blank && !confirm(`未回答が${blank}問あります。このまま採点しますか？`)) return;
      gradeTest(key, pool, qs, types);
    };
    window.scrollTo(0, 0);
  }
  function gradeTest(key, pool, qs, types) {
    let score = 0;
    qs.forEach((q, i) => {
      const el = app.querySelector(`.tq[data-i="${i}"]`);
      let ok, note;
      if (q.type === "tf") {
        ok = q.pick !== undefined && (q.pick === "1") === q.truth;
        el.querySelectorAll(".choice").forEach(b => { b.disabled = true; if ((b.dataset.v === "1") === q.truth) b.classList.add("ok"); else if (b.dataset.v === q.pick) b.classList.add("ng"); });
        note = q.truth ? "" : `正しくは「${esc(q.c.def)}」`;
      } else if (q.type === "mc") {
        ok = q.pick !== undefined && q.choices[+q.pick] === q.c.def;
        el.querySelectorAll(".choice").forEach((b, k) => { b.disabled = true; if (q.choices[k] === q.c.def) b.classList.add("ok"); else if (String(k) === q.pick) b.classList.add("ng"); });
        note = "";
      } else {
        const inp = el.querySelector("input"); inp.disabled = true;
        ok = isRight(inp.value, q.c.term);
        note = ok ? "" : `正解は「<b>${esc(q.c.term)}</b>」`;
      }
      el.querySelectorAll(".choice.sel").forEach(b => b.classList.remove("sel"));
      q.ok = ok; if (ok) score++;
      el.classList.add(ok ? "t-ok" : "t-ng");
      el.querySelector(".tres").innerHTML = `<div class="exp"><b class="${ok ? "ok" : "ng"}">${ok ? "正解" : "不正解"}</b>　${note}</div>`;
    });
    const wrong = qs.filter(q => !q.ok).map(q => q.c);
    const pct = Math.round(score / qs.length * 100);
    const card = document.createElement("div");
    card.className = "card center test-result";
    card.innerHTML = `<div class="muted">テストの結果（${pct}%）</div><div class="big">${score} / ${qs.length}</div>
      <div class="muted">${wrong.length ? `間違えた ${wrong.length}語は下に赤で正解を書きました。` : "全問正解です。"}</div>`;
    app.querySelector(".tests").before(card);
    const g = document.getElementById("grade");
    g.insertAdjacentHTML("afterend", `
      ${wrong.length ? `<button class="btn" id="retry">間違えた${wrong.length}語でもう一度テスト</button>` : ""}
      <button class="btn ghost" id="newtest">新しいテストを作る</button>
      <button class="btn ghost" id="deck">デッキに戻る</button>`);
    g.remove();
    bindBack(() => deckView(key));
    const r = document.getElementById("retry");
    if (r) r.onclick = () => runTest(key, pool, wrong, types);
    document.getElementById("newtest").onclick = () => testSetup(key, pool);
    document.getElementById("deck").onclick = () => deckView(key);
    window.scrollTo(0, 0);
  }

  // ---- マッチ ----
  function matchStart(key, cards) {
    const best = V.best[key];
    app.innerHTML = `
      ${top("マッチ")}
      <div class="card center">
        <h2>マッチ</h2>
        <div>英語と意味のカードを、できるだけ速く組み合わせて消してください。</div>
        <div class="muted">間違えると＋1秒。${Math.min(MATCH_PAIRS, cards.length)}組です。</div>
        <div class="best">${best ? `自己ベスト <b>${best.toFixed(1)}秒</b>` : "自己ベストはまだありません"}</div>
      </div>
      <button class="btn" id="go">スタート</button>`;
    bindBack(() => deckView(key));
    document.getElementById("go").onclick = () => matchPlay(key, cards);
  }
  function matchPlay(key, cards) {
    const pick = shuffle(cards).slice(0, MATCH_PAIRS);
    const tiles = shuffle(pick.flatMap(c => [{ id: c.id, kind: "t", text: c.term }, { id: c.id, kind: "d", text: c.def }]));
    app.innerHTML = `
      <div class="top"><button class="link" id="back">‹ やめる</button><span class="timer" id="timer">0.0秒</span></div>
      <div class="tiles">${tiles.map((t, i) => `<button class="tile ${t.kind}" data-i="${i}">${esc(t.text)}</button>`).join("")}</div>
      <div class="muted center" id="pen"></div>`;
    bindBack(() => { cancelAnimationFrame(raf); matchStart(key, cards); });
    const t0 = performance.now();
    let penalty = 0, sel = null, left = pick.length, raf = 0;
    const timer = document.getElementById("timer");
    const tick = () => { timer.textContent = `${((performance.now() - t0) / 1000 + penalty).toFixed(1)}秒`; raf = requestAnimationFrame(tick); };
    tick();
    app.querySelectorAll(".tile").forEach(b => b.onclick = () => {
      const t = tiles[+b.dataset.i];
      if (b.classList.contains("gone")) return;
      if (!sel) { sel = b; b.classList.add("sel"); return; }
      if (sel === b) { b.classList.remove("sel"); sel = null; return; }
      const s = tiles[+sel.dataset.i];
      if (s.id === t.id && s.kind !== t.kind) {
        [sel, b].forEach(x => { x.classList.remove("sel"); x.classList.add("gone"); x.disabled = true; });
        sel = null; left--;
        if (!left) {
          cancelAnimationFrame(raf);
          matchEnd(key, cards, (performance.now() - t0) / 1000 + penalty, penalty);
        }
      } else {
        penalty += 1;
        document.getElementById("pen").textContent = `ペナルティ ＋${penalty}秒`;
        [sel, b].forEach(x => { x.classList.remove("sel"); x.classList.add("shake"); setTimeout(() => x.classList.remove("shake"), 400); });
        sel = null;
      }
    });
  }
  function matchEnd(key, cards, sec, penalty) {
    const prev = V.best[key];
    const record = !prev || sec < prev;
    if (record) { V.best[key] = Math.round(sec * 10) / 10; saveV(); }
    app.innerHTML = `
      ${top("マッチ")}
      <div class="card center">
        <div class="muted">タイム</div>
        <div class="match-time">${sec.toFixed(1)}秒</div>
        ${penalty ? `<div class="muted">（ペナルティ ＋${penalty}秒を含む）</div>` : ""}
        ${record ? `<div class="new-record" style="display:inline-block;margin-top:8px">NEW RECORD</div>` : `<div class="muted">自己ベスト ${prev.toFixed(1)}秒</div>`}
      </div>
      <button class="btn" id="again">もう一度</button>
      <button class="btn ghost" id="deck">デッキに戻る</button>`;
    bindBack(() => deckView(key));
    document.getElementById("again").onclick = () => matchPlay(key, cards);
    document.getElementById("deck").onclick = () => deckView(key);
  }

  // ---- 自分の単語を追加・編集 ----
  const newId = () => "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function addWord(term, def, ex) {
    const id = newId();
    touch(id, { lv: 0, seen: 0, miss: 0, created: Date.now(), custom: { term, def, ex: ex || "" } });
    return id;
  }
  function editWord(id, back) {
    const w = id ? V.words[id] : null;
    const c = w ? w.custom : { term: "", def: "", ex: "" };
    app.innerHTML = `
      ${top(id ? "単語を編集" : "単語を追加")}
      <form class="card" id="f" autocomplete="off">
        <h2>${id ? "単語を編集" : "単語を追加"}</h2>
        <label class="muted" for="ft">英語</label>
        <input class="input" id="ft" value="${esc(c.term)}" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="例：expedite" required>
        <label class="muted" for="fd">意味</label>
        <input class="input" id="fd" value="${esc(c.def)}" placeholder="例：迅速化する" required>
        <label class="muted" for="fe">例文（なくてもOK）</label>
        <input class="input" id="fe" value="${esc(c.ex || "")}" placeholder="例：We will expedite your order.">
        <div id="msg"></div>
        <button class="btn" type="submit">${id ? "保存する" : "追加する"}</button>
        ${id ? `<button class="btn ghost" type="button" id="del">この単語を削除</button>` : ""}
      </form>
      <button class="btn ghost" id="done">${id ? "戻る" : "追加をやめて戻る"}</button>`;
    bindBack(back);
    document.getElementById("done").onclick = back;
    document.getElementById("f").onsubmit = e => {
      e.preventDefault();
      const term = document.getElementById("ft").value.trim(), def = document.getElementById("fd").value.trim(), ex = document.getElementById("fe").value.trim();
      if (!term || !def) return;
      if (id) { touch(id, { custom: { term, def, ex } }); saveV(); back(); return; }
      addWord(term, def, ex); saveV();
      ["ft", "fd", "fe"].forEach(k => { document.getElementById(k).value = ""; });
      document.getElementById("msg").innerHTML = `<div class="exp"><b class="ok">追加しました</b>　${esc(term)}（${esc(def)}）。続けて入力できます。</div>`;
      document.getElementById("done").textContent = "終わって戻る";
      document.getElementById("ft").focus();
    };
    const del = document.getElementById("del");
    if (del) del.onclick = () => {
      if (!confirm(`「${c.term}」を削除しますか？`)) return;
      touch(id, { deleted: true }); saveV(); back();
    };
    window.scrollTo(0, 0);
  }
  function parseLine(l) {
    const s = l.trim();
    if (!s) return null;
    for (const sep of ["\t", " - ", " – ", "：", ":", "＝", "=", ",", "、"]) {
      const k = s.indexOf(sep);
      if (k > 0) {
        const term = s.slice(0, k).trim(), def = s.slice(k + sep.length).trim();
        if (term && def) return { term, def };
      }
    }
    return null;
  }
  function bulkAdd(back) {
    app.innerHTML = `
      ${top("まとめて追加")}
      <div class="card">
        <h2>まとめて追加</h2>
        <div class="muted">1行に1語。英語と意味のあいだを、タブ・「 - 」・「：」・「,」のどれかで区切ります。表計算ソフトやメモからそのまま貼り付けられます。</div>
        <textarea class="input area" id="bt" rows="8" placeholder="expedite - 迅速化する&#10;reimburse：払い戻す&#10;tentative, 暫定的な"></textarea>
        <div id="msg" class="muted"></div>
      </div>
      <button class="btn" id="go">追加する</button>
      <button class="btn ghost" id="done">戻る</button>`;
    bindBack(back);
    document.getElementById("done").onclick = back;
    const ta = document.getElementById("bt"), msg = document.getElementById("msg");
    const preview = () => {
      const lines = ta.value.split(/\r?\n/).filter(x => x.trim());
      const ok = lines.map(parseLine).filter(Boolean);
      msg.textContent = lines.length ? `${ok.length}語を読み取りました${lines.length > ok.length ? `（区切りが見つからない行が${lines.length - ok.length}行あります）` : ""}` : "";
    };
    ta.oninput = preview;
    document.getElementById("go").onclick = () => {
      const ok = ta.value.split(/\r?\n/).map(parseLine).filter(Boolean);
      if (!ok.length) { msg.textContent = "読み取れる行がありません。区切り文字を確認してください。"; return; }
      ok.forEach(x => addWord(x.term, x.def, ""));
      saveV();
      ta.value = "";
      msg.innerHTML = `<b class="ok">${ok.length}語を「自分の単語」に追加しました。</b>`;
    };
    window.scrollTo(0, 0);
  }

  window.Cards = { open };
})();
