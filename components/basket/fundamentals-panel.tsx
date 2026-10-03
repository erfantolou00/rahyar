import { SchemaNotice } from "@/components/chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PresentedFundamental } from "@/lib/finance/basket-view";

export function FundamentalsPanel({
  rows,
  schemaIssue,
}: {
  rows: PresentedFundamental[];
  schemaIssue: boolean | null;
}) {
  if (schemaIssue != null) return <SchemaNotice missing={schemaIssue} />;
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          سهمی با نوع سهام در سبد نیست. شاخص‌های کدال فقط برای همین نوع نشان داده می‌شوند.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <Card key={row.symbol}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {row.symbol}
              {row.adjusted ? (
                <span className="rounded-md border border-warn px-2 py-0.5 text-xs font-medium text-warn">تعدیل یا اصلاحیه</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-4">
              <Metric label="P/E" value={row.pe} />
              <Metric label="EPS" value={row.eps} />
              <Metric label="ROE" value={row.roe} />
              <Metric label="حاشیه سود" value={row.profitMargin} />
            </dl>
            {row.letter ? (
              <p className="text-sm leading-7 text-muted-foreground">
                {row.letter}
                {row.published ? <span className="numeric"> · {row.published}</span> : null}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">هنوز نامه‌ای از کدال برای این نماد ذخیره نشده است.</p>
            )}
            {row.sales.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium">روند فروش ماهانه (میلیون ریال)</p>
                <ul className="grid gap-1">
                  {row.sales.map((point) => (
                    <li key={point.period} className="flex items-center justify-between gap-3 text-sm">
                      <span className="numeric text-muted-foreground">{point.period}</span>
                      <span className="numeric">{point.sales}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {row.shapeError ? <p className="text-sm leading-7 text-warn">{row.shapeError}</p> : null}
            <p className="text-xs text-muted-foreground">{row.fetchedLabel}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="numeric mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
