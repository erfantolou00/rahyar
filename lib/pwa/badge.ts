export type AppBadgeNavigator = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function syncAppBadge(count: number, nav?: AppBadgeNavigator): Promise<void> {
  const target = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (!target || typeof target.setAppBadge !== "function" || typeof target.clearAppBadge !== "function") return;

  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    if (safe > 0) await target.setAppBadge(safe);
    else await target.clearAppBadge();
  } catch {
    // The Badging API rejects when the browser has no installed app or no permission.
  }
}
