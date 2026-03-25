const CACHE_NAME = 'warden-assets-v2';
const IMAGE_CACHE_NAME = 'warden-images-v2';

const CRITICAL_IMAGES = [
  '/images/backpack.png',
  '/images/Shop.png',
  '/images/Market.png',
  '/images/Storage.png',
  '/images/house.png',
  '/images/mini-house.png',
  '/images/garden-wheat.png',
  '/images/garden-tomato.png',
  '/images/garden-pumpkin.png',
  '/images/garden-apple.png',
  '/images/garden-peach.png',
  '/images/garden-cherry.png',
  '/images/garden-watering-can.png',
  '/images/garden-pick.png',
  '/images/garden-bin.png',
  '/images/sleep.png',
  '/images/tools-wood.png',
  '/images/tools-iron.png',
  '/images/tools-coins.png',
  '/images/tools-village.png',
  '/images/tools-map.png',
  '/images/settings.png'
];

// Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(IMAGE_CACHE_NAME).then((cache) => {
      console.log('Pre-caching critical images');
      return cache.addAll(CRITICAL_IMAGES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept same-origin GET requests
  if (url.origin === self.location.origin && event.request.method === 'GET') {
    // Skip Vite/HMR internal requests
    if (url.pathname.includes('/@vite/') || url.pathname.includes('/node_modules/') || url.pathname.includes('chrome-extension://')) {
      return;
    }

    // Strategy for images: Cache First
    if (url.pathname.startsWith('/images/')) {
      event.respondWith(
        caches.open(IMAGE_CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((response) => {
            if (response) return response;
            
            return fetch(event.request).then((networkResponse) => {
              // Only cache successful responses
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            });
          });
        })
      );
    } else {
      // Strategy for other assets: Stale While Revalidate
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            });

            if (cachedResponse) {
              // Revalidate in background, but catch errors to avoid unhandled rejections
              fetchPromise.catch(err => {
                // Background fetch failed, but we already served cached version
              });
              return cachedResponse;
            }

            // No cache, must wait for network
            return fetchPromise;
          });
        })
      );
    }
  }
});
