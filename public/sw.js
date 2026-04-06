/// <reference lib="webworker" />

const CACHE_VERSION = "prdcr-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/dashboard",
  "/icon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
];

// API routes worth caching for offline (stale-while-revalidate)
const CACHEABLE_API_PATTERNS = [
  /\/api\/calendar\/events/,
];

// Pages that should work offline (network-first, fallback to cache)
const APP_SHELL_PATTERNS = [
  /\/dashboard/,
  /\/dashboard\/projects/,
  /\/dashboard\/tasks/,
  /\/dashboard\/calendar/,
  /\/dashboard\/email/,
  /\/dashboard\/notes/,
  /\/dashboard\/clients/,
  /\/dashboard\/settings/,
];

// ─── INSTALL ────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE — clean old caches ────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH STRATEGIES ───────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip chrome-extension, etc.
  if (!url.protocol.startsWith("http")) return;

  // Strategy 1: API routes — stale-while-revalidate
  if (CACHEABLE_API_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Strategy 2: App shell pages — network-first, cache fallback
  if (APP_SHELL_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Strategy 3: Static assets (_next/static) — cache-first
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Strategy 4: Everything else — network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ─── Cache-first (for immutable static assets) ──────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

// ─── Network-first (for pages — always try fresh) ───────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Offline fallback for navigation requests
    if (request.mode === "navigate") {
      const fallback = await caches.match("/dashboard");
      if (fallback) return fallback;
    }

    return new Response("Offline — please reconnect.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// ─── Stale-while-revalidate (for API data) ──────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ─── PUSH NOTIFICATIONS (stub) ──────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "PRDCR", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: data.tag || "prdcr-notification",
    data: {
      url: data.url || "/dashboard",
    },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title || "PRDCR", options));
});

// ─── Notification click — open the app ──────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});
