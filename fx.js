"use strict";
// TOEIC Daily の演出（アイコン・リング・紙吹雪・連続正解など）。
// app.js には手を入れず、#app の中身の変化を見て飾り付けます。学習記録は読むだけで書き換えません。
(() => {
  const app = document.getElementById("app");
  if (!app) return;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  // ---- アイコン（自作SVG）----
  const ICON = {
    1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h3"/><path d="M14 3h3a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-3"/></svg>',
    2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18 7.5 6 12 18"/><path d="M4.7 14h5.6"/><circle cx="17.5" cy="14.5" r="3.5"/><path d="M21 11v7"/></svg>',
    3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    4: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>',
    5: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    6: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/><circle cx="17" cy="5" r="1.2"/><circle cx="20.5" cy="9" r=".9"/></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    guide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V19c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5z"/><path d="M12 6v13.5"/></svg>',
  };
  const FLAME = '<svg viewBox="0 0 64 64"><defs><linearGradient id="flG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".55" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ffd166"/></linearGradient></defs><g class="flame"><path d="M32 4c4 10 16 16 16 32a16 16 0 0 1-32 0c0-8 4-13 8-17 0 6 3 9 6 10-2-9 0-17 2-25z" fill="url(#flG)"/><path d="M32 30c3 5 8 8 8 15a8 8 0 0 1-16 0c0-4 2-7 4-9 1 3 2 4 3 4-1-4 0-7 1-10z" fill="#fff3c4" opacity=".9"/></g></svg>';
  const GEM = '<svg viewBox="0 0 64 64"><defs><linearGradient id="gmG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ef0ff"/><stop offset=".5" stop-color="#8b7bff"/><stop offset="1" stop-color="#ff7ac6"/></linearGradient></defs><g class="gem"><path d="M18 10h28l12 14-26 32L6 24z" fill="url(#gmG)"/><path d="M6 24h52M18 10l8 14 6 32 6-32 8-14M26 24 32 10l6 14" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round"/></g></svg>';

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
    ["Aim for 990. Land among the stars.", "990を狙えば、どこに着地しても星の中。"],
    ["Commute time is study time.", "通学時間は、伸びる時間。"],
    ["The best time to start was yesterday. The next best is now.", "始めるのに一番いいのは昨日。次にいいのは今。"],
    ["Progress, not perfection.", "完璧より、前進。"],
    ["One more term. You've got this.", "あと1ターム。いける。"],
  ];

  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---- 背景（オーロラ・星・山並み）----
  function buildSky() {
    if (document.querySelector(".sky")) return;
    const sky = document.createElement("div");
    sky.className = "sky"; sky.setAttribute("aria-hidden", "true");
    let stars = "";
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 46; i++) stars += `<circle cx="${(rnd() * 100).toFixed(1)}%" cy="${(rnd() * 70).toFixed(1)}%" r="${(rnd() * 1.3 + .4).toFixed(2)}" fill="currentColor"/>`;
    sky.innerHTML = `<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
      <svg class="stars" xmlns="${NS}">${stars}</svg>
      <svg class="ridge" viewBox="0 0 400 100" preserveAspectRatio="none" xmlns="${NS}">
        <defs><linearGradient id="rg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b7bff" stop-opacity=".55"/><stop offset="1" stop-color="#8b7bff" stop-opacity="0"/></linearGradient>
        <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ac6" stop-opacity=".45"/><stop offset="1" stop-color="#ff7ac6" stop-opacity="0"/></linearGradient></defs>
        <path d="M0 70 L40 52 L80 64 L130 34 L170 56 L210 40 L260 20 L300 46 L340 36 L400 58 L400 100 L0 100Z" fill="url(#rg1)"/>
        <path d="M0 84 L60 66 L110 78 L170 60 L230 76 L290 58 L350 72 L400 66 L400 100 L0 100Z" fill="url(#rg2)"/>
        <path d="M260 20 L260 6 L272 10 L260 14" fill="#ffd166" opacity=".9"/>
      </svg>`;
    document.body.prepend(sky);
    // リング用のグラデーション定義（ページ内で共有）
    const defs = document.createElementNS(NS, "svg");
    defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    defs.innerHTML = '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cff"/><stop offset=".5" stop-color="#c86bff"/><stop offset="1" stop-color="#ff7ac6"/></linearGradient></defs>';
    document.body.appendChild(defs);
  }

  // ---- 紙吹雪 ----
  let canvas, ctx, parts = [], raf = 0;
  function confetti(n = 140, origin) {
    if (reduce) return;
    if (!canvas) {
      canvas = document.createElement("canvas"); canvas.id = "fx-canvas"; document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ["#7c6cff", "#c86bff", "#ff7ac6", "#ffd166", "#3ee6a0", "#38d1ff"];
    const ox = origin ? origin.x : innerWidth / 2, oy = origin ? origin.y : innerHeight * 0.35;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (origin ? 3 : 6) + Math.random() * (origin ? 5 : 9);
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (origin ? 2 : 5), g: .18 + Math.random() * .12,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .35,
        c: colors[i % colors.length], life: origin ? 50 + Math.random() * 20 : 150 + Math.random() * 60, round: Math.random() < .3 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vx *= .985; p.vy = p.vy * .985 + p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 30); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)));
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function toast(text) {
    document.querySelectorAll(".toast").forEach(t => t.remove());
    const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1900);
  }
  function plus(el, text) {
    const r = el.getBoundingClientRect();
    const p = document.createElement("div"); p.className = "plus"; p.textContent = text;
    p.style.left = `${r.right - 40}px`; p.style.top = `${r.top}px`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 1100);
  }
  function countUp(el, to, suffix) {
    if (reduce || !to) { el.textContent = `${to}${suffix}`; return; }
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = `${v}${suffix}`; if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---- 画面ごとの飾り付け ----
  const greet = () => { const h = new Date().getHours(); return h < 5 ? "GOOD NIGHT" : h < 11 ? "GOOD MORNING" : h < 17 ? "GOOD AFTERNOON" : "GOOD EVENING"; };
  let combo = 0;

  function decorateHome() {
    const top = app.querySelector(".top");
    if (top && !app.querySelector(".hello")) {
      const h = document.createElement("div"); h.className = "hello"; h.textContent = greet();
      top.before(h);
    }
    const stats = app.querySelectorAll(".stats .stat");
    stats.forEach((st, i) => {
      if (st.querySelector(".ico")) return;
      const b = st.querySelector("b"); if (!b) return;
      const txt = b.textContent.trim();
      const ico = document.createElement("span"); ico.className = "ico";
      const m = txt.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (m) {
        const done = +m[1], total = +m[2] || 5, C = 2 * Math.PI * 24;
        ico.innerHTML = `<svg viewBox="0 0 58 58"><circle class="ring-bg" cx="29" cy="29" r="24" fill="none" stroke-width="7"/>
          <circle class="ring-fg" cx="29" cy="29" r="24" fill="none" stroke-width="7" stroke-linecap="round" transform="rotate(-90 29 29)"
          stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><span class="ring-txt">${done}/${total}</span>`;
        st.classList.add("has-ring");
        if (done >= total) st.classList.add("full");
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const fg = ico.querySelector(".ring-fg"); if (fg) fg.style.strokeDashoffset = C * (1 - Math.min(done / total, 1));
        }));
        if (done >= total && store.get("toeic-fx-allclear") !== todayKey()) {
          store.set("toeic-fx-allclear", todayKey());
          setTimeout(() => { confetti(180); toast("🎉 今日の5ターム、全部クリア！"); }, 500);
        }
      } else if (/日$/.test(txt)) {
        ico.innerHTML = FLAME;
        const n = parseInt(txt, 10) || 0;
        if (!n) ico.querySelector(".flame").classList.add("cold");
        ico.style.transform = `scale(${Math.min(.8 + n * 0.03, 1.15)})`;
      } else {
        ico.innerHTML = GEM;
      }
      st.prepend(ico);
      if (/^\d+/.test(txt) && !m) countUp(b, parseInt(txt, 10), txt.replace(/^\d+/, ""));
    });

    const stEl = app.querySelector(".stats");
    if (stEl && !app.querySelector(".quote")) {
      const d = new Date(); const idx = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % QUOTES.length;
      const q = document.createElement("div"); q.className = "quote";
      q.innerHTML = `<div class="en"></div><div class="ja"></div>`;
      q.querySelector(".en").textContent = QUOTES[idx][0]; q.querySelector(".ja").textContent = QUOTES[idx][1];
      stEl.after(q);
    }

    let firstOpen = null;
    app.querySelectorAll(".term").forEach((t, i) => {
      t.style.setProperty("--i", i);
      const num = t.querySelector(".num");
      if (!num || num.dataset.fx) return;
      num.dataset.fx = "1";
      if (t.id === "guide") { num.innerHTML = ICON.guide; return; }
      const id = t.dataset.term;
      if (t.classList.contains("done")) num.innerHTML = ICON.done;
      else if (ICON[id]) num.innerHTML = ICON[id];
      if (!t.classList.contains("done") && id && !firstOpen) firstOpen = t;
      const name = t.querySelector(".name");
      if (name && id && id !== "6" && !t.classList.contains("done")) {
        const mn = document.createElement("span"); mn.className = "mins"; mn.textContent = "5分"; name.appendChild(mn);
      }
    });
    if (firstOpen) {
      firstOpen.classList.add("next");
      const tag = document.createElement("span"); tag.className = "nowtag"; tag.textContent = "NEXT"; firstOpen.appendChild(tag);
    }

    const GC = { "文法": "var(--c-grammar)", "語彙": "var(--c-vocab)", "長文読解": "var(--c-reading)", "言い換え": "var(--c-para)" };
    app.querySelectorAll(".genres tr").forEach(tr => {
      const tds = tr.querySelectorAll("td"); if (tds.length !== 2 || tr.querySelector(".gbar")) return;
      const pct = parseInt(tds[1].textContent, 10);
      const td = document.createElement("td");
      td.innerHTML = '<div class="gbar"><i></i></div>';
      td.style.width = "100%";
      td.querySelector(".gbar").style.setProperty("--gc", GC[tds[0].textContent.trim()] || "var(--accent)");
      tds[0].after(td);
      if (!isNaN(pct)) requestAnimationFrame(() => requestAnimationFrame(() => { td.querySelector("i").style.width = `${pct}%`; }));
    });
  }

  function decorateFinish(big) {
    const card = big.closest(".card");
    if (!card || card.querySelector(".result-art")) return;
    const m = big.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    const score = m ? +m[1] : 0, total = m ? +m[2] : 0;
    const r = total ? score / total : 0;
    const tier = r >= 1 ? ["#ffd166", "#ff9a3c", "PERFECT!"] : r >= .8 ? ["#ffd166", "#ff9a3c", "GREAT JOB!"] : r >= .5 ? ["#d9e2ff", "#8b9bd6", "NICE WORK!"] : ["#ffc8a8", "#e08a5a", "KEEP GOING!"];
    let rays = "";
    for (let i = 0; i < 12; i++) rays += `<path d="M75 75 L${75 + 80 * Math.cos(i * Math.PI / 6 - .1)} ${75 + 80 * Math.sin(i * Math.PI / 6 - .1)} L${75 + 80 * Math.cos(i * Math.PI / 6 + .1)} ${75 + 80 * Math.sin(i * Math.PI / 6 + .1)}Z"/>`;
    const art = document.createElementNS(NS, "svg");
    art.setAttribute("class", "result-art"); art.setAttribute("viewBox", "0 0 150 150"); art.setAttribute("aria-hidden", "true");
    art.innerHTML = `<defs><radialGradient id="rayG"><stop offset="0" stop-color="${tier[0]}" stop-opacity=".55"/><stop offset="1" stop-color="${tier[0]}" stop-opacity="0"/></radialGradient>
      <linearGradient id="mdG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tier[0]}"/><stop offset="1" stop-color="${tier[1]}"/></linearGradient></defs>
      <g class="rays" fill="url(#rayG)">${rays}</g>
      <g class="medal">
        <path d="M58 28 L50 4 L66 4 L75 24 L84 4 L100 4 L92 28" fill="#8b7bff"/><path d="M66 4 L75 24 L84 4" fill="#ff7ac6"/>
        <circle cx="75" cy="80" r="40" fill="url(#mdG)"/><circle cx="75" cy="80" r="31" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-dasharray="4 4"/>
        <path d="M75 60 l6.2 12.6 13.8 2-10 9.8 2.4 13.8L75 91.7l-12.4 6.5 2.4-13.8-10-9.8 13.8-2z" fill="#fff"/>
      </g>`;
    card.prepend(art);
    const cheer = document.createElement("div"); cheer.className = "cheer"; cheer.textContent = tier[2];
    big.before(cheer);
    if (m && !reduce) {
      const t0 = performance.now();
      const step = now => { const k = Math.min(1, (now - t0) / 800); big.textContent = `${Math.round(score * k)} / ${total}`; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    // 今日の進み具合（5つの点）
    let doneN = 0;
    try { const S = JSON.parse(store.get("toeic-daily-v1")); const d = new Date();
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      doneN = ((S && S.days && S.days[k] && S.days[k].done) || []).length; } catch (e) {}
    if (doneN) {
      const dots = document.createElement("div"); dots.className = "daydots"; dots.setAttribute("aria-hidden", "true");
      dots.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < doneN ? "on" : ""} ${i === doneN - 1 ? "new" : ""}"></i>`).join("");
      big.after(dots);
    }
    if (r >= .8) setTimeout(() => confetti(r >= 1 ? 200 : 130), 350);
    if (doneN >= 5 && store.get("toeic-fx-allclear") !== todayKey()) {
      store.set("toeic-fx-allclear", todayKey());
      setTimeout(() => { confetti(200); toast("🎉 今日の5ターム、全部クリア！"); }, 1200);
    }
  }

  function onAnswered(choices) {
    if (choices.dataset.fx) return;
    choices.dataset.fx = "1";
    choices.classList.add("answered");
    const ok = choices.querySelector(".choice.ok");
    const wrong = choices.querySelector(".choice.ng");
    if (ok && !wrong) {
      combo++;
      const r = ok.getBoundingClientRect();
      confetti(28, { x: r.left + r.width * .8, y: r.top + r.height / 2 });
      plus(ok, combo >= 3 ? `+1 ×${combo}` : "+1");
      if (combo >= 3) toast(combo >= 10 ? `🚀 ${combo}問連続正解！止まらない！` : combo >= 5 ? `⚡ ${combo}問連続正解！` : `🔥 ${combo}問連続正解！`);
      if (navigator.vibrate) navigator.vibrate(15);
    } else if (wrong) {
      combo = 0;
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    }
  }

  function enhance() {
    // 画面の直下の要素を順番にふわっと出す
    [...app.children].forEach((el, i) => { if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", i); });
    if (app.querySelector(".terms")) { document.body.dataset.view = "home"; combo = 0; decorateHome(); }
    else if (app.querySelector(".choices")) document.body.dataset.view = "question";
    else if (app.querySelector(".big")) { document.body.dataset.view = "result"; decorateFinish(app.querySelector(".big")); }
    else if (app.querySelector(".guide")) document.body.dataset.view = "guide";
    else document.body.dataset.view = "other";
    const ch = app.querySelector(".choices");
    if (ch && ch.querySelector(".choice.ok, .choice.ng")) onAnswered(ch);
  }

  let pending = false;
  const schedule = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; enhance(); }); };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  buildSky();
  enhance();
  window.fx = { confetti, toast };
})();
