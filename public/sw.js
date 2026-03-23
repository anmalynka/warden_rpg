// Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept same-origin requests to avoid CORS issues with external assets (like MapLibre fonts)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Optional: Fallback for failed internal requests
        return new Response("Offline or error");
      })
    );
  } else {
    // Let external requests (CORS-sensitive) pass through normally
    return;
  }
});
