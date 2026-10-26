// Lets Actinerary open without a connection. Your lists themselves are cached by Firestore, not here.
// Bump VERSION when you deploy changes so devices pick them up.
const VERSION = 'actinerary-v12';
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './logic.js', './store.js', './firebase-config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  SDK + 'firebase-app.js', SDK + 'firebase-auth.js', SDK + 'firebase-firestore.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/__/')) return; // Firebase sign-in pages: always live
    // Serve the saved copy right away, refresh it in the background.
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const key = req.mode === 'navigate' ? './index.html' : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const fresh = fetch(req).then(res => {
        if (res.ok && req.mode !== 'navigate') cache.put(req, res.clone());
        if (res.ok && req.mode === 'navigate' && url.pathname === '/') cache.put('./index.html', res.clone());
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(fresh); return hit; }
      return (await fresh) || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // Firebase SDK files are versioned, and fonts never change: cache them once.
  if (url.href.startsWith(SDK) || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 503 });
      }
    })());
  }
  // Everything else (Firestore, Google sign-in) goes straight to the network.
});
