const CACHE_VERSION = 'v2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Core assets to cache immediately
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/main.js',
    '/manifest.json',
    OFFLINE_PAGE,
    'https://fonts.googleapis.com/css2?family=VT323&display=swap',
    'https://fonts.gstatic.com/s/vt323/v17/pxiKyp0ihIEF2isfFJU.woff2'
];

// Additional assets to cache when possible
const OPTIONAL_ASSETS = [
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/preview.jpg'
];

// Cache duration in milliseconds
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Install event - cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE)
                .then(cache => cache.addAll(CORE_ASSETS)),
            caches.open(DYNAMIC_CACHE)
                .then(cache => cache.addAll(OPTIONAL_ASSETS))
        ])
        .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Remove old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => 
                            cacheName.startsWith('static-') || 
                            cacheName.startsWith('dynamic-'))
                        .filter(cacheName => 
                            cacheName !== STATIC_CACHE && 
                            cacheName !== DYNAMIC_CACHE)
                        .map(cacheName => caches.delete(cacheName))
                );
            }),
            // Clean up expired items from dynamic cache
            caches.open(DYNAMIC_CACHE).then(cache => {
                return cache.keys().then(requests => {
                    return Promise.all(
                        requests.map(request => {
                            return cache.match(request).then(response => {
                                if (response) {
                                    const dateHeader = response.headers.get('date');
                                    if (dateHeader) {
                                        const cacheDate = new Date(dateHeader).getTime();
                                        if (Date.now() - cacheDate > CACHE_DURATION) {
                                            return cache.delete(request);
                                        }
                                    }
                                }
                                return Promise.resolve();
                            });
                        })
                    );
                });
            })
        ]).then(() => self.clients.claim())
    );
});

// Fetch event - network-first strategy with fallback to cache
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Skip cross-origin requests
    if (!request.url.startsWith(self.location.origin)) {
        return;
    }

    // Handle API requests
    if (request.url.includes('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response;
                })
                .catch(() => {
                    return new Response(
                        JSON.stringify({
                            error: 'Nepavyko prisijungti prie serverio. Patikrinkite interneto ryšį.'
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' },
                            status: 503
                        }
                    );
                })
        );
        return;
    }

    // Handle static assets
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Return cached response and update cache in background
                    event.waitUntil(
                        fetch(request)
                            .then(networkResponse => {
                                if (networkResponse.ok) {
                                    caches.open(STATIC_CACHE)
                                        .then(cache => cache.put(request, networkResponse));
                                }
                            })
                            .catch(() => {})
                    );
                    return cachedResponse;
                }

                return fetch(request)
                    .then(networkResponse => {
                        if (!networkResponse.ok) {
                            throw new Error('Network response was not ok');
                        }

                        // Cache successful responses
                        const responseToCache = networkResponse.clone();
                        event.waitUntil(
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => cache.put(request, responseToCache))
                        );

                        return networkResponse;
                    })
                    .catch(error => {
                        console.error('Fetch failed:', error);
                        
                        // Return offline page for navigation requests
                        if (request.mode === 'navigate') {
                            return caches.match(OFFLINE_PAGE);
                        }

                        // Return a simple error response for other requests
                        return new Response(
                            'Offline content not available',
                            {
                                status: 503,
                                statusText: 'Service Unavailable',
                                headers: new Headers({
                                    'Content-Type': 'text/plain'
                                })
                            }
                        );
                    });
            })
    );
});

// Background sync for failed requests
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-haikus') {
        event.waitUntil(
            // Implement background sync logic here
            Promise.resolve()
        );
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        event.waitUntil(
            self.registration.showNotification('Naujas Haiku', {
                body: data.message,
                icon: '/icons/icon-192.png',
                badge: '/icons/badge-72.png',
                vibrate: [100, 50, 100],
                data: {
                    url: data.url
                }
            })
        );
    }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});

// Helper function to determine if a request should be cached
function shouldCache(request) {
    const url = new URL(request.url);
    
    // Don't cache API requests
    if (url.pathname.startsWith('/api/')) {
        return false;
    }

    // Don't cache query string URLs
    if (url.search) {
        return false;
    }

    // Cache GET requests only
    if (request.method !== 'GET') {
        return false;
    }

    return true;
}

// Helper function to handle network timeouts
function timeoutPromise(promise, timeout = 5000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
}