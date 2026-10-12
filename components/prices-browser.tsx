import Link from "next/link";
import { EmptyState } from "@/components/chrome";
import { PricesTable, type PriceTableRow } from "@/components/prices-table";
import { formatNumber } from "@/lib/finance/format";
import { priceListHref } from "@/lib/finance/prices/list";

export function PricesBrowser({
  rows,
  needle,
  page,
  pageCount,
  total,
}: {
  rows: PriceTableRow[];
  needle: string;
  page: number;
  pageCount: number;
  total: number;
}) {
  return (
    <div>
      <form action="/prices" method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={needle}
          placeholder="نماد، نوع یا منبع"
          aria-label="جستجو در قیمت‌ها"
          className="field-input max-w-xs"
        />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          جستجو
        </button>
        {needle ? (
          <Link href="/prices" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            پاک کردن
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState>{needle ? "موردی با این جستجو پیدا نشد." : "قیمتی ثبت نشده است."}</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            <span className="numeric">{formatNumber(total, 0)}</span> مورد
            {pageCount > 1 ? (
              <>
                {" · "}
                صفحه <span className="numeric">{formatNumber(page, 0)}</span> از{" "}
                <span className="numeric">{formatNumber(pageCount, 0)}</span>
              </>
            ) : null}
          </p>
          <PricesTable rows={rows} />
          {pageCount > 1 ? (
            <nav className="mt-3 flex items-center justify-between gap-2 text-sm" aria-label="صفحه‌های قیمت">
              {page > 1 ? (
                <Link href={priceListHref(needle, page - 1)} className="rounded-lg border border-line px-3 py-1.5">
                  قبلی
                </Link>
              ) : (
                <span className="rounded-lg border border-line px-3 py-1.5 text-muted-foreground">قبلی</span>
              )}
              {page < pageCount ? (
                <Link href={priceListHref(needle, page + 1)} className="rounded-lg border border-line px-3 py-1.5">
                  بعدی
                </Link>
              ) : (
                <span className="rounded-lg border border-line px-3 py-1.5 text-muted-foreground">بعدی</span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
