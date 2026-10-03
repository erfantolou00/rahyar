import type { Metadata } from "next";
import { SchemaNotice } from "@/components/chrome";
import { ChatThread, type ChatTurn } from "@/components/chat-thread";
import { readRows } from "@/lib/finance/queries";
import { ensureMarketReports } from "@/lib/finance/prices/market-report";
import type { ChatLog, Json } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "گفتگو" };
export const maxDuration = 60;

function modelName(context: Json | null): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const model = context.model;
  return typeof model === "string" && model ? model : null;
}

export default async function ChatPage() {
  const supabase = await createClient();
  await ensureMarketReports(supabase);
  const logs = await readRows<ChatLog>(
    supabase.from("chat_logs").select("*").order("timestamp", { ascending: true }).limit(100),
  );

  const turns: ChatTurn[] = logs.ok
    ? logs.data
        .filter((log) => log.role === "user" || log.role === "assistant")
        .map((log) => ({
          id: log.id,
          role: log.role,
          message: log.message,
          timestamp: log.timestamp,
          model: modelName(log.context),
          context: log.role === "assistant" ? log.context : null,
        }))
    : [];

  return (
    <div className="-mx-4 -my-8 flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col">
      {!logs.ok ? (
        <div className="p-4">
          <SchemaNotice missing={logs.missingSchema} />
        </div>
      ) : (
        <ChatThread initial={turns} />
      )}
    </div>
  );
}
