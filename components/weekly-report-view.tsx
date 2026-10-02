import { EmptyState } from "@/components/chrome";
import { formatMoney, formatNumber, formatQuantity, formatTimestamp } from "@/lib/finance/format";
import { alertKindLabels, assetTypeLabels } from "@/lib/finance/labels";
import {
  formatAssetPnl,
  formatWeekChange,
  formatWeightBand,
  type WeeklyReportContent,
} from "@/lib/finance/weekly";

function tone(value: number | null): string {
  if (value == null || value === 0) return "";
  return value > 0 ? "text-ok" : "text-danger";
}

export function WeeklyReportView({ content }: { content: WeeklyReportContent }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        از <span className="numeric">{formatTimestamp(content.period.from)}</span>
        {" تا "}
        <span className="numeric">{formatTimestamp(content.period.to)}</span>
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm text-muted-foreground">ارزش سبد</h2>
          <p className="numeric mt-2 text-2xl font-semibold">{formatMoney(content.portfolio.total_value)}</p>
        </section>
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <h2 className="text-sm text-muted-foreground">تغییر نسبت به هفته قبل</h2>
          <p className={`numeric mt-2 text-2xl font-semibold ${tone(content.portfolio.change_value)}`}>
            {formatWeekChange(content.portfolio.change_value, content.portfolio.change_percent)}
          </p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">سود و زیان هر دارایی</h2>
        {content.assets.length === 0 ? (
          <EmptyState>دارایی‌ای در این گزارش نیست.</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto border-t border-line">
            <table className="w-full min-w-160 text-sm">
              <thead>
                <tr className="border-b border-line text-muted-foreground">
                  <th className="px-4 py-2 font-medium">نماد</th>
                  <th className="px-4 py-2 font-medium">طبقه</th>
                  <th className="px-4 py-2 font-medium">مقدار</th>
                  <th className="px-4 py-2 font-medium">ارزش</th>
                  <th className="px-4 py-2 font-medium">سود و زیان هفته</th>
                </tr>
              </thead>
              <tbody>
                {content.assets.map((asset) => (
                  <tr key={asset.id} className="border-b border-line">
                    <td className="px-4 py-2">{asset.symbol}</td>
                    <td className="px-4 py-2">{assetTypeLabels[asset.type]}</td>
                    <td className="numeric px-4 py-2">{formatQuantity(asset.quantity)}</td>
                    <td className="numeric px-4 py-2">{formatMoney(asset.value)}</td>
                    <td className={`numeric px-4 py-2 ${tone(asset.pnl_value)}`}>
                      {formatAssetPnl(asset.pnl_value, asset.pnl_percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">هشدارهای این هفته</h2>
        {content.alerts.length === 0 ? (
          <EmptyState>در این هفته هشداری ثبت نشده است.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {content.alerts.map((alert) => (
              <li key={alert.id} className="border-b border-line pb-3 text-sm">
                <p className="font-medium">
                  {alertKindLabels[alert.kind]}
                  {alert.asset_type ? ` · ${assetTypeLabels[alert.asset_type]}` : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {alert.message || alert.rule}
                  {" · آستانه "}
                  <span className="numeric">{formatNumber(alert.threshold, 2)}</span>
                  {" · "}
                  <span className="numeric">{formatTimestamp(alert.triggered_at)}</span>
                  {" · "}
                  {alert.is_active ? "فعال" : "خاموش"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">وزن نسبت به بازه مجاز</h2>
        {content.weights.length === 0 ? (
          <EmptyState>طبقه‌ای برای مقایسه نیست.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {content.weights.map((weight) => (
              <li key={weight.type} className="flex items-start justify-between gap-3 text-sm">
                <span>{assetTypeLabels[weight.type]}</span>
                <span className="numeric text-muted-foreground">{formatWeightBand(weight)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {content.commentary ? (
        <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">توضیح تکمیلی</h2>
          <p className="whitespace-pre-wrap text-sm leading-7">{content.commentary}</p>
        </section>
      ) : null}
    </div>
  );
}
