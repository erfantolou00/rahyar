export type TelegramSendResult = { ok: true } | { ok: false; description: string };

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "network";
  return message.replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, "bot<redacted>").slice(0, 200);
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    return { ok: false, description: safeError(error) };
  }

  let payload: { ok?: boolean; description?: string } = {};
  try {
    payload = (await response.json()) as { ok?: boolean; description?: string };
  } catch {
    return { ok: false, description: `HTTP ${response.status}` };
  }

  if (!response.ok || payload.ok !== true) {
    return { ok: false, description: payload.description || `HTTP ${response.status}` };
  }

  return { ok: true };
}
