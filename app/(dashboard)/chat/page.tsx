import type { Metadata } from "next";
import { EmptyState, PageHeader, Panel, SchemaNotice } from "@/components/chrome";
import { ChatComposer } from "@/components/chat-composer";
import { formatTimestamp } from "@/lib/finance/format";
import { chatRoleLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import type { ChatLog, Json } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "گفتگو" };

function modelName(context: Json | null): string | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const model = context.model;
  return typeof model === "string" && model ? model : null;
}

export default async function ChatPage() {
  const supabase = await createClient();
  const logs = await readRows<ChatLog>(
    supabase.from("chat_logs").select("*").order("timestamp", { ascending: true }).limit(100),
  );
  const model = process.env.GAPGPT_MODEL?.trim() || "gpt-6-luna";

  return (
    <div>
      <PageHeader
        title="گفتگو"
        description={`پرسش شما با وضعیت فعلی سبد، هشدارهای فعال و آخرین گزارش هفتگی به مدل ${model} فرستاده می‌شود. مدل عدد جدید نمی‌سازد و دادهٔ دیده‌شده کنار هر پاسخ می‌ماند.`}
      />
      {!logs.ok ? (
        <SchemaNotice missing={logs.missingSchema} />
      ) : (
        <div className="grid gap-4">
          <Panel title="سابقه">
            {logs.data.length === 0 ? (
              <EmptyState>هنوز پیامی نیست.</EmptyState>
            ) : (
              <ol className="grid max-h-[32rem] gap-3 overflow-y-auto">
                {logs.data.map((log) => {
                  const modelLabel = modelName(log.context);
                  return (
                    <li key={log.id} className="rounded-xl bg-background px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {chatRoleLabels[log.role]}
                        {modelLabel ? ` · ${modelLabel}` : ""}
                        {" · "}
                        {formatTimestamp(log.timestamp)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{log.message}</p>
                      {log.context ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            داده‌ای که مدل دیده است
                          </summary>
                          <pre className="numeric mt-2 max-h-60 overflow-auto text-left text-xs leading-6" dir="ltr">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
          <Panel title="پیام شما">
            <ChatComposer />
          </Panel>
        </div>
      )}
    </div>
  );
}
