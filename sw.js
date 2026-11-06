// オフラインでも前回読み込んだ問題で学習できるようにするキャッシュ（ネットワーク優先）
// 更新したら CACHE の番号を上げる。ブラウザのHTTPキャッシュも使わず毎回最新を取りに行く。
const CACHE = "toeic-daily-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(url.href, { cache: "no-cache", credentials: "same-origin" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
