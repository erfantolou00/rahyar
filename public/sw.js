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
