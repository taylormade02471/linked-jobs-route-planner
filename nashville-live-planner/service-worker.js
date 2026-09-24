const CACHE_NAME = "nashville-planner-shell-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./jobs.html",
  "./privacy.html",
  "./terms.html",
  "./planner-data.js",
  "./route-planner-core.js",
  "./transit-picker.js",
  "./work-app-backbone.js",
  "./provider-connectors.js",
  "./android-app-backbone.js",
  "./offline-cache.js",
];
const STATIC_CROSS_ORIGIN_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

async function cacheBestEffort(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  } catch {
    // The planner can still install offline with the same-origin shell.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(SHELL_ASSETS);
      await Promise.all(STATIC_CROSS_ORIGIN_ASSETS.map((url) => cacheBestEffort(cache, url)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isLiveApi = url.origin === self.location.origin && url.pathname.startsWith("/api/");
  const isShellAsset = url.origin === self.location.origin || STATIC_CROSS_ORIGIN_ASSETS.some((asset) => asset === request.url);
  if (isLiveApi || !isShellAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok || response.type === "opaque") {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
    })
  );
});
