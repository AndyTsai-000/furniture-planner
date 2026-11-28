// AR 試擺間 Service Worker
// 1. iPhone AR（Quick Look）只有「網站上的檔案」才會遵守「不能縮放」：網頁當場產生的 iPhone 模型存進 ar-usdz 快取，這裡用一般網址提供。
// 2. 網路不好時也能開：頁面先用網路（4 秒沒回應就用快取）；模型、縮圖、建模程式用過就存起來，下次直接用快取，背景再檢查有沒有更新。
const RT = 'ar-rt', CDN = 'ar-cdn', USDZ = 'ar-usdz';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![RT, CDN, USDZ].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

const checked = new Set();   // 這次開啟已經檢查過更新的檔案（同一個檔案只檢查一次，省流量）
async function refresh(req, key, cache, old) {
  if (checked.has(key)) return; checked.add(key);
  try {
    const h = {}, et = old && old.headers.get('ETag'), lm = old && old.headers.get('Last-Modified');
    if (et) h['If-None-Match'] = et; else if (lm) h['If-Modified-Since'] = lm;
    const r = await fetch(key, { headers: h, cache: 'no-store' });
    if (r.status === 200) await cache.put(key, r);
  } catch (e) {}
}
async function cacheFirst(e, key) {
  const cache = await caches.open(RT), hit = await cache.match(key, { ignoreSearch: true });
  if (hit) { e.waitUntil(refresh(e.request, key, cache, hit)); return hit; }
  const r = await fetch(e.request);
  if (r.ok && r.status === 200) { checked.add(key); e.waitUntil(cache.put(key, r.clone())); }
  return r;
}
async function pageFirst(e, key) {
  const cache = await caches.open(RT);
  const net = fetch(e.request).then(r => { if (r.ok) cache.put(key, r.clone()); return r; });
  const timeout = new Promise(res => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, timeout.then(() => null)]);
    if (r) return r;
  } catch (err) {}
  const hit = await cache.match(key, { ignoreSearch: true });
  return hit || net;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.pathname.includes('/usdz-gen/')) {
    e.respondWith(caches.open(USDZ).then(c => c.match(u.origin + u.pathname)).then(r => r || new Response('not found', { status: 404 })));
    return;
  }
  if (req.headers.has('range')) return;
  if (u.origin === location.origin) {
    const scope = new URL(self.registration.scope);
    if (!u.pathname.startsWith(scope.pathname) || /\.usdz$/.test(u.pathname)) return;   // iPhone 正式 AR 檔直接走網路
    const key = u.origin + u.pathname;
    if (req.mode === 'navigate' || u.pathname === scope.pathname || u.pathname.endsWith('/index.html')) { e.respondWith(pageFirst(e, scope.href)); return; }
    if (/\/(models|thumbs|materials)\/|\/(engine|frame)\.js$/.test(u.pathname)) { e.respondWith(cacheFirst(e, key)); return; }
    return;
  }
  // 固定版本的外部程式庫（model-viewer、three.js、QR Code、字型）
  if (/^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) {
    e.respondWith(caches.open(CDN).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r;
    }));
  }
});
