"use strict";
// PCとスマホの学習記録の同期（GitHub の secret Gist に保存）。app.js の後に読み込みます。
// - 記録は localStorage の "toeic-daily-" で始まるキー（トークンと同期設定は除く）をまとめて1つのGistに置きます。
// - 送る前に必ずGistの最新を読み、端末どうしの記録をマージしてから書き込みます（オフラインで別々に進めても消えません）。
// - Gist は「secret（URLを知っている人だけ見られる）」で作成し、リポジトリには何も書きません。
(function () {
  const META_KEY = "toeic-daily-sync";
  const SKIP = new Set(["toeic-daily-token", META_KEY]);
  const PREFIX = "toeic-daily-";
  const FILE = "toeic-daily-sync.json";
  const DESC = "TOEIC Daily 学習記録（PCとスマホの同期用・自動作成）";
  const MAIN = typeof STORE_KEY === "string" ? STORE_KEY : "toeic-daily-v1";

  // ---------------- マージ ----------------
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  const J = v => JSON.stringify(v);
  // 配列を「重複も数える集合」としてマージ：remote ＋（local のうち base に無かった分）。base が無ければ多い方の数。
  function mergeMulti(a = [], b = [], base) {
    const count = xs => { const m = new Map(); for (const x of xs) { const k = J(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
    const ca = count(a), cb = count(b), c0 = base ? count(base) : null, out = [];
    const vals = new Map([...a, ...b].map(x => [J(x), x]));
    for (const [k, x] of vals) {
      const n = c0 ? (cb.get(k) || 0) + Math.max(0, (ca.get(k) || 0) - (c0.get(k) || 0))
        : Math.max(ca.get(k) || 0, cb.get(k) || 0);
      for (let i = 0; i < n; i++) out.push(x);
    }
    return out;
  }
  const union = (a = [], b = []) => [...new Map([...a, ...b].map(x => [J(x), x])).values()];
  // 1件の記録（問題・単語など）：更新時刻 t → 回答回数 seen → 最終回答日 の順で新しい方
  function pickRecord(a, b, aNewer) {
    if (!a) return b; if (!b) return a;
    if ((a.t || 0) !== (b.t || 0)) return (a.t || 0) > (b.t || 0) ? a : b;
    if ((a.seen || 0) !== (b.seen || 0)) return (a.seen || 0) > (b.seen || 0) ? a : b;
    const da = (a.last && a.last.date) || "", db = (b.last && b.last.date) || "";
    if (da !== db) return da > db ? a : b;
    return aNewer ? a : b;
  }
  // 形がわからないデータ用の汎用マージ（単語帳など、ほかの機能の記録）
  function deepMerge(a, b, aNewer) {
    if (a === undefined) return b; if (b === undefined) return a;
    if (isObj(a) && isObj(b)) {
      if (["t", "seen"].some(k => typeof a[k] === "number" || typeof b[k] === "number")) return pickRecord(a, b, aNewer);
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = deepMerge(a[k], b[k], aNewer);
      return out;
    }
    if (Array.isArray(a) && Array.isArray(b)) return union(a, b);
    return aNewer ? a : b;
  }
  const perKey = (a = {}, b = {}, f) => {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = f(a[k], b[k], k);
    return out;
  };
  // 連続記録：マージ後の学習日（休み券の日も含む）から、lastDay まで何日続いているか
  function runTo(lastDay, days, frozen) {
    const filled = new Set([...Object.keys(days).filter(d => days[d] && days[d].done && days[d].done.length), ...(frozen || [])]);
    let n = 0; const d = new Date(lastDay + "T00:00:00");
    while (filled.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function mergeM(a, b, base, aNewer, days) {
    if (!a) return b; if (!b) return a;
    const out = deepMerge(a, b, aNewer);
    const bx = base && typeof base.xp === "number" ? base.xp : null;
    out.xp = Math.max(a.xp || 0, b.xp || 0, bx !== null ? (a.xp || 0) + (b.xp || 0) - bx : 0);
    out.log = mergeMulti(a.log, b.log, base && base.log).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
    // 連続記録まわりは、最後に学習した日が新しい方を採用し、マージ後の学習日で連続日数を補正
    const la = a.lastDay || "", lb = b.lastDay || "";
    const w = la !== lb ? (la > lb ? a : b) : (a.streak || 0) !== (b.streak || 0) ? ((a.streak || 0) > (b.streak || 0) ? a : b) : (aNewer ? a : b);
    out.lastDay = w.lastDay; out.freezes = w.freezes; out.comebackDay = w.comebackDay;
    out.frozen = union(a.frozen, b.frozen).sort();
    out.streak = w.lastDay ? Math.max(w.streak || 0, runTo(w.lastDay, days, out.frozen)) : (w.streak || 0);
    out.badges = perKey(a.badges, b.badges, (x, y) => (!x ? y : !y ? x : x < y ? x : y));
    out.best = perKey(a.best, b.best, (x, y) => {
      if (!x) return y; if (!y) return x;
      const rx = x.score / x.total, ry = y.score / y.total;
      return rx !== ry ? (rx > ry ? x : y) : x.sec <= y.sec ? x : y;
    });
    return out;
  }
  // 学習記録（app.js の S）のマージ
  function mergeMain(L, R, B) {
    if (!isObj(R)) return L; if (!isObj(L)) return R;
    B = isObj(B) ? B : {};
    const aNewer = (L.savedAt || 0) >= (R.savedAt || 0);
    const out = deepMerge(L, R, aNewer); // 知らない項目は新しく保存した方
    out.items = perKey(L.items, R.items, (a, b) => pickRecord(a, b, aNewer));
    out.days = perKey(L.days, R.days, (a, b) => (!a ? b : !b ? a : { ...b, ...a, done: union(a.done, b.done).sort((x, y) => x - y), bonus: !!(a.bonus || b.bonus) }));
    out.picks = perKey(L.picks, R.picks, (a, b) => ({ ...(b || {}), ...(a || {}) }));
    out.similar = perKey(L.similar, R.similar, (a, b) => union(a, b));
    out.m = mergeM(L.m, R.m, B.m, aNewer, out.days);
    out.savedAt = Math.max(L.savedAt || 0, R.savedAt || 0);
    return out;
  }

  // 単語帳（cards.js の "toeic-daily-vocab"）：単語ごとに t が新しい方。設定などは最後に更新した端末の方。
  function mergeVocab(L, R) {
    if (!isObj(R)) return L; if (!isObj(L)) return R;
    const newest = d => Math.max(0, ...Object.values(d.words || {}).map(w => (w && w.t) || 0));
    const out = { ...(newest(L) >= newest(R) ? { ...R, ...L } : { ...L, ...R }) };
    out.words = perKey(L.words, R.words, (a, b) => pickRecord(a, b, true));
    return out;
  }
  const mergers = { [MAIN]: mergeMain, "toeic-daily-vocab": mergeVocab };
  function register(key, fn) { mergers[key] = fn; }
  (window.TDSync_pending || []).forEach(([k, f]) => register(k, f));
  function mergeKey(key, local, remote, base) {
    if (local === undefined) return remote; if (remote === undefined) return local;
    const f = mergers[key];
    if (f) return f(local, remote, base);
    const tl = (isObj(local) && (local.savedAt || local.t)) || 0, tr = (isObj(remote) && (remote.savedAt || remote.t)) || 0;
    return deepMerge(local, remote, tl >= tr);
  }

  // ---------------- 端末側の保存 ----------------
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
  };
  const meta = () => { try { return JSON.parse(ls.get(META_KEY)) || {}; } catch (e) { return {}; } };
  const setMeta = m => ls.set(META_KEY, J(m));
  function localDoc() {
    const keys = {};
    for (const k of ls.keys()) {
      if (!k.startsWith(PREFIX) || SKIP.has(k)) continue;
      try { keys[k] = JSON.parse(ls.get(k)); } catch (e) { keys[k] = ls.get(k); }
    }
    return keys;
  }
  function writeLocal(keys) {
    let changed = false;
    for (const [k, v] of Object.entries(keys)) {
      const s = typeof v === "string" ? v : J(v);
      if (ls.get(k) !== s) { ls.set(k, s); changed = true; }
    }
    return changed;
  }

  // ---------------- Gist ----------------
  const token = () => (typeof getToken === "function" ? getToken() : ls.get("toeic-daily-token")) || "";
  async function api(path, opts = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token()}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    });
    if (!res.ok) {
      const e = new Error(res.status === 401 ? "トークンが正しくないか、期限が切れています。"
        : res.status === 403 || res.status === 404 ? "トークンに Gists の権限（Read and write）がありません。READMEの手順で追加してください。"
        : `GitHubとの通信に失敗しました（${res.status}）。`);
      e.status = res.status; throw e;
    }
    return res.json();
  }
  async function readGist(id) {
    const g = await api(`/gists/${id}`);
    const f = g.files && g.files[FILE];
    if (!f) return null;
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: "no-store" })).text() : f.content;
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  async function findGist() {
    for (let page = 1; page <= 5; page++) {
      const list = await api(`/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && x.files[FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return null;
  }
  const docText = keys => J({ app: "toeic-daily", v: 1, updatedAt: new Date().toISOString(), keys }, null, 1);

  // ---------------- 同期 ----------------
  let running = null, timer = null;
  const status = { state: "", msg: "" };
  function setStatus(state, msg) { status.state = state; status.msg = msg; const el = document.getElementById("syncStatus"); if (el) el.innerHTML = statusHtml(); }

  async function syncNow() {
    if (running) { await running; }
    const m = meta();
    if (!m.enabled || !token()) return false;
    running = (async () => {
      setStatus("busy", "同期中…");
      let id = m.gistId, remote = null;
      if (id) {
        try { remote = await readGist(id); } catch (e) { if (e.status === 404) id = null; else throw e; }
      }
      if (!id) { id = await findGist(); if (id) remote = await readGist(id); }
      const local = localDoc(), base = (m.base) || {};
      const rkeys = (remote && remote.keys) || {};
      const merged = {};
      for (const k of new Set([...Object.keys(local), ...Object.keys(rkeys)])) merged[k] = mergeKey(k, local[k], rkeys[k], base[k]);
      const localChanged = writeLocal(merged);
      if (localChanged) reloadState(); // 通信を待つ間に解答しても、マージ済みの記録に積み上がるよう先に入れ替える
      if (!id) {
        const g = await api("/gists", { method: "POST", body: J({ description: DESC, public: false, files: { [FILE]: { content: docText(merged) } } }) });
        id = g.id;
      } else if (J(merged) !== J(rkeys)) {
        await api(`/gists/${id}`, { method: "PATCH", body: J({ files: { [FILE]: { content: docText(merged) } } }) });
      }
      setMeta({ ...meta(), enabled: true, gistId: id, base: merged, lastSync: Date.now() });
      if (localChanged) rerender();
      setStatus("ok", "");
      return true;
    })();
    try { return await running; }
    catch (e) { setStatus("err", e.message || "同期できませんでした。"); throw e; }
    finally { running = null; }
  }
  // 別の端末の記録が入ったら、画面に反映（解いている途中は記録だけ入れ替える）
  function reloadState() { try { if (typeof load === "function") S = load(); } catch (e) {} }
  function rerender() { if (typeof home === "function" && document.querySelector("#app .term[data-term]")) home(); }
  const quiet = () => syncNow().catch(() => {});
  function schedule(ms = 1500) { clearTimeout(timer); timer = setTimeout(quiet, ms); }

  window.addEventListener("toeic:saved", () => schedule());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { if (Date.now() - (meta().lastSync || 0) > 20000) schedule(200); }
    else if (timer) { clearTimeout(timer); quiet(); }
  });
  window.addEventListener("online", () => schedule(500));
  // ブラウザが空き容量不足のときに記録を消さないよう依頼（ホーム画面に追加したアプリでは通常そのまま残ります）
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if (meta().enabled) schedule(300);

  // ---------------- バックアップ（ファイルに書き出す・読み込む）----------------
  function exportFile() {
    const blob = new Blob([docText(localDoc())], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `toeic-daily-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function importFile(file) {
    const doc = JSON.parse(await file.text());
    if (!doc || doc.app !== "toeic-daily" || !isObj(doc.keys)) throw new Error("TOEIC Daily のバックアップファイルではありません。");
    const local = localDoc(), merged = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(doc.keys)])) merged[k] = mergeKey(k, local[k], doc.keys[k], undefined);
    writeLocal(merged);
    reloadState();
    if (meta().enabled) quiet();
  }

  // ---------------- 設定画面のカード（app.js の settings() にある #syncCard に描く）----------------
  const hm = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  function statusHtml() {
    const m = meta();
    if (status.state === "busy") return `<span class="muted">同期中…</span>`;
    if (status.state === "err") return `<b class="ng">同期できませんでした。</b>${String(status.msg).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}`;
    if (!m.enabled) return `<span class="muted">同期はオフです。</span>`;
    return `<b class="ok">同期はオンです。</b>${m.lastSync ? `最後に同期：${hm(m.lastSync)}` : ""}`;
  }
  function renderCard(el) {
    if (!el) return;
    const m = meta();
    el.innerHTML = `
      <div class="card">
        <h2>PCとスマホの記録を同期</h2>
        <div class="muted">同じGitHubトークンを入れた端末どうしで、学習記録（単語帳も含む）を自動で合わせます。記録はあなたのGitHubアカウントの secret Gist（一覧に出ず、URLを知る人だけが見られる場所）に保存され、公開リポジトリには入りません。トークンには Gists の権限が必要です（READMEの手順）。</div>
        <div id="syncStatus" style="margin:8px 0">${statusHtml()}</div>
        ${m.enabled
          ? `<button class="btn ghost" id="syncNow">今すぐ同期</button><button class="link" id="syncOff">同期をオフにする</button>`
          : `<button class="btn ghost" id="syncOn">同期をオンにする</button>`}
        <h2 style="margin-top:18px">記録のバックアップ</h2>
        <div class="muted">念のため、記録をファイルに保存しておけます。読み込むと、今の記録とまとめます（消えません）。</div>
        <button class="btn ghost" id="bkOut">記録をファイルに保存</button>
        <label class="btn ghost" style="display:block;text-align:center">ファイルから読み込む<input type="file" id="bkIn" accept="application/json,.json" hidden></label>
        <div id="bkMsg" class="muted"></div>
      </div>`;
    const tokenInput = () => { const t = document.getElementById("token"); if (t && typeof setToken === "function") setToken(t.value.trim()); };
    const on = document.getElementById("syncOn");
    if (on) on.onclick = async () => {
      tokenInput();
      if (!token()) return setStatus("err", "先に下のGitHubのトークンを入力してください。");
      setMeta({ ...meta(), enabled: true });
      try { await syncNow(); renderCard(el); } catch (e) { setMeta({ ...meta(), enabled: false }); }
    };
    const now = document.getElementById("syncNow");
    if (now) now.onclick = () => { tokenInput(); quiet(); };
    const off = document.getElementById("syncOff");
    if (off) off.onclick = () => { setMeta({ ...meta(), enabled: false }); status.state = ""; renderCard(el); };
    document.getElementById("bkOut").onclick = exportFile;
    document.getElementById("bkIn").onchange = async e => {
      const f = e.target.files[0], msg = document.getElementById("bkMsg");
      if (!f) return;
      try { await importFile(f); msg.innerHTML = `<b class="ok">読み込みました。</b>`; }
      catch (err) { msg.innerHTML = `<b class="ng">読み込めませんでした。</b>${String(err.message).replace(/[&<>]/g, "")}`; }
    };
  }
  // 設定画面が開いたら自動でカードを描く（app.js 側は <div id="syncCard"></div> を置くだけ）
  const app = document.getElementById("app");
  if (app) new MutationObserver(() => { const el = document.getElementById("syncCard"); if (el && !el.firstChild) renderCard(el); })
    .observe(app, { childList: true, subtree: true });

  window.TDSync = { register, syncNow, renderCard, _merge: { mergeMain, mergeKey, mergeMulti, deepMerge } };
})();
