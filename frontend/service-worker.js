// Define a cache name for the current version of the cache
// Increment this version number whenever you make changes to your app's core files
// (HTML, CSS, JS, critical images) to force the Service Worker to update.
const CACHE_NAME = 'voice-calculator-v2';

// List all the assets (files) that should be cached for offline use
// Ensure these paths are correct relative to the root of your frontend
const CACHE_URLS = [
    '/', // Root path, typically serves index.html
    '/index.html',
    '/style.css', // Assuming your CSS file is named style.css
    '/script.js', // Assuming your main JS file is named script.js
    '/manifest.json',
    // Paths to your PWA icons (as defined in manifest.json)
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
    // Add any other static assets you want cached (e.g., custom fonts, other images)
    // '/fonts/inter-regular.woff2',
    // '/images/background.jpg'
];

// 1. Install event: Called when the service worker is first installed.
// This is where we open the cache and add all the necessary assets.
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching all app shell content.');
                return cache.addAll(CACHE_URLS);
            })
            .catch((error) => {
                console.error('Service Worker: Failed to cache during install:', error);
                // If caching fails for any critical asset, the service worker will not install.
                // Ensure all URLs in CACHE_URLS are correct and accessible.
            })
    );
});

// 2. Activate event: Called when the service worker takes control of the page.
// This is used to clean up old caches to save space and prevent serving stale content.
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches that do not match the current CACHE_NAME
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        // Ensure the service worker takes control of clients immediately
        .then(() => self.clients.claim())
    );
});

// 3. Fetch event: Intercepts network requests.
// This is the core of offline functionality: try to serve from cache, then fallback to network.
self.addEventListener('fetch', (event) => {
    // Only handle GET requests for navigation and assets
    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // If the request is found in the cache, return the cached response
                    if (response) {
                        console.log('Service Worker: Serving from cache:', event.request.url);
                        return response;
                    }

                    // If not in cache, fetch from the network
                    console.log('Service Worker: Fetching from network:', event.request.url);
                    return fetch(event.request)
                        .then((networkResponse) => {
                            // Check if we received a valid response
                            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                                return networkResponse;
                            }

                            // Clone the response because it's a stream and can only be read once
                            const responseToCache = networkResponse.clone();

                            // Cache the newly fetched response for future offline use
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                    console.log('Service Worker: Cached new resource:', event.request.url);
                                });

                            return networkResponse;
                        })
                        .catch(() => {
                            // This catch block runs if the network request fails (e.g., user is offline)
                            console.warn('Service Worker: Network request failed for:', event.request.url);
                            // If the request is for index.html (or a navigation request), serve the cached index.html
                            if (event.request.mode === 'navigate' || event.request.destination === 'document') {
                                return caches.match('/index.html'); // Fallback to cached index.html
                            }
                            // For other failed requests (e.g., images, fonts), you might return a fallback
                            // e.g., return caches.match('/offline-fallback-image.png');
                            // or just let it fail, which will show a broken image icon.
                        });
                })
        );
    }
});

// Optional: Message event for communicating between page and service worker
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting(); // Force the new service worker to activate immediately
    }
});
