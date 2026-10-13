"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const DISMISS_KEY = "rahyar-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

function isStandalone() {
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function iosInstallGuide(): boolean {
  if (typeof window === "undefined") return false;
  if (isStandalone() || sessionStorage.getItem(DISMISS_KEY) === "1") return false;
  return isIos();
}

function subscribeToNothing() {
  return () => {};
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const iosGuide = useSyncExternalStore(subscribeToNothing, iosInstallGuide, () => false);

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem(DISMISS_KEY) === "1") return;

    function onPrompt(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    const event = deferred;
    setDeferred(null);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // The browser already showed its own dialog, or the prompt was consumed.
    }
  }

  const showIos = iosGuide && !dismissed && deferred == null;
  if (!deferred && !showIos) return null;

  return (
    <div className="fixed bottom-4 start-4 z-40 max-w-sm" role="region" aria-label="نصب رهیار">
      {deferred ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={install}
            className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            نصب رهیار
          </button>
          <button type="button" onClick={dismiss} className="inline-flex h-11 items-center rounded-full px-4 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            بستن
          </button>
        </div>
      ) : (
        <div className="surface p-4 text-sm leading-6">
          <p>روی آیفون ابتدا رهیار را به صفحهٔ اصلی اضافه کنید.</p>
          <p className="mt-1 font-medium">افزودن به صفحه‌ی اصلی از Safari</p>
          <button type="button" onClick={dismiss} className="mt-2 inline-flex h-11 items-center text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            بستن
          </button>
        </div>
      )}
    </div>
  );
}
