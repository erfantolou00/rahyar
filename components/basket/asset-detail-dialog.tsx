"use client";

import { HoldingMove } from "@/components/basket/holding-move";
import { ChartContainer, InteractiveLineChart } from "@/components/dashboard/chart-container";
import { basketColumns } from "@/lib/finance/basket-fields";
import { isLedgerAsset } from "@/lib/finance/holding-move";
import type { PresentedRow } from "@/lib/finance/basket-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type HoldingChart = {
  basis: "price" | "value";
  points: { label: string; value: number }[];
  note?: string;
};

export function AssetDetailDialog({
  row,
  chart,
  onClose,
  onEdit,
  onRemove,
  onGrowth,
}: {
  row: PresentedRow | null;
  chart: HoldingChart | null;
  onClose: () => void;
  onEdit: (row: PresentedRow) => void;
  onRemove: (row: PresentedRow) => void;
  onGrowth: (row: PresentedRow) => void;
}) {
  const basis = chart?.basis === "price" ? "قیمت" : "ارزش";
  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        {row ? (
          <>
            <DialogHeader>
              <DialogTitle>{row.cells.name}</DialogTitle>
              <DialogDescription>
                {row.cells.type}
                {row.updatedLabel ? ` · ${row.updatedLabel}` : ""}
              </DialogDescription>
            </DialogHeader>
            <ChartContainer
              title={`روند ${basis} شبانه`}
              description={
                chart?.note ??
                (chart?.basis === "price"
                  ? "قیمت پایانی هر شب، با همان مبنای کارت دارایی."
                  : "وقتی قیمت واحد ثبت نشده باشد، ارزش ریالی شبانه رسم می‌شود.")
              }
              density="compact"
            >
              <InteractiveLineChart points={chart?.points ?? []} unit={chart?.basis === "value" ? "ریال" : undefined} />
            </ChartContainer>
            <dl className="grid gap-2">
              {basketColumns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{column.label}</dt>
                  <dd className={column.numeric ? "numeric text-end" : "text-end"}>{row.cells[column.key]}</dd>
                </div>
              ))}
            </dl>
            {isLedgerAsset(row.values.type) ? <HoldingMove row={row} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row)}>
                ویرایش
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onGrowth(row)}>
                رشد از معاملات
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => onRemove(row)}>
                حذف
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
