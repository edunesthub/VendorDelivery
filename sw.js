const CACHE_NAME = "vendor-portal-cache-v23";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  // 🔥 Removed cdn.tailwindcss.com to fix CORS error
  "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js",
  "https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;500;700&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "/img/icon-192x192.png"
];

// ✅ OneSignal service worker for push support
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// Install: Cache essential files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("✅ Caching assets...");
      return cache.addAll(urlsToCache);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("🗑️ Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Serve from cache or fallback to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        return caches.match("/index.html");
      });
    })
  );
});
