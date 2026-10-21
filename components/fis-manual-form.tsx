"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { createFisReport } from "@/app/(dashboard)/reports/actions";
import { Field, primaryControlClass, quietControlClass } from "@/components/chrome";
import type { ManualSheet } from "@/lib/finance/fis-manual";

const inputClass = "h-9 w-full rounded-lg border border-input bg-card px-2 text-sm";

const amountFields = [
  ["sales", "فروش دوره"],
  ["priorPeriodSales", "فروش دوره مشابه پارسال"],
  ["operatingProfit", "سود عملیاتی"],
  ["otherOperatingIncome", "سایر درآمد عملیاتی"],
  ["netIncome", "سود خالص"],
  ["periodEps", "سود هر سهم دوره"],
  ["cogs", "بهای تمام‌شده"],
] as const;

const balanceFields = [
  ["totalAssets", "جمع دارایی‌ها"],
  ["receivables", "مطالبات"],
  ["inventory", "موجودی پایان دوره"],
  ["priorInventory", "موجودی ابتدای دوره"],
  ["retainedEarnings", "سود انباشته"],
] as const;

const extraFields = [
  ["ttmEps", "سود هر سهم دوازده‌ماهه"],
  ["dividendRatioPercent", "نسبت تقسیم سود (درصد)"],
  ["priorSales", "فروش دوره کوتاه‌تر"],
  ["priorOperatingProfit", "سود عملیاتی دوره کوتاه‌تر"],
] as const;

function textOf(sheet: ManualSheet | undefined, key: keyof ManualSheet): string {
  const value = sheet?.[key];
  return typeof value === "number" ? String(value) : "";
}

export function FisManualForm({
  stocks,
  sheets,
}: {
  stocks: { symbol: string; price: number | null }[];
  sheets: Record<string, ManualSheet>;
}) {
  const [symbol, setSymbol] = useState(stocks[0]?.symbol ?? "");
  const sheet = sheets[symbol];

  return (
    <form action={createFisReport} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="سهم">
          <select name="symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} className={inputClass}>
            <option value="">همه سهم‌های سبد</option>
            {stocks.map((stock) => (
              <option key={stock.symbol} value={stock.symbol}>{stock.symbol}</option>
            ))}
          </select>
        </Field>
        <Field label="نرخ اخزا (درصد)">
          <input name="akhza" required inputMode="decimal" dir="ltr" placeholder="۴۰" className={inputClass} />
        </Field>
        <Field label="تورم دوازده‌ماهه">
          <input name="inflation" inputMode="decimal" dir="ltr" placeholder="اختیاری" className={inputClass} />
        </Field>
        <Field label="ماه گذشته از سال">
          <select key={`${symbol}-months`} name="months" defaultValue={textOf(sheet, "months")} className={inputClass}>
            <option value="">از کدال</option>
            <option value="3">۳</option>
            <option value="6">۶</option>
            <option value="9">۹</option>
            <option value="12">۱۲</option>
          </select>
        </Field>
      </div>
      {symbol ? (
        <div key={symbol} className="grid gap-2">
          <p className="text-xs leading-5 text-muted-foreground">
            مبالغ صورت به میلیون ریال است. قیمت و سود هر سهم به ریال. خانه خالی از کدال پر می‌شود.
            {stocks.find((stock) => stock.symbol === symbol)?.price != null
              ? ` قیمت سبد ${stocks.find((stock) => stock.symbol === symbol)?.price} ریال است.`
              : ""}
          </p>
          <Field label="قیمت (ریال)">
            <input name="price" inputMode="decimal" dir="ltr" defaultValue={textOf(sheet, "price")} placeholder="قیمت سبد" className={inputClass} />
          </Field>
          <Fold title="صورت سود و زیان" open>
            <FieldGrid fields={amountFields} sheet={sheet} />
          </Fold>
          <Fold title="ترازنامه">
            <FieldGrid fields={balanceFields} sheet={sheet} />
          </Fold>
          <Fold title="دوره کوتاه‌تر، سود تقسیمی و سال مالی">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ماه دوره کوتاه‌تر">
                <select name="priorMonths" defaultValue={textOf(sheet, "priorMonths")} className={inputClass}>
                  <option value="">از کدال</option>
                  <option value="3">۳</option>
                  <option value="6">۶</option>
                  <option value="9">۹</option>
                </select>
              </Field>
              <Field label="پایان سال مالی">
                <select name="fiscalYearScore" defaultValue={textOf(sheet, "fiscalYearScore")} className={inputClass}>
                  <option value="">از کدال</option>
                  <option value="5">ثابت، دست‌کم ۹ ماه</option>
                  <option value="3">ثابت، ۶ تا ۸ ماه</option>
                  <option value="0">عوض شده یا کوتاه</option>
                </select>
              </Field>
              {extraFields.map(([name, label]) => (
                <Field key={name} label={label}>
                  <input name={name} inputMode="decimal" dir="ltr" defaultValue={textOf(sheet, name)} className={inputClass} />
                </Field>
              ))}
            </div>
          </Fold>
        </div>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">برای ورود دستی، یک سهم را انتخاب کنید. گزارش همه، عددهای ذخیره‌شده هر سهم را هم به کار می‌برد.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="scope" value="one" disabled={!symbol} className={primaryControlClass}>گزارش این سهم</button>
        <button type="submit" name="scope" value="all" className={quietControlClass}>گزارش همه سهم‌ها</button>
      </div>
    </form>
  );
}

function FieldGrid({
  fields,
  sheet,
}: {
  fields: readonly (readonly [keyof ManualSheet, string])[];
  sheet: ManualSheet | undefined;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([name, label]) => (
        <Field key={name} label={label}>
          <input name={name} inputMode="decimal" dir="ltr" defaultValue={textOf(sheet, name)} className={inputClass} />
        </Field>
      ))}
    </div>
  );
}

function Fold({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}
