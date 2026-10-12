import { toNumber } from "@/lib/finance/format";
import { assetTypeLabels } from "@/lib/finance/labels";
import type { FinanceClient } from "@/lib/finance/queries";
import { assetTypes, type Price } from "@/lib/finance/types";

export const PRICE_PAGE_SIZE = 20;

export function parsePriceListQuery(
  q: string | undefined,
  page: string | undefined,
): { needle: string; page: number } {
  const needle = (q ?? "")
    .replace(/[%_,.()\\*"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  const parsed = Number(page);
  const safePage = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 1;
  return { needle, page: safePage };
}

export function priceSearchFilter(needle: string): string | null {
  if (!needle) return null;
  const pattern = `"%${needle}%"`;
  const folded = needle.toLowerCase();
  const types = assetTypes.filter(
    (type) => needle.length >= 2 && (assetTypeLabels[type].includes(needle) || type.includes(folded)),
  );
  const parts = [`symbol.ilike.${pattern}`, `source.ilike.${pattern}`];
  if (types.length > 0) parts.push(`asset_type.in.(${types.join(",")})`);
  return parts.join(",");
}

export function priceListHref(needle: string, page: number): string {
  const params = new URLSearchParams();
  if (needle) params.set("q", needle);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/prices?${query}` : "/prices";
}

function schemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the table/i.test(error.message ?? "")
  );
}

export type PriceListResult =
  | {
      ok: true;
      rows: Price[];
      total: number;
      page: number;
      pageCount: number;
      usd: number | null;
    }
  | { ok: false; missingSchema: boolean };

export async function loadPricePage(
  supabase: FinanceClient,
  input: { needle: string; page: number },
): Promise<PriceListResult> {
  const filter = priceSearchFilter(input.needle);
  const filtered = () => {
    const query = supabase.from("prices").select("*", { count: "exact" }).order("timestamp", { ascending: false });
    return filter ? query.or(filter) : query;
  };

  const from = (input.page - 1) * PRICE_PAGE_SIZE;
  const [pageResult, usdResult] = await Promise.all([
    filtered().range(from, from + PRICE_PAGE_SIZE - 1),
    supabase.from("prices").select("price").eq("symbol", "USD").order("timestamp", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (pageResult.error) {
    console.error(pageResult.error);
    return { ok: false, missingSchema: schemaMissing(pageResult.error) };
  }

  const total = pageResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PRICE_PAGE_SIZE));
  let rows = pageResult.data ?? [];
  let page = input.page;
  if (rows.length === 0 && total > 0 && page > pageCount) {
    page = pageCount;
    const retryFrom = (page - 1) * PRICE_PAGE_SIZE;
    const retry = await filtered().range(retryFrom, retryFrom + PRICE_PAGE_SIZE - 1);
    if (retry.error) {
      console.error(retry.error);
      return { ok: false, missingSchema: schemaMissing(retry.error) };
    }
    rows = retry.data ?? [];
  }

  const usdPrice = usdResult.data ? toNumber(usdResult.data.price) : 0;
  return {
    ok: true,
    rows,
    total,
    page,
    pageCount,
    usd: usdPrice > 0 ? usdPrice : null,
  };
}
