"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LineChart } from "lucide-react";
import { createAsset, deleteAsset, sellHolding, updateAsset } from "@/app/(dashboard)/basket/actions";
import { todayKey } from "@/lib/finance/holding-growth";
import { AssetFields } from "@/components/basket/asset-fields";
import { ShamsiDateField } from "@/components/basket/shamsi-date-field";
import { FundamentalsPanel } from "@/components/basket/fundamentals-panel";
import { HoldingGrowthDialog } from "@/components/holding-growth-dialog";
import { basketColumns, emptyAssetValues, type AssetFormValues } from "@/lib/finance/basket-fields";
import type { PresentedFundamental, PresentedMark, PresentedRow, ValueTone } from "@/lib/finance/basket-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";

function tabClass(selected: boolean) {
  return selected
    ? "inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    : "inline-flex h-11 items-center rounded-lg border border-line bg-card px-4 text-sm outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50";
}

const toneClass: Record<ValueTone, string> = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-foreground",
  empty: "text-muted-foreground",
};

export function BasketBoard({
  marks,
  rows,
  totalValue,
  totalAbsolute,
  totalPercent,
  totalTone,
  fundamentals,
  fundamentalsSchema,
}: {
  marks: PresentedMark[];
  rows: PresentedRow[];
  totalValue: string;
  totalAbsolute: string;
  totalPercent: string;
  totalTone: ValueTone;
  fundamentals: PresentedFundamental[];
  fundamentalsSchema: boolean | null;
}) {
  const [editing, setEditing] = useState<PresentedRow | null>(null);
  const [selling, setSelling] = useState<PresentedRow | null>(null);
  const [removing, setRemoving] = useState<PresentedRow | null>(null);
  const [growth, setGrowth] = useState<PresentedRow | null>(null);
  const [tab, setTab] = useState<"holdings" | "fundamentals">("holdings");

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {marks.map((mark) => (
          <Card key={mark.title} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{mark.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{mark.price}</p>
              <p className={mark.stale ? "text-sm text-warn" : "text-sm text-muted-foreground"}>{mark.updatedLabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="ارزش سبد" value={totalValue} />
        <Summary label="سود/زیان" value={totalAbsolute} tone={totalTone} />
        <Summary label="بازده" value={totalPercent} tone={totalTone} />
      </div>

      <div className="flex gap-2" role="tablist" aria-label="نمای سبد">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "holdings"}
          onClick={() => setTab("holdings")}
          className={tabClass(tab === "holdings")}
        >
          سبد
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "fundamentals"}
          onClick={() => setTab("fundamentals")}
          className={tabClass(tab === "fundamentals")}
        >
          بنیادی سهام
        </button>
      </div>

      <div className={tab === "fundamentals" ? "grid gap-4" : "hidden"}>
        <FundamentalsPanel rows={fundamentals} schemaIssue={fundamentalsSchema} />
      </div>

      {tab === "holdings" ? (
        <>
      <div className="flex justify-start">
        <Dialog>
          <DialogTrigger render={<Button type="button" className="h-11 px-4" />}>افزودن دارایی</DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>دارایی جدید</DialogTitle>
              <DialogDescription>
                برای سهم و صندوق این فرم یک خرید است: اگر همان نماد را داشته باشید، تعداد به همان ردیف اضافه می‌شود و میانگین از دفتر معاملات حساب می‌شود. طلا، دلار و بقیه هنوز ردیف جدا می‌سازند.
              </DialogDescription>
            </DialogHeader>
            <AssetEditor action={createAsset} values={emptyAssetValues()} submitLabel="افزودن به سبد" includeDate defaultDate={todayKey()} />
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">هنوز دارایی‌ای در سبد نیست.</CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <SortableTable
              rows={rows}
              rowKey={(row) => row.id}
              minWidth="72rem"
              columns={basketColumns.map((column): SortableColumn<PresentedRow> => ({
                key: column.key,
                label: column.label,
                numeric: column.numeric,
                sortValue: (row) => row.sort[column.key],
                render: (row) => (
                  <div>
                    {column.key === "name" ? (
                      <HoldingName row={row} onOpen={setGrowth} />
                    ) : (
                      <span
                        className={`${column.numeric ? "numeric" : ""} ${
                          column.key === "absolute" || column.key === "percent" ? toneClass[row.tone] : ""
                        }`}
                      >
                        {row.cells[column.key]}
                      </span>
                    )}
                    {column.key === "currentPrice" && row.updatedLabel ? (
                      <p className={row.stale ? "mt-1 text-xs text-warn" : "mt-1 text-xs text-muted-foreground"}>
                        {row.updatedLabel}
                      </p>
                    ) : null}
                  </div>
                ),
              }))}
              trailing={{
                label: "عملیات",
                render: (row) => (
                  <RowActions row={row} onEdit={setEditing} onSell={setSelling} onRemove={setRemoving} />
                ),
              }}
            />
          </div>

          <ul className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <HoldingName row={row} onOpen={setGrowth} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {basketColumns.slice(1).map((column) => (
                      <div key={column.key} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{column.label}</span>
                        <span className="text-end">
                          <span className={`${column.numeric ? "numeric" : ""} ${column.key === "absolute" || column.key === "percent" ? toneClass[row.tone] : ""}`}>
                            {row.cells[column.key]}
                          </span>
                          {column.key === "currentPrice" && row.updatedLabel ? (
                            <span className={row.stale ? "mt-1 block text-xs text-warn" : "mt-1 block text-xs text-muted-foreground"}>
                              {row.updatedLabel}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                    <RowActions row={row} onEdit={setEditing} onSell={setSelling} onRemove={setRemoving} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
        </>
      ) : null}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش دارایی</DialogTitle>
            <DialogDescription>
              {editing && listedRow(editing)
                ? "تعداد و میانگین سهم و صندوق فقط با خرید و فروش عوض می‌شود."
                : "قیمت‌ها با همان مبنای ذخیره‌شده، ریال یا دلار، ویرایش می‌شوند."}
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <AssetEditor
              key={editing.id}
              action={updateAsset}
              values={editing.values}
              id={editing.id}
              submitLabel="ذخیره"
              lockPosition={listedRow(editing)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <HoldingGrowthDialog row={growth} onClose={() => setGrowth(null)} />

      <Dialog open={selling != null} onOpenChange={(open) => !open && setSelling(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>فروش {selling?.cells.name}</DialogTitle>
            <DialogDescription>
              این فروش از مانده کم می‌شود. میانگین خرید سهم‌های باقی‌مانده همان می‌ماند و کارمزد فقط از پول دریافتی کم می‌شود.
            </DialogDescription>
          </DialogHeader>
          {selling ? (
            <form action={sellHolding} className="grid gap-4">
              <input type="hidden" name="id" value={selling.id} />
              <div className="grid gap-1.5">
                <label htmlFor="sell-quantity" className="text-sm font-medium">تعداد</label>
                <input id="sell-quantity" name="quantity" required inputMode="decimal" dir="ltr" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="sell-price" className="text-sm font-medium">قیمت فروش</label>
                <input id="sell-price" name="price" required inputMode="decimal" dir="ltr" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="sell-fee" className="text-sm font-medium">کارمزد</label>
                <input id="sell-fee" name="fee" inputMode="decimal" dir="ltr" placeholder="۰" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm" />
              </div>
              <ShamsiDateField name="traded_on" defaultValue={todayKey()} label="تاریخ فروش" />
              <DialogFooter>
                <SaveButton>ثبت فروش</SaveButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف دارایی</DialogTitle>
            <DialogDescription>
              {removing ? `«${removing.cells.name}» از سبد حذف می‌شود.` : ""}
            </DialogDescription>
          </DialogHeader>
          {removing ? (
            <form action={deleteAsset}>
              <input type="hidden" name="id" value={removing.id} />
              <DialogFooter>
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setRemoving(null)}>
                  انصراف
                </Button>
                <Button type="submit" variant="destructive" className="h-11 px-4">
                  حذف
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HoldingName({ row, onOpen }: { row: PresentedRow; onOpen: (row: PresentedRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="inline-flex min-h-11 items-center gap-1 text-start font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span>{row.cells.name}</span>
      <LineChart className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">نمودار رشد</span>
    </button>
  );
}

function Summary({ label, value, tone = "flat" }: { label: string; value: string; tone?: ValueTone }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`numeric text-2xl font-semibold ${toneClass[tone]}`}>{value}</CardContent>
    </Card>
  );
}

function listedRow(row: PresentedRow): boolean {
  return row.values.type === "stock" || row.values.type === "fund";
}

function RowActions({
  row,
  onEdit,
  onSell,
  onRemove,
}: {
  row: PresentedRow;
  onEdit: (row: PresentedRow) => void;
  onSell: (row: PresentedRow) => void;
  onRemove: (row: PresentedRow) => void;
}) {
  const openListed = listedRow(row) && Number(row.values.quantity) > 0;
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onEdit(row)}>
        ویرایش
      </Button>
      {openListed ? (
        <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onSell(row)}>
          فروش
        </Button>
      ) : (
        <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => onRemove(row)}>
          حذف
        </Button>
      )}
    </div>
  );
}

function AssetEditor({
  action,
  values,
  submitLabel,
  id,
  includeDate = false,
  defaultDate = "",
  lockPosition = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values: AssetFormValues;
  submitLabel: string;
  id?: string;
  includeDate?: boolean;
  defaultDate?: string;
  lockPosition?: boolean;
}) {
  return (
    <form action={action} className="grid gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <AssetFields values={values} includeDate={includeDate} defaultDate={defaultDate} lockPosition={lockPosition} />
      <DialogFooter>
        <SaveButton>{submitLabel}</SaveButton>
      </DialogFooter>
    </form>
  );
}

function SaveButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11 px-4">
      {pending ? "در حال ذخیره..." : children}
    </Button>
  );
}
