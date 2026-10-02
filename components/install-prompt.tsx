"use client";

import { useEffect, useState } from "react";

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

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosGuide, setIosGuide] = useState(false);

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem(DISMISS_KEY) === "1") return;

    function onPrompt(event: Event) {
      event.preventDefault();
      setIosGuide(false);
      setDeferred(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIos()) setIosGuide(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
    setIosGuide(false);
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

  if (!deferred && !iosGuide) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-sm" role="region" aria-label="نصب رهیار">
      {deferred ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={install}
            className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition hover:opacity-90"
          >
            نصب رهیار
          </button>
          <button type="button" onClick={dismiss} className="rounded-full px-2 py-2 text-xs text-muted-foreground">
            بستن
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-card p-4 text-sm leading-7 shadow-lg">
          <p>روی آیفون ابتدا رهیار را به صفحهٔ اصلی اضافه کنید.</p>
          <p className="mt-1 font-medium">افزودن به صفحه‌ی اصلی از Safari</p>
          <button type="button" onClick={dismiss} className="mt-2 text-xs text-muted-foreground">
            بستن
          </button>
        </div>
      )}
    </div>
  );
}
