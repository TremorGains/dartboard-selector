// DartPick service worker: keeps a copy of the app so it opens offline.
// Only same-origin GET requests are handled — anything else (such as ad requests,
// once ads exist) goes straight to the network untouched.

const CACHE = 'dartpick-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'privacy.html',
  'how-to.html',
  'faq.html',
  'about.html',
  'contact.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/board.js',
  'src/dart.js',
  'src/entries.js',
  'src/image-store.js',
  'src/images.js',
  'src/layout.js',
  'src/main.js',
  'src/panel.js',
  'src/picker.js',
  'src/random.js',
  'src/reveal.js',
  'src/sound.js',
  'src/store.js',
  'src/toast.js',
  'src/your-data.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: answer from the cache straight away and refresh it in the background.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
