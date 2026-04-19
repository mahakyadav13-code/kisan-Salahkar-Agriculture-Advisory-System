// Kisan Salahkar — Service Worker (PWA Offline Support)
const CACHE_NAME = 'kisan-salahkar-v2';
const STATIC_ASSETS = [
    '/dashboard',
    '/crop',
    '/weather',
    '/disease',
    '/static/css/style.css',
    '/static/js/main.js',
    '/static/js/i18n.js',
    '/manifest.json',
];

// Install — cache essential static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET and API requests
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Offline — serve from cache
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // Return offline fallback for HTML pages
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return new Response(
                            '<html><body style="font-family:Poppins,sans-serif;text-align:center;padding:4rem 1rem">' +
                            '<h1 style="color:#1a7431">🌾 Kisan Salahkar</h1>' +
                            '<p>You are currently offline. Please check your internet connection.</p>' +
                            '<p>आप वर्तमान में ऑफ़लाइन हैं। कृपया अपना इंटरनेट कनेक्शन जाँचें।</p></body></html>',
                            { headers: { 'Content-Type': 'text/html' } }
                        );
                    }
                });
            })
    );
});
