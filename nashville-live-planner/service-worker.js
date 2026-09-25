const CACHE_NAME = "nashville-planner-shell-v3";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./jobs.html",
  "./privacy.html",
  "./terms.html",
  "./planner-data.js?v=20260924-eight-jobs",
  "./route-planner-core.js?v=20260925-furthest-first",
  "./transit-picker.js",
  "./work-app-backbone.js?v=20260924-eight-jobs",
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request,{ignoreSearch:true});
    if (cached) return cached;
    if (request.mode==='navigate') return caches.match("./index.html");
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
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
  if (isLiveApi) return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_CROSS_ORIGIN_ASSETS.some((asset) => asset === request.url)) {
    event.respondWith(cacheFirst(request));
  }
});
