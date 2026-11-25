// AR 試擺間：iPhone AR（Quick Look）只有「網站上的檔案」才會遵守「不能縮放」。
// 網頁當場產生的 iPhone 模型先存進瀏覽器快取，這裡用一般網址把它提供出去。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (!u.pathname.includes('/usdz-gen/')) return;
  e.respondWith(caches.open('ar-usdz').then(c => c.match(u.origin + u.pathname)).then(r => r || new Response('not found', { status: 404 })));
});
