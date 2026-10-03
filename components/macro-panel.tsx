import { SchemaNotice, EmptyState, Panel } from "@/components/chrome";
import type { PresentedMacro } from "@/lib/finance/macro/present";

export function MacroPanel({
  cards,
  empty,
  schemaIssue,
}: {
  cards: PresentedMacro[];
  empty: boolean;
  schemaIssue: boolean | null;
}) {
  if (schemaIssue != null) return <SchemaNotice missing={schemaIssue} />;

  return (
    <Panel title="ماکرو">
      {empty ? (
        <EmptyState>هنوز عددی از FRED ذخیره نشده است. کرون هفتگی این سه شاخص را به‌روز می‌کند.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => {
            const color = card.tone === "up" ? "text-ok" : card.tone === "down" ? "text-danger" : "text-muted-foreground";
            return (
              <li key={card.indicator}>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="numeric mt-1 text-2xl font-semibold">{card.value}</p>
                <p className={`numeric mt-1 text-sm ${color}`}>{card.change}</p>
                <p className="numeric mt-1 text-xs text-muted-foreground">{card.date}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
