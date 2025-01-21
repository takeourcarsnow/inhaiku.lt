// Cache versioning
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAMES = {
    static: `static-${CACHE_VERSION}`,
    dynamic: `dynamic-${CACHE_VERSION}`,
    api: `api-${CACHE_VERSION}`
};

// Assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/main.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=VT323&display=swap',
    'https://fonts.gstatic.com/s/vt323/v17/pxiKyp0ihIEF2isfFJU.woff2'
];

// Cache duration in milliseconds
const CACHE_DURATION = {
    api: 5 * 60 * 1000, // 5 minutes
    dynamic: 24 * 60 * 60 * 1000 // 24 hours
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAMES.static)
                .then(cache => cache.addAll(STATIC_ASSETS)),
            self.skipWaiting()
        ]).catch(error => {
            console.error('Cache initialization failed:', error);
            // Continue installation even if caching fails
            self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Remove old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (!Object.values(CACHE_NAMES).includes(cacheName)) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all clients
            self.clients.claim()
        ])
    );
});

// Helper: Check if a response is valid
function isValidResponse(response) {
    return response && response.status === 200 && response.type === 'basic';
}

// Helper: Check if a response is expired
function isResponseExpired(response, maxAge) {
    if (!response || !response.headers || !response.headers.get('date')) {
        return true;
    }
    const dateHeader = response.headers.get('date');
    const date = new Date(dateHeader).getTime();
    return Date.now() - date > maxAge;
}

// Helper: Create error response
function createErrorResponse(message) {
    return new Response(
        JSON.stringify({
            error: message,
            offline: !navigator.onLine
        }),
        {
            status: 503,
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );
}

// Network-first strategy with timeout
async function networkFirstWithTimeout(request, timeout = 3000) {
    try {
        // Try network first
        const networkPromise = fetch(request);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Network timeout')), timeout);
        });

        const response = await Promise.race([networkPromise, timeoutPromise]);
        
        // Cache successful responses
        if (isValidResponse(response)) {
            const cache = await caches.open(CACHE_NAMES.dynamic);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Fall back to cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Stale-while-revalidate strategy for API
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAMES.api);
    const cachedResponse = await cache.match(request);

    // Start network fetch
    const networkPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    });

    // Return cached response immediately if available and not expired
    if (cachedResponse && !isResponseExpired(cachedResponse, CACHE_DURATION.api)) {
        networkPromise.catch(console.error);
        return cachedResponse;
    }

    try {
        return await networkPromise;
    } catch (error) {
        if (cachedResponse) {
            return cachedResponse;
        }
        return createErrorResponse('Failed to fetch data');
    }
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Handle static assets
    if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(
            caches.match(request)
                .then(response => response || fetch(request))
        );
        return;
    }

    // Default strategy
    event.respondWith(networkFirstWithTimeout(request));
});

// Handle offline/online status
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ONLINE_STATUS') {
        // Broadcast online status to all clients
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'ONLINE_STATUS',
                    online: event.data.online
                });
            });
        });
    }
});

// Periodic cache cleanup
async function cleanupCaches() {
    const cacheNames = await caches.keys();
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        
        for (const request of requests) {
            const response = await cache.match(request);
            
            if (response && isResponseExpired(response, CACHE_DURATION.dynamic)) {
                await cache.delete(request);
            }
        }
    }
}

// Run cache cleanup periodically
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'cache-cleanup') {
        event.waitUntil(cleanupCaches());
    }
});