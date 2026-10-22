import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/finance/format";
import type { FisFactor } from "@/lib/finance/fis";
import type { FisReportContent } from "@/lib/finance/publish-fis";

function shown(value: number | null, digits = 2): string {
  return value == null ? "—" : formatNumber(value, digits);
}

export function FisReportView({ content }: { content: FisReportContent }) {
  const inflation = content.inflation_percent == null
    ? "تورم وارد نشده و ۴۰ درصد نشسته است."
    : `تورم ${formatNumber(content.inflation_percent, 2)} درصد.`;

  return (
    <div className="grid gap-2">
      <p className="text-sm leading-6 text-muted-foreground">
        {content.source === "rahavard" ? "صورت‌ها از رهاورد ۳۶۵. " : content.source === "codal" ? "صورت‌ها از کدال. " : ""}
        اخزا <span className="numeric">{formatNumber(content.akhza_percent, 2)}</span>
        {" درصد. خرید تا "}
        <span className="numeric">{shown(content.buy_pe)}</span>
        {" و خروج از "}
        <span className="numeric">{shown(content.exit_pe)}</span>
        {". "}
        {inflation}
        {" پیشنهاد است و معامله ثبت نمی‌کند."}
      </p>
      {content.stocks.length === 0 ? (
        <p className="text-sm leading-6">سهمی با مانده در سبد نیست.</p>
      ) : (
        content.stocks.map((stock) => (
          <details key={stock.symbol} {...(content.stocks.length === 1 ? { open: true } : {})} className="surface group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
              <span className="font-medium">{stock.symbol}</span>
              <span className="text-muted-foreground">{stock.label}</span>
              <span className="numeric ms-auto">{stock.score == null ? "—" : formatNumber(stock.score, 0)}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-border px-3 py-2">
              <p className="text-sm leading-6">
                {stock.score == null ? stock.reason : `امتیاز ${formatNumber(stock.score, 0)} از ۱۰۰. ${stock.reason}`}
                {" "}
                <span className="text-muted-foreground">
                  نسبت آینده‌نگر خطی <span className="numeric">{shown(stock.forward_pe)}</span>
                  {" · فصلی "}
                  <span className="numeric">{shown(stock.forward_pe_seasonal)}</span>
                  {" (در امتیاز نیست)"}
                  {stock.previous_score == null ? "" : ` · قبل ${formatNumber(stock.previous_score, 0)}`}
                </span>
              </p>
              {stock.seasonal_gaps.length > 0 ? (
                <ul className="mt-1 grid gap-1 text-xs leading-5 text-muted-foreground">
                  {stock.seasonal_gaps.map((gap, index) => <li key={`${index}-${gap}`}>{gap}</li>)}
                </ul>
              ) : null}
              <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                {stock.factors.map((factor) => (
                  <FactorRow key={factor.key} factor={factor} />
                ))}
              </div>
              <Notes stock={stock} />
            </div>
          </details>
        ))
      )}
    </div>
  );
}

function FactorRow({ factor }: { factor: FisFactor }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1 text-xs">
      <span className="min-w-0">{factor.label}</span>
      <span className="numeric shrink-0 text-muted-foreground">
        {shown(factor.value)} · {formatNumber(factor.score, 0)}/{formatNumber(factor.max, 0)}
      </span>
    </div>
  );
}

function Notes({ stock }: { stock: FisReportContent["stocks"][number] }) {
  const notes = stock.factors.filter((factor) => factor.note);
  if (notes.length === 0 && stock.gaps.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">توضیح ردیف‌های ناقص</summary>
      <ul className="mt-1 grid gap-1 text-xs leading-5 text-muted-foreground">
        {notes.map((factor) => <li key={factor.key}>{factor.label}: {factor.note}</li>)}
        {stock.gaps.map((gap) => <li key={gap}>{gap}</li>)}
      </ul>
    </details>
  );
}
