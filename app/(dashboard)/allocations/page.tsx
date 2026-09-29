import type { Metadata } from "next";
import { EmptyState, Field, Notice, PageHeader, Panel, SchemaNotice, SubmitButton, errorMessage } from "@/components/chrome";
import { replaceAllocation } from "@/app/(dashboard)/allocations/actions";
import { AllocationsTable, type AllocationTableRow } from "@/components/allocations-table";
import { allocationClasses } from "@/lib/finance/allocation-class";
import { formatNumber, formatTimestamp, toNumber } from "@/lib/finance/format";
import { assetTypeLabels } from "@/lib/finance/labels";
import { readRows } from "@/lib/finance/queries";
import type { Allocation } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "تخصیص" };

export default async function AllocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const rows = await readRows<Allocation>(
    supabase.from("allocations").select("*").order("valid_from", { ascending: false }),
  );

  if (!rows.ok) return <SchemaNotice missing={rows.missingSchema} />;

  const openRows = rows.data.filter((row) => row.valid_to == null);
  const history = rows.data.filter((row) => row.valid_to != null);

  return (
    <div>
      <PageHeader
        title="تخصیص"
        description="بازه برای طبقهٔ تخصیص است، نه نوع ابزار. سکه و صندوق عیار هر دو در طبقهٔ طلا جمع می‌شوند. نسخهٔ قبلی حذف نمی‌شود: با ثبت محدودهٔ جدید، valid_to نسخهٔ باز همان لحظه پر می‌شود. این فرم معامله‌ای انجام نمی‌دهد."
      />
      <Notice message={errorMessage(params.error)} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4">
          <Panel title="نسخهٔ جاری">
            {openRows.length === 0 ? (
              <EmptyState>محدودهٔ بازی تعریف نشده است.</EmptyState>
            ) : (
              <AllocationTable rows={openRows} />
            )}
          </Panel>
          <Panel title="نسخه‌های بسته‌شده">
            {history.length === 0 ? (
              <EmptyState>سابقه‌ای هنوز بسته نشده است.</EmptyState>
            ) : (
              <AllocationTable rows={history} />
            )}
          </Panel>
        </div>
        <Panel title="نسخهٔ جدید">
          <form action={replaceAllocation} className="grid gap-3">
            <Field label="طبقه تخصیص">
              <select name="asset_type" required className="field-input">
                {allocationClasses.map((type) => (
                  <option key={type} value={type}>
                    {assetTypeLabels[type]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="حداقل درصد">
              <input name="min_percent" required inputMode="decimal" dir="ltr" className="field-input text-left" />
            </Field>
            <Field label="حداکثر درصد">
              <input name="max_percent" required inputMode="decimal" dir="ltr" className="field-input text-left" />
            </Field>
            <Field label="نسخهٔ فرمول">
              <input name="formula_version" required defaultValue="v1" maxLength={40} dir="ltr" className="field-input text-left" />
            </Field>
            <SubmitButton>بستن نسخهٔ قبلی و ثبت جدید</SubmitButton>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function AllocationTable({ rows }: { rows: Allocation[] }) {
  const tableRows: AllocationTableRow[] = rows.map((row) => ({
    id: row.id,
    typeLabel: assetTypeLabels[row.asset_type],
    minLabel: formatNumber(toNumber(row.min_percent), 2),
    minValue: toNumber(row.min_percent),
    maxLabel: formatNumber(toNumber(row.max_percent), 2),
    maxValue: toNumber(row.max_percent),
    formula: row.formula_version,
    fromLabel: formatTimestamp(row.valid_from),
    fromValue: row.valid_from,
    toLabel: row.valid_to ? formatTimestamp(row.valid_to) : "باز",
    toValue: row.valid_to,
  }));
  return <AllocationsTable rows={tableRows} />;
}
