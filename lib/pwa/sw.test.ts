import { readFileSync } from "node:fs";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Listener = (event: FakeEvent) => void;

type FakeEvent = {
  waited: Promise<unknown>[];
  waitUntil: (promise: Promise<unknown>) => void;
  response?: Promise<Response>;
  respondWith: (promise: Promise<Response>) => void;
  data?: { json: () => unknown } | null;
  notification?: { close: () => void; data?: { url?: string } };
  request?: { method: string; url: string; mode: string };
};

function loadWorker() {
  const listeners = new Map<string, Listener[]>();
  const notifications: { title: string; options: { body?: string; lang?: string; dir?: string; data?: { url?: string } } }[] = [];
  const opened: string[] = [];
  let claimed = false;
  const location = { origin: "https://rahyar.local", hostname: "rahyar.local" };
  const buckets = new Map<string, Map<string, Response>>();
  let failIcon = false;
  let offline = false;
  let fetches = 0;

  const caches = {
    async open(name: string) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const map = buckets.get(name)!;
      return {
        async add(url: string) {
          const absolute = new URL(url, location.origin);
          const response = await fetch(absolute);
          if (!response.ok) throw new Error(`cache.add ${response.status}`);
          map.set(absolute.pathname, response);
        },
        async match(request: string | { url: string }) {
          const raw = typeof request === "string" ? request : request.url;
          const stored = map.get(new URL(raw, location.origin).pathname);
          return stored ? stored.clone() : undefined;
        },
        async put(request: { url: string }, response: Response) {
          map.set(new URL(request.url, location.origin).pathname, response);
        },
      };
    },
    async keys() {
      return [...buckets.keys()];
    },
    async delete(name: string) {
      return buckets.delete(name);
    },
  };

  async function fetch(input: RequestInfo | URL) {
    fetches += 1;
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const pathname = new URL(href, location.origin).pathname;
    if (offline) throw new Error("offline");
    if (failIcon && pathname === "/icon-512.png") return new Response("no", { status: 500 });
    return new Response(`body:${pathname}`, {
      status: 200,
      headers: { "content-type": pathname.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain" },
    });
  }

  const self = {
    location,
    addEventListener(type: string, fn: Listener) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    registration: {
      showNotification(
        title: string,
        options: { body?: string; lang?: string; dir?: string; data?: { url?: string } },
      ) {
        notifications.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      openWindow(url: string) {
        opened.push(url);
        return Promise.resolve();
      },
      claim() {
        claimed = true;
        return Promise.resolve();
      },
    },
    skipWaiting() {
      return Promise.resolve();
    },
  };

  const context = createContext({ self, caches, fetch, Response, URL, Promise });
  runInContext(readFileSync(path.resolve(process.cwd(), "public/sw.js"), "utf8"), context, { filename: "sw.js" });

  function event(): FakeEvent {
    const waited: Promise<unknown>[] = [];
    const current: FakeEvent = {
      waited,
      waitUntil(promise) {
        waited.push(promise);
      },
      respondWith(promise) {
        current.response = promise;
        waited.push(promise);
      },
    };
    return current;
  }

  async function dispatch(type: string, current: FakeEvent) {
    for (const handler of listeners.get(type) ?? []) handler(current);
    await Promise.all(current.waited);
    return current.response;
  }

  return {
    listeners,
    notifications,
    opened,
    location,
    buckets,
    caches,
    dispatch,
    event,
    claimed: () => claimed,
    setFailIcon(value: boolean) {
      failIcon = value;
    },
    setOffline(value: boolean) {
      offline = value;
    },
    fetchCount: () => fetches,
    resetFetches() {
      fetches = 0;
    },
  };
}

describe("service worker", () => {
  it("caches the shell without dropping push or touching live APIs", async () => {
    const worker = loadWorker();

    expect([...worker.listeners.keys()]).toEqual(["push", "notificationclick", "install", "activate", "fetch"]);

    worker.setFailIcon(true);
    await worker.dispatch("install", worker.event());
    const shell = worker.buckets.get("rahyar-shell-v1");
    expect(shell?.has("/offline.html")).toBe(true);
    expect(shell?.has("/fonts/vazirmatn.woff2")).toBe(true);
    expect(shell?.has("/fonts/inter.woff2")).toBe(true);
    expect(shell?.has("/icon-192.png")).toBe(true);
    expect(shell?.has("/icon-512.png")).toBe(false);

    await worker.caches.open("rahyar-shell-old");
    await worker.dispatch("activate", worker.event());
    expect(await worker.caches.keys()).toEqual(["rahyar-shell-v1"]);
    expect(worker.claimed()).toBe(true);

    const push = worker.event();
    push.data = { json: () => ({ title: "طلا", body: "بالا رفت", url: "/prices" }) };
    await worker.dispatch("push", push);
    expect(worker.notifications.at(-1)).toEqual({
      title: "طلا",
      options: {
        body: "بالا رفت",
        lang: "fa",
        dir: "rtl",
        data: { url: "/prices" },
      },
    });

    const broken = worker.event();
    broken.data = {
      json() {
        throw new Error("not json");
      },
    };
    await worker.dispatch("push", broken);
    expect(worker.notifications.at(-1)?.title).toBe("هشدار رهیار");
    expect(worker.notifications.at(-1)?.options.data).toEqual({ url: "/alerts" });

    const click = worker.event();
    click.notification = { close() {}, data: { url: "/prices" } };
    await worker.dispatch("notificationclick", click);
    expect(worker.opened).toEqual(["/prices"]);

    worker.resetFetches();
    const live = worker.event();
    live.request = { method: "POST", url: "https://rahyar.local/api/chat", mode: "cors" };
    await worker.dispatch("fetch", live);
    const liveGet = worker.event();
    liveGet.request = { method: "GET", url: "https://rahyar.local/api/chat", mode: "cors" };
    await worker.dispatch("fetch", liveGet);
    expect(live.response).toBeUndefined();
    expect(liveGet.response).toBeUndefined();
    expect(worker.fetchCount()).toBe(0);

    worker.setFailIcon(false);
    worker.setOffline(false);
    const online = worker.event();
    online.request = { method: "GET", url: "https://rahyar.local/", mode: "navigate" };
    const onlineResponse = await worker.dispatch("fetch", online);
    expect(await onlineResponse?.text()).toBe("body:/");

    worker.setOffline(true);
    const navigation = worker.event();
    navigation.request = { method: "GET", url: "https://rahyar.local/", mode: "navigate" };
    const offlineResponse = await worker.dispatch("fetch", navigation);
    expect(offlineResponse?.status).toBe(200);
    expect(await offlineResponse?.text()).toBe("body:/offline.html");

    const font = worker.event();
    font.request = { method: "GET", url: "https://rahyar.local/fonts/vazirmatn.woff2", mode: "cors" };
    const fontResponse = await worker.dispatch("fetch", font);
    expect(await fontResponse?.text()).toBe("body:/fonts/vazirmatn.woff2");

    const stylesheet = worker.event();
    stylesheet.request = {
      method: "GET",
      url: "https://rahyar.local/_next/static/css/app.css",
      mode: "cors",
    };
    worker.setOffline(false);
    const cssResponse = await worker.dispatch("fetch", stylesheet);
    expect(await cssResponse?.text()).toBe("body:/_next/static/css/app.css");
    worker.setOffline(true);
    const cssAgain = worker.event();
    cssAgain.request = stylesheet.request;
    const cachedCss = await worker.dispatch("fetch", cssAgain);
    expect(await cachedCss?.text()).toBe("body:/_next/static/css/app.css");

    worker.location.hostname = "localhost";
    worker.location.origin = "http://localhost:3000";
    worker.resetFetches();
    const devAsset = worker.event();
    devAsset.request = { method: "GET", url: "http://localhost:3000/_next/static/chunks/app.js", mode: "cors" };
    await worker.dispatch("fetch", devAsset);
    expect(devAsset.response).toBeUndefined();
    expect(worker.fetchCount()).toBe(0);

    const after = worker.event();
    after.data = null;
    await worker.dispatch("push", after);
    expect(worker.notifications.at(-1)?.title).toBe("هشدار رهیار");
  });
});
