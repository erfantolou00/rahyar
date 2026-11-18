"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Info } from "lucide-react";
import { createAsset, deleteAsset, updateAsset } from "@/app/(dashboard)/basket/actions";
import { AssetDetailDialog, type HoldingChart } from "@/components/basket/asset-detail-dialog";
import { AssetFields } from "@/components/basket/asset-fields";
import { FundamentalsLoader } from "@/components/basket/fundamentals-loader";
import { AssetChart } from "@/components/dashboard/asset-chart";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { HoldingGrowthDialog } from "@/components/holding-growth-dialog";
import { emptyAssetValues, type AssetFormValues } from "@/lib/finance/basket-fields";
import type { PresentedMark, PresentedRow, ValueTone } from "@/lib/finance/basket-view";
import type { Tone } from "@/lib/overview/tone";
import type { OverviewSliceView } from "@/lib/overview/view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const toneClass: Record<ValueTone, string> = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-foreground",
  empty: "text-muted-foreground",
};

function tileTone(tone: ValueTone): Tone {
  if (tone === "up") return "profit";
  if (tone === "down") return "loss";
  return "neutral";
}

export function BasketBoard({
  marks,
  rows,
  charts,
  slices,
  totalValue,
  totalAbsolute,
  totalPercent,
  totalTone,
}: {
  marks: PresentedMark[];
  rows: PresentedRow[];
  charts: Record<string, HoldingChart>;
  slices: OverviewSliceView[];
  totalValue: string;
  totalAbsolute: string;
  totalPercent: string;
  totalTone: ValueTone;
}) {
  const [editing, setEditing] = useState<PresentedRow | null>(null);
  const [removing, setRemoving] = useState<PresentedRow | null>(null);
  const [growth, setGrowth] = useState<PresentedRow | null>(null);
  const [detail, setDetail] = useState<PresentedRow | null>(null);
  const [tab, setTab] = useState<"holdings" | "fundamentals">("holdings");

  return (
    <div className="grid gap-4">
      <div className="grid lg:grid-cols-3 grid-cols-2 gap-2">
        {marks.map((mark) => (
          <article key={mark.title} className="surface-card surface-card-compact min-w-0">
            <p className="text-xs text-muted-foreground">{mark.title}</p>
            <p className="numeric mt-1 truncate text-2xl font-semibold">{mark.price}</p>
            <p className={mark.stale ? "mt-1 truncate text-[11px] text-warn" : "mt-1 truncate text-[11px] text-muted-foreground"}>
              {mark.updatedLabel}
            </p>
          </article>
        ))}
        <KpiTile density="compact" label="ارزش سبد" value={totalValue} />
        <KpiTile density="compact" label="سود و زیان" value={totalAbsolute} valueTone={tileTone(totalTone)} />
        <KpiTile density="compact" label="بازده" value={totalPercent} valueTone={tileTone(totalTone)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2" role="tablist" aria-label="نمای سبد">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "holdings"}
            onClick={() => setTab("holdings")}
            className={tab === "holdings" ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground" : "rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-muted"}
          >
            سبد
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fundamentals"}
            onClick={() => setTab("fundamentals")}
            className={tab === "fundamentals" ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground" : "rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-muted"}
          >
            بنیادی
          </button>
        </div>
        <Dialog>
          <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>افزودن</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>دارایی جدید</DialogTitle>
              <DialogDescription>
                مبنای قیمت را ریال یا دلار انتخاب کنید. موجودی را بعد از ساخت، از خود کارت کم و زیاد کنید.
              </DialogDescription>
            </DialogHeader>
            <AssetEditor action={createAsset} values={emptyAssetValues()} submitLabel="افزودن به سبد" />
          </DialogContent>
        </Dialog>
      </div>

      <div className={tab === "fundamentals" ? "grid gap-4" : "hidden"}>
        <FundamentalsLoader enabled={tab === "fundamentals"} />
      </div>

      {tab === "holdings" ? (
        <>
          {rows.length === 0 ? (
            <p className="text-sm leading-7 text-muted-foreground">هنوز دارایی‌ای در سبد نیست.</p>
          ) : (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {rows.map((row) => (
                <li key={row.id} className="surface-card surface-card-compact flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.cells.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.cells.type}</p>
                    {row.stale && row.updatedLabel ? <p className="mt-0.5 text-[11px] text-warn">{row.updatedLabel}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-end">
                      <p className="numeric text-sm">{row.cells.currentValue}</p>
                      <p className={`numeric text-xs ${toneClass[row.tone]}`}>{row.cells.percent}</p>
                    </div>
                    <button
                      type="button"
                      aria-label={`اطلاعات ${row.cells.name}`}
                      onClick={() => setDetail(row)}
                      className="grid size-8 place-items-center rounded-full border border-line text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Info className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
         
        </>
      ) : null}

      <AssetDetailDialog
        row={detail}
        chart={detail ? charts[detail.id] ?? null : null}
        onClose={() => setDetail(null)}
        onEdit={(row) => {
          setDetail(null);
          setEditing(row);
        }}
        onRemove={(row) => {
          setDetail(null);
          setRemoving(row);
        }}
        onGrowth={(row) => {
          setDetail(null);
          setGrowth(row);
        }}
      />

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش دارایی</DialogTitle>
            <DialogDescription>نام، قیمت دستی و طبقهٔ تخصیص از اینجا عوض می‌شود.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <AssetEditor
              key={editing.id}
              action={updateAsset}
              values={editing.values}
              id={editing.id}
              submitLabel="ذخیره"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <HoldingGrowthDialog row={growth} onClose={() => setGrowth(null)} />

      <Dialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف دارایی</DialogTitle>
            <DialogDescription>
              {removing ? `«${removing.cells.name}» و تراکنش‌های وابستهٔ آن حذف می‌شوند.` : ""}
            </DialogDescription>
          </DialogHeader>
          {removing ? (
            <form action={deleteAsset}>
              <input type="hidden" name="id" value={removing.id} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                  انصراف
                </Button>
                <Button type="submit" variant="destructive">
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

function AssetEditor({
  action,
  values,
  submitLabel,
  id,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values: AssetFormValues;
  submitLabel: string;
  id?: string;
}) {
  return (
    <form action={action} className="grid gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <AssetFields values={values} mode={id ? "edit" : "create"} />
      <DialogFooter>
        <SaveButton>{submitLabel}</SaveButton>
      </DialogFooter>
    </form>
  );
}

function SaveButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "در حال ذخیره..." : children}
    </Button>
  );
}
