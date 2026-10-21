import { Panel } from "@/components/chrome";
import { formatNumber } from "@/lib/finance/format";
import type { FisReportContent } from "@/lib/finance/publish-fis";

function shown(value: number | null, digits = 2): string {
  return value == null ? "—" : formatNumber(value, digits);
}

export function FisReportView({ content }: { content: FisReportContent }) {
  return (
    <div className="grid gap-4">
      <Panel title="محدوده همین گزارش">
        <p className="text-sm leading-7 text-muted-foreground">
          نرخ اخزا <span className="numeric">{formatNumber(content.akhza_percent, 2)}</span>
          {" درصد. "}
          خرید تا نسبت <span className="numeric">{shown(content.buy_pe)}</span>
          {" و خروج از نسبت "}
          <span className="numeric">{shown(content.exit_pe)}</span>
          {". "}
          {content.inflation_percent == null
            ? "تورم دوازده‌ماهه وارد نشده و برای رشد فروش ۴۰ درصد نشسته است."
            : `تورم دوازده‌ماهه ${formatNumber(content.inflation_percent, 2)} درصد است.`}
          {" این گزارش فقط پیشنهاد است و معامله‌ای ثبت نمی‌کند."}
        </p>
      </Panel>
      {content.stocks.length === 0 ? (
        <Panel>
          <p className="text-sm leading-7">سهمی با مانده در سبد نیست.</p>
        </Panel>
      ) : (
        content.stocks.map((stock) => (
          <Panel key={stock.symbol} title={`${stock.symbol} · ${stock.label}`}>
            <p className="mb-3 text-sm leading-7">{stock.score == null ? stock.reason : `امتیاز ${formatNumber(stock.score, 0)} از ۱۰۰. ${stock.reason}`}</p>
            <p className="mb-3 text-sm text-muted-foreground">
              نسبت آینده‌نگر <span className="numeric">{shown(stock.forward_pe)}</span>
              {stock.previous_score == null ? "" : ` · امتیاز گزارش قبل ${formatNumber(stock.previous_score, 0)}`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-2 text-start font-medium">عامل</th>
                    <th className="px-2 py-2 text-start font-medium">مقدار</th>
                    <th className="px-2 py-2 text-start font-medium">امتیاز</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.factors.map((factor) => (
                    <tr key={factor.key} className="border-b border-border/70">
                      <td className="px-2 py-2">
                        {factor.label}
                        {factor.note ? <span className="mt-1 block text-xs leading-6 text-muted-foreground">{factor.note}</span> : null}
                      </td>
                      <td className="numeric px-2 py-2">{shown(factor.value)}</td>
                      <td className="numeric px-2 py-2">{formatNumber(factor.score, 0)} از {formatNumber(factor.max, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stock.gaps.length > 0 ? (
              <ul className="mt-3 grid gap-1 text-sm leading-7 text-muted-foreground">
                {stock.gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            ) : null}
          </Panel>
        ))
      )}
    </div>
  );
}
