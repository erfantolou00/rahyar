import { MarketShapeError } from "@/lib/finance/prices/shape-error";
import { normalizeSymbol } from "@/lib/finance/prices/match";

const ORIGIN = "https://rahavard365.com";

export type RahavardHit = {
  id: string;
  symbol: string;
  kind: string;
  typeId: string;
};

export type RahavardProfile = {
  price: number;
  eps: number | null;
  dailyChange: number | null;
  dailyPercent: number | null;
  quarterPercent: number | null;
  yearPercent: number | null;
  volume: number | null;
  tradeValue: number | null;
  marketCap: number | null;
  freeFloatPercent: number | null;
  pb: number | null;
  dps: number | null;
  industry: string | null;
  state: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[,،]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

function percentFromFraction(value: unknown): number | null {
  const fraction = numeric(value);
  if (fraction == null) return null;
  return Math.round(fraction * 10000) / 100;
}

export function parseRahavardSearch(payload: unknown): RahavardHit[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.data)) throw new MarketShapeError("rahavard search");
  return record.data.flatMap((item) => {
    const row = asRecord(item);
    const id = row && (typeof row.entity_id === "string" || typeof row.entity_id === "number") ? String(row.entity_id).trim() : "";
    const symbol = row && typeof row.trade_symbol === "string" ? row.trade_symbol.trim() : "";
    if (!/^\d+$/.test(id) || !symbol) return [];
    return [{
      id,
      symbol,
      kind: typeof row?.type === "string" ? row.type.trim() : "",
      typeId: typeof row?.type_id === "string" || typeof row?.type_id === "number" ? String(row.type_id) : "",
    }];
  });
}

export function matchRahavard(rows: RahavardHit[], query: string): RahavardHit | null {
  const wanted = normalizeSymbol(query);
  const exact = rows.filter((row) => normalizeSymbol(row.symbol) === wanted);
  return exact.find((row) => row.kind === "سهام" || row.typeId === "1") ?? exact[0] ?? null;
}

function industryName(asset: Record<string, unknown> | null): string | null {
  const category = asRecord(asset?.category);
  const parent = asRecord(category?.parent);
  const child = text(category?.short_name, 40) ?? text(category?.name, 40);
  const group = text(parent?.short_name, 40) ?? text(parent?.name, 40);
  if (group && child) return `${group} · ${child}`.slice(0, 80);
  return group ?? child;
}

export function parseRahavardAsset(payload: unknown): RahavardProfile {
  const root = asRecord(asRecord(payload)?.data);
  const trade = asRecord(root?.last_trade);
  const price = numeric(trade?.close_price);
  if (!root || price == null || !(price > 0)) throw new MarketShapeError("rahavard last trade");
  const returns = asRecord(root.returns);
  const eps = asRecord(root.eps);
  const dps = asRecord(root.dps);
  const asset = asRecord(root.asset);
  const state = asRecord(asset?.instrument_state);
  return {
    price,
    eps: numeric(dps?.pure_eps) ?? numeric(eps?.pure_ttm),
    dailyChange: numeric(trade?.close_price_change),
    dailyPercent: percentFromFraction(trade?.close_price_change_percent),
    quarterPercent: percentFromFraction(asRecord(returns?.return_3_m)?.return),
    yearPercent: percentFromFraction(asRecord(returns?.return_1_y)?.return),
    volume: numeric(trade?.volume),
    tradeValue: numeric(trade?.value),
    marketCap: numeric(asRecord(root.last_value)?.value),
    freeFloatPercent: percentFromFraction(asRecord(root.last_free_float)?.percent),
    pb: (() => {
      const value = numeric(asRecord(root.last_pb)?.value);
      return value == null ? null : Math.round(value * 100) / 100;
    })(),
    dps: numeric(dps?.pure_dps),
    industry: industryName(asset),
    state: text(state?.description, 40),
  };
}

async function readRahavard(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      referer: `${ORIGIN}/`,
      "user-agent": "Mozilla/5.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<unknown>;
}

export async function fetchRahavardProfile(symbol: string): Promise<RahavardProfile | null> {
  const found = matchRahavard(
    parseRahavardSearch(await readRahavard(`${ORIGIN}/api/v2/search?keyword=${encodeURIComponent(symbol)}`)),
    symbol,
  );
  if (!found) return null;
  return parseRahavardAsset(await readRahavard(`${ORIGIN}/api/v2/asset/${found.id}`));
}

export async function fetchRahavardQuote(symbol: string): Promise<{ price: number; eps: number | null }> {
  const profile = await fetchRahavardProfile(symbol);
  if (!profile) throw new Error(`no rahavard listing for ${symbol}`);
  return { price: profile.price, eps: profile.eps };
}
