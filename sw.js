self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function notificationOptionsFromPayload(payload){
  const title = payload?.title || "Pilingo";
  return {
    body: payload?.body || "Your next lesson is waiting.",
    icon: payload?.icon || "pilingo-icon-192.png",
    badge: payload?.badge || "pilingo-icon-192.png",
    image: payload?.image || undefined,
    tag: payload?.tag || "pilingo-reminder",
    renotify: payload?.renotify !== false,
    requireInteraction: !!payload?.requireInteraction,
    vibrate: Array.isArray(payload?.vibrate) ? payload.vibrate : undefined,
    silent: payload?.silent === true,
    timestamp: Number(payload?.timestamp || Date.now()),
    data: {
      url: payload?.url || "/index.html",
      ...(payload?.data || {})
    }
  };
}

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload?.title || "Pilingo";
  const options = notificationOptionsFromPayload(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification?.data?.url || "/index.html";

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for(const client of clients){
      if("focus" in client){
        if("navigate" in client){
          await client.navigate(destination).catch(() => {});
        }
        return client.focus();
      }
    }

    if(self.clients.openWindow){
      return self.clients.openWindow(destination);
    }
    return undefined;
  })());
});
