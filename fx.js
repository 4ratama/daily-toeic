"use strict";
// TOEIC Daily の演出（ノートと鉛筆のテーマ）：赤ペンの丸付け、花丸、チェックリスト、付せん。
// app.js には手を入れず、#app の中身の変化を見て飾り付けます。学習記録は読むだけで書き換えません。
(() => {
  const app = document.getElementById("app");
  if (!app) return;
  const NS = "http://www.w3.org/2000/svg";
  const VERSION = "v3.0 ノート（2026-11-06）"; // 見た目を更新したら書き換える

  // ---- 鉛筆で描いたような線のアイコン（自作SVG）----
  const svgLine = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {
    moon: svgLine('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
    guide: svgLine('<path d="M2.5 5.5C5 4 8.5 4 12 6c3.5-2 7-2 9.5-.5V19c-2.5-1.5-6-1.5-9.5.5-3.5-2-7-2-9.5-.5z"/><path d="M12 6v13.5"/>', 1.8),
    check: '<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18 C8 20 10 23 12.5 27 C17 17 23 9 31 3"/></svg>',
  };
  const CIRCLE = '<svg class="mark circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" vector-effect="non-scaling-stroke" d="M52 3.5 C78 2.5 98 9 97.5 20 C97 32 74 37.5 49 37 C23 36.5 2.5 31 3 19.5 C3.5 8.5 24 2.5 58 5"/></svg>';
  const CROSS = '<svg class="mark cross" viewBox="0 0 22 22" aria-hidden="true"><path pathLength="1" d="M3 3 L19 19"/><path pathLength="1" d="M19 3 L3 19"/></svg>';

  const QUOTES = [
    ["Small steps every day add up to big results.", "毎日の小さな一歩が、大きな結果になる。"],
    ["Five minutes today beats zero minutes forever.", "今日の5分は、ずっとゼロより強い。"],
    ["950 is not a wall. It's the next step.", "950点は壁じゃない。次の一段だ。"],
    ["Mistakes are just reviews waiting to happen.", "間違いは、次の復習の予約にすぎない。"],
    ["You don't have to be fast. Just don't stop.", "速くなくていい。止まらなければいい。"],
    ["Grammar is a puzzle. You are getting better at puzzles.", "文法はパズル。あなたは確実に上手くなっている。"],
    ["Consistency is your superpower.", "続けることが、あなたの必殺技。"],
    ["Today's effort is tomorrow's confidence.", "今日の努力が、明日の自信になる。"],
    ["Every question you answer is a vote for the new you.", "1問解くたびに、新しい自分に1票。"],
    ["Commute time is study time.", "通学時間は、伸びる時間。"],
    ["The best time to start was yesterday. The next best is now.", "始めるのに一番いいのは昨日。次にいいのは今。"],
    ["Progress, not perfection.", "完璧より、前進。"],
    ["One more term. You've got this.", "あと1ターム。いける。"],
  ];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  // 付せん
  function toast(text) {
    document.querySelectorAll(".toast").forEach(t => t.remove());
    const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
  }

  // ---- ホーム ----
  function decorateHome() {
    const stEl = app.querySelector(".stats");
    if (stEl && !app.querySelector(".quote")) {
      const d = new Date(); const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % QUOTES.length;
      const q = document.createElement("div"); q.className = "quote";
      q.innerHTML = `<div class="en"></div><div class="ja"></div>`;
      q.querySelector(".en").textContent = QUOTES[idx][0]; q.querySelector(".ja").textContent = QUOTES[idx][1];
      stEl.after(q);
    }

    let firstOpen = null;
    app.querySelectorAll(".term").forEach(t => {
      const num = t.querySelector(".num");
      if (!num || num.dataset.fx) return;
      num.dataset.fx = "1";
      if (t.id === "guide") { num.innerHTML = ICON.guide; return; }
      if (t.classList.contains("done")) num.innerHTML = ICON.check;
      else if (t.dataset.term === "6") num.innerHTML = ICON.moon;
      if (!t.classList.contains("done") && t.dataset.term && !firstOpen) firstOpen = t;
    });
    if (firstOpen && !app.querySelector(".nowtag")) {
      const tag = document.createElement("span"); tag.className = "nowtag"; tag.textContent = "← 次はここ"; firstOpen.appendChild(tag);
    }

    app.querySelectorAll(".genres tr").forEach(tr => {
      const tds = tr.querySelectorAll("td"); if (tds.length !== 2 || tr.querySelector(".gbar")) return;
      const pct = parseInt(tds[1].textContent, 10);
      const td = document.createElement("td");
      td.innerHTML = '<div class="gbar"><i></i></div>';
      td.style.width = "100%";
      tds[0].after(td);
      if (!isNaN(pct)) requestAnimationFrame(() => requestAnimationFrame(() => { td.querySelector("i").style.width = `${pct}%`; }));
    });

    if (!app.querySelector(".ver")) {
      const v = document.createElement("div"); v.className = "ver"; v.textContent = `TOEIC Daily ${VERSION}`;
      app.appendChild(v);
    }

    const first = stEl && stEl.querySelector(".stat b");
    const mm = first && first.textContent.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (mm && +mm[1] >= +mm[2] && store.get("toeic-fx-allclear") !== todayKey()) {
      store.set("toeic-fx-allclear", todayKey());
      setTimeout(() => toast("今日の5ターム、ぜんぶ終わり！"), 400);
    }
  }

  // ---- 結果：赤ペンの花丸 ----
  function hanamaru(full) {
    let spiral = "M75 75"; // 中心のうず巻き
    for (let a = 0; a <= Math.PI * 5; a += .25) {
      const r = 3 + a * 3.1; spiral += ` L${(75 + r * Math.cos(a)).toFixed(1)} ${(75 + r * Math.sin(a)).toFixed(1)}`;
    }
    const n = 9, R = 52, Ro = 68; // まわりの花びら
    let petals = "";
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2, am = (a0 + a1) / 2;
      const p0 = [75 + R * Math.cos(a0), 75 + R * Math.sin(a0)], p1 = [75 + R * Math.cos(a1), 75 + R * Math.sin(a1)];
      const c = [75 + Ro * Math.cos(am), 75 + Ro * Math.sin(am)];
      if (i === 0) petals += `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`;
      petals += ` Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
    }
    return `<path pathLength="1" d="${spiral}"/>${full ? `<path class="petal" pathLength="1" d="${petals}"/>` : ""}`;
  }
  function decorateFinish(big) {
    const card = big.closest(".card");
    if (!card || card.querySelector(".result-art")) return;
    const m = big.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    const score = m ? +m[1] : 0, total = m ? +m[2] : 0;
    const r = total ? score / total : 0;
    const [art, words] = r >= 1 ? [hanamaru(true), "たいへんよくできました"]
      : r >= .8 ? [hanamaru(true), "よくできました"]
      : r >= .5 ? ['<path pathLength="1" d="M78 22 C112 22 130 46 128 76 C126 108 100 128 72 127 C42 126 22 104 23 74 C24 44 46 24 84 26"/>', "がんばりました"]
      : ['<path pathLength="1" d="M40 80 C48 86 56 96 62 108 C76 80 96 56 118 38"/>', "もう一歩！ 復習でとりかえそう"];
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "result-art"); svg.setAttribute("viewBox", "0 0 150 150"); svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = art;
    card.prepend(svg);
    const cheer = document.createElement("div"); cheer.className = "cheer"; cheer.textContent = words;
    big.before(cheer);

    let doneN = 0;
    try { const S = JSON.parse(store.get("toeic-daily-v1")); doneN = ((S && S.days && S.days[todayKey()] && S.days[todayKey()].done) || []).length; } catch (e) {}
    if (doneN) {
      const dots = document.createElement("div"); dots.className = "daydots"; dots.setAttribute("aria-hidden", "true");
      dots.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < doneN ? "on" : ""}"></i>`).join("");
      (card.querySelector(".result-extras") || big).after(dots);
    }
    if (doneN >= 5 && store.get("toeic-fx-allclear") !== todayKey()) {
      store.set("toeic-fx-allclear", todayKey());
      setTimeout(() => toast("今日の5ターム、ぜんぶ終わり！"), 1200);
    }
  }

  // ---- 出題：丸付け ----
  let combo = 0;
  function onAnswered(choices) {
    if (choices.dataset.fx) return;
    choices.dataset.fx = "1";
    choices.classList.add("answered");
    const ok = choices.querySelector(".choice.ok");
    const wrong = choices.querySelector(".choice.ng");
    if (ok) ok.insertAdjacentHTML("beforeend", CIRCLE);
    if (wrong) wrong.insertAdjacentHTML("beforeend", CROSS);
    if (ok && !wrong) {
      combo++;
      if (combo >= 3) toast(combo >= 10 ? `${combo}問連続正解！ すごい` : `${combo}問連続正解！`);
      if (navigator.vibrate) navigator.vibrate(12);
    } else if (wrong) combo = 0;
  }
  // 「ポイント」を蛍光ペンで引いたように
  function decoratePoint(p) {
    if (p.dataset.fx) return;
    p.dataset.fx = "1";
    const txt = p.textContent.replace(/^\s*🎯\s*/u, "").replace(/^ポイント[：:]\s*/, "");
    p.innerHTML = `<span class="ok">ポイント</span>　<span class="hl"></span>`;
    p.querySelector(".hl").textContent = txt;
  }

  function enhance() {
    [...app.children].forEach((el, i) => { if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", Math.min(i, 8)); });
    if (app.querySelector(".terms")) { document.body.dataset.view = "home"; combo = 0; decorateHome(); }
    else if (app.querySelector(".choices")) document.body.dataset.view = "question";
    else if (app.querySelector(".big")) { document.body.dataset.view = "result"; decorateFinish(app.querySelector(".big")); }
    else if (app.querySelector(".guide")) document.body.dataset.view = "guide";
    else document.body.dataset.view = "other";
    const ch = app.querySelector(".choices");
    if (ch && ch.querySelector(".choice.ok, .choice.ng")) onAnswered(ch);
    app.querySelectorAll(".point").forEach(decoratePoint);
  }

  let pending = false;
  const schedule = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; enhance(); }); };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  enhance();
  window.fx = { toast };
})();
