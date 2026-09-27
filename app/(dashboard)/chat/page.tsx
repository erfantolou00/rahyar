import type { Metadata } from "next";
import { EmptyState, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { saveChatMessage } from "@/app/(dashboard)/chat/actions";
import { formatTimestamp } from "@/lib/finance/format";
import { chatRoleLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import type { ChatLog } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "گفتگو" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const logs = await readRows<ChatLog>(
    supabase.from("chat_logs").select("*").order("timestamp", { ascending: true }).limit(100),
  );

  return (
    <div>
      <PageHeader
        title="گفتگو"
        description="پیام‌ها در chat_logs می‌مانند. پاسخ مدل در این نسخه وصل نشده و چیزی به‌جای دستیار ساخته نمی‌شود."
      />
      <Notice message={errorMessage(params.error)} />
      {!logs.ok ? (
        <SchemaNotice missing={logs.missingSchema} />
      ) : (
        <div className="grid gap-4">
          <Panel title="سابقه">
            {logs.data.length === 0 ? (
              <EmptyState>هنوز پیامی نیست.</EmptyState>
            ) : (
              <ol className="grid gap-3">
                {logs.data.map((log) => (
                  <li key={log.id} className="rounded-xl bg-background px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {chatRoleLabels[log.role]} · {formatTimestamp(log.timestamp)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-7">{log.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="پیام شما">
            <form action={saveChatMessage} className="grid gap-3">
              <textarea name="message" required maxLength={4000} rows={4} className="field-input" />
              <SubmitButton>ذخیره در سابقه</SubmitButton>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
