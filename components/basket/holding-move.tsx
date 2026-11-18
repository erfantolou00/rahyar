"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { moveHolding } from "@/app/(dashboard)/basket/actions";
import { ShamsiDateField } from "@/components/basket/shamsi-date-field";
import { formatDollar, formatMoney, formatQuantity } from "@/lib/finance/format";
import { normalizeNumericInput } from "@/lib/finance/parse";
import {
  isCashAsset,
  projectHoldingMove,
  type HoldingMove,
} from "@/lib/finance/holding-move";
import type { PresentedRow } from "@/lib/finance/basket-view";
import { Button } from "@/components/ui/button";

const choices: { id: HoldingMove; label: string; cashLabel: string }[] = [
  { id: "add", label: "افزودن", cashLabel: "واریز" },
  { id: "remove", label: "کم کردن", cashLabel: "برداشت" },
  { id: "average", label: "اصلاح میانگین", cashLabel: "اصلاح میانگین" },
];

export function HoldingMove({ row }: { row: PresentedRow }) {
  const cash = isCashAsset(row.values.type);
  const [move, setMove] = useState<HoldingMove>("add");
  const quantity = numberOrZero(row.values.quantity);
  const average = row.values.avg_buy_price === "" ? null : numberOrZero(row.values.avg_buy_price);
  const unit = row.values.price_unit === "usd" ? "usd" : "rial";
  const suggested = typeof row.sort.currentPrice === "number" && row.sort.currentPrice > 0
    ? row.sort.currentPrice
    : average;
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState(suggested != null && suggested > 0 ? String(suggested) : "");
  const shown = choices.filter((choice) => (cash ? choice.id !== "average" : true));
  const active = cash && move === "average" ? "add" : move;
  const preview = projectHoldingMove({
    move: active,
    quantity,
    average,
    amount: active === "average" ? null : numberOrNull(amount),
    price: cash && active !== "average" ? 0 : numberOrNull(price),
  });

  return (
    <form action={moveHolding} className="grid gap-3 rounded-xl border border-line p-3">
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="move" value={active} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="تغییر موجودی">
        {shown.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="tab"
            aria-selected={active === choice.id}
            onClick={() => setMove(choice.id)}
            className={
              active === choice.id
                ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground"
                : "rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {cash ? choice.cashLabel : choice.label}
          </button>
        ))}
      </div>
      {active !== "average" ? (
        <label className="grid gap-1.5 text-sm">
          {cash ? "مبلغ" : "مقدار"}
          <input
            name="amount"
            required
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="field-input text-left"
          />
        </label>
      ) : null}
      {cash && active !== "average" ? null : (
        <label className="grid gap-1.5 text-sm">
          {active === "average" ? "میانگین جدید" : active === "remove" ? "قیمت فروش" : "قیمت هر واحد"}
          <input
            name="price"
            required
            inputMode="decimal"
            dir="ltr"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="field-input text-left"
          />
        </label>
      )}
      <ShamsiDateField name="date" defaultValue={todayInput()} label="تاریخ" />
      {!cash && active !== "average" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="settle_cash" value="1" />
          با حساب نقدی تسویه شود
        </label>
      ) : null}
      <p className="text-xs leading-6 text-muted-foreground">{sentence(preview, cash, active, unit)}</p>
      <SaveButton disabled={!preview.ok} />
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "در حال ثبت..." : "ثبت در دفتر"}
    </Button>
  );
}

function sentence(
  preview: ReturnType<typeof projectHoldingMove>,
  cash: boolean,
  move: HoldingMove,
  unit: "rial" | "usd",
): string {
  if (!preview.ok) {
    if (preview.reason === "oversell") return "مقدار از موجودی بیشتر است.";
    if (preview.reason === "empty") return "برای اصلاح میانگین باید موجودی داشته باشید.";
    return cash ? "مبلغ را وارد کنید." : "مقدار و قیمت را وارد کنید.";
  }
  const count = formatQuantity(preview.quantity);
  if (cash) return `موجودی به ${count} می‌رسد.`;
  if (move === "remove") return `تعداد به ${count} می‌رسد و میانگین خرید همان می‌ماند.`;
  if (move === "average") {
    return `میانگین به ${money(preview.average, unit)} می‌رسد و تعداد همان ${count} می‌ماند.`;
  }
  if (preview.average == null) {
    return `تعداد به ${count} می‌رسد. میانگین خالی می‌ماند تا از همین‌جا اصلاح شود.`;
  }
  return `تعداد به ${count} می‌رسد و میانگین به ${money(preview.average, unit)} می‌رسد.`;
}

function money(value: number | null, unit: "rial" | "usd"): string {
  if (value == null) return "—";
  return unit === "usd" ? formatDollar(value, 2) : formatMoney(value);
}

function numberOrNull(value: string): number | null {
  const parsed = Number(normalizeNumericInput(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: string): number {
  return numberOrNull(value) ?? 0;
}

function todayInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
