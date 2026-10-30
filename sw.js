const CACHE = 'small-room-v13';

const PRECACHE = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './data/messages.json', './data/meditations.json', './data/stories.json',
  './data/scheduled-audio.json', './data/journal-prompts.json', './data/voices.json',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('small-room-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'SELF_CARE_APP_VERSION', version: CACHE }));
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_SELF_CARE_APP_VERSION') {
    event.source?.postMessage({ type: 'SELF_CARE_APP_VERSION', version: CACHE });
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // 開き直した画面・JS・CSSもオンラインでは最新を取得する。
  // オフラインでは、この版の保存済みファイルを表示する。
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(new Request(event.request, { cache: 'no-cache' }));
      if (!response.ok) throw new Error('Network response was not successful');
      try { await cache.put(event.request, response.clone()); } catch (_) { /* 保存容量がなくても最新の画面は表示する。 */ }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const index = await cache.match('./index.html');
        if (index) return index;
      }
      throw error;
    }
  })());
});

