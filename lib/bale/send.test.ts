import { afterEach, describe, expect, it, vi } from "vitest";
import { latestBaleChatId, parseLatestChatId, sendBaleMessage } from "@/lib/bale/send";

describe("parseLatestChatId", () => {
  it("uses the newest private chat id", () => {
    expect(
      parseLatestChatId([
        { message: { chat: { id: 11 } } },
        { message: { chat: { id: 42 } } },
      ]),
    ).toBe("42");
  });

  it("skips the bot's own id", () => {
    expect(
      parseLatestChatId(
        [{ message: { chat: { id: 42 } } }, { message: { chat: { id: 7 } } }],
        "7",
      ),
    ).toBe("42");
  });
});

describe("sendBaleMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BALE_BOT_TOKEN;
  });

  it("posts the Persian text to tapi.bale.ai", async () => {
    process.env.BALE_BOT_TOKEN = "123:secret";
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendBaleMessage("42", "هشدار رهیار");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tapi.bale.ai/bot123:secret/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "42", text: "هشدار رهیار" }),
      }),
    );
  });

  it("strips the token from a network error", async () => {
    process.env.BALE_BOT_TOKEN = "123:secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("failed https://tapi.bale.ai/bot123:secret/sendMessage");
      }),
    );

    const result = await sendBaleMessage("42", "هشدار");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.description).not.toContain("123:secret");
  });
});

describe("latestBaleChatId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BALE_BOT_TOKEN;
  });

  it("returns no chat when the bot has no messages yet", async () => {
    process.env.BALE_BOT_TOKEN = "123:secret";
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: true, result: [] }) })));
    await expect(latestBaleChatId()).resolves.toEqual({ ok: false, description: "no chat" });
  });
});
