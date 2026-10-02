import webpush from "web-push";

export type PushTarget = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendResult = { ok: true } | { ok: false; description: string; gone: boolean };

export type PushNotice = {
  title?: string;
  url?: string;
};

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "push failed";
  return message.slice(0, 200);
}

export async function sendBrowserNotification(
  target: PushTarget,
  text: string,
  notice?: PushNotice,
): Promise<PushSendResult> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:rahyar@localhost";
  if (!publicKey || !privateKey) {
    return { ok: false, description: "missing vapid", gone: false };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify({
        title: notice?.title || "هشدار رهیار",
        body: text,
        url: notice?.url?.startsWith("/") ? notice.url : "/alerts",
      }),
    );
    return { ok: true };
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
    return {
      ok: false,
      description: safeError(error),
      gone: statusCode === 404 || statusCode === 410,
    };
  }
}
