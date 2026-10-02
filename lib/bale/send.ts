const CHAT_ID = /^-?[0-9]{1,20}$/;

export type BaleSendResult = { ok: true } | { ok: false; description: string };

type BaleUpdate = {
  message?: { chat?: { id?: number | string } };
  edited_message?: { chat?: { id?: number | string } };
};

function token(): string | null {
  const value = process.env.BALE_BOT_TOKEN?.trim();
  return value ? value : null;
}

function safeDescription(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : "bale failed";
  return message.split(secret).join("[token]").slice(0, 200);
}

export function isBaleChatId(value: string): boolean {
  return CHAT_ID.test(value);
}

export function parseLatestChatId(updates: unknown, botId?: string | null): string | null {
  if (!Array.isArray(updates)) return null;
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index] as BaleUpdate;
    const id = update.message?.chat?.id ?? update.edited_message?.chat?.id;
    if (id == null) continue;
    const chatId = String(id);
    if (!isBaleChatId(chatId) || (botId != null && chatId === botId)) continue;
    return chatId;
  }
  return null;
}

function userIdFrom(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("id" in result)) return null;
  const id = (result as { id?: number | string }).id;
  if (id == null) return null;
  const value = String(id);
  return isBaleChatId(value) ? value : null;
}

export async function ownBaleId(): Promise<string | null> {
  const me = await baleCall("getMe");
  if (!me.ok) return null;
  return userIdFrom(me.result);
}

async function baleCall(
  method: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; result: unknown } | { ok: false; description: string }> {
  const secret = token();
  if (!secret) return { ok: false, description: "missing token" };

  try {
    const response = await fetch(`https://tapi.bale.ai/bot${secret}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json()) as { ok?: boolean; result?: unknown; description?: string };
    if (payload.ok) return { ok: true, result: payload.result };
    return { ok: false, description: (payload.description ?? "bale rejected the request").slice(0, 200) };
  } catch (error) {
    return { ok: false, description: safeDescription(error, secret) };
  }
}

export async function sendBaleMessage(chatId: string, text: string): Promise<BaleSendResult> {
  if (!isBaleChatId(chatId) || text.length < 1 || text.length > 4096) {
    return { ok: false, description: "invalid bale message" };
  }

  const ownId = await ownBaleId();
  if (ownId && chatId === ownId) return { ok: false, description: "bot id" };

  const result = await baleCall("sendMessage", { chat_id: chatId, text });
  if (result.ok) return { ok: true };
  return { ok: false, description: result.description };
}

export async function latestBaleChatId(): Promise<{ ok: true; chatId: string } | { ok: false; description: string }> {
  const ownId = await ownBaleId();
  const result = await baleCall("getUpdates", { timeout: 0, limit: 100 });
  if (!result.ok) return result;
  const chatId = parseLatestChatId(result.result, ownId);
  if (!chatId) return { ok: false, description: "no chat" };
  return { ok: true, chatId };
}
