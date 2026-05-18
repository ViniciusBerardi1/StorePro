const CACHE_NAME = 'storepro-v4';

const APP_SHELL = ['/', '/manifest.json', '/favicon-192.png', '/favicon-512.png', '/storeprologo.png', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Ignora requisições para APIs externas (Supabase, Google, etc.)
  // O SW só gerencia arquivos do próprio app
  if (url.origin !== self.location.origin) return;

  const { pathname } = url;
  // Navegações SPA (qualquer rota que retorna index.html) e assets de código
  // usam network-first para garantir que o bundle mais recente seja sempre servido.
  const isDynamic = e.request.mode === 'navigate' || /\.(html|js|css)$/.test(pathname);

  if (isDynamic) {
    // Network-first: sempre busca versão nova, cai no cache se offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first: imagens e assets estáticos locais
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
            return res;
          })
      )
    );
  }
});
