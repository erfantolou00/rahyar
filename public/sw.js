self.addEventListener("push", (event) => {
  const fallback = { title: "هشدار رهیار", body: "", url: "/alerts" };
  let payload = fallback;
  try {
    const data = event.data ? event.data.json() : {};
    payload = {
      title: typeof data.title === "string" && data.title ? data.title : fallback.title,
      body: typeof data.body === "string" ? data.body : "",
      url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : fallback.url,
    };
  } catch {
    payload = fallback;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      lang: "fa",
      dir: "rtl",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/alerts";
  event.waitUntil(self.clients.openWindow(url));
});

const CACHE = "rahyar-shell-v1";
const SHELL = [
  "/offline.html",
  "/fonts/vazirmatn.woff2",
  "/fonts/inter.woff2",
  "/icon-192.png",
  "/icon-512.png",
];

function isLocalDev() {
  return self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
}

function isHashedAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

function isShellAsset(pathname) {
  return SHELL.includes(pathname) || pathname.startsWith("/fonts/") || isHashedAsset(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  try {
    const request = event.request;
    if (!request || request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    // Chat and live price updates stay on the network so a failure stays a failure.
    if (url.pathname.startsWith("/api/")) return;
    if (request.mode === "navigate") {
      event.respondWith(offlineNavigation(request));
      return;
    }
    if (!isShellAsset(url.pathname) || (isHashedAsset(url.pathname) && isLocalDev())) return;
    event.respondWith(shellAsset(request, url.pathname));
  } catch {
    // A malformed request must not take down push delivery.
  }
});

async function offlineNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    return new Response("آفلاین", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

async function shellAsset(request, pathname) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (isHashedAsset(pathname) && cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Quota or an unsupported response. The network body is still returned.
      }
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}
