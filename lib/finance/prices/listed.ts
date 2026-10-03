import { fetchText } from "@/lib/finance/prices/tgju";
import { fetchFirst } from "@/lib/finance/prices/fetch-with-fallback";
import { normalizeSymbol } from "@/lib/finance/prices/match";

export class MarketShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketShapeError";
  }
}

export type ListedInstrument = {
  symbol: string;
  insCode: string;
};

export type ListedQuote = {
  price: number;
  eps: number | null;
  source: string;
};

const CDN = "https://cdn.tsetmc.com";
const LEGACY = "https://old.tsetmc.com";

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

export function parseTsetmcSearch(payload: unknown): ListedInstrument[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.instrumentSearch)) {
    throw new MarketShapeError("instrumentSearch");
  }
  const rows = record.instrumentSearch.flatMap((item) => {
    const row = asRecord(item);
    const symbol = row && typeof row.lVal18AFC === "string" ? row.lVal18AFC.trim() : "";
    const insCode = row && (typeof row.insCode === "string" || typeof row.insCode === "number") ? String(row.insCode).trim() : "";
    if (!symbol || !/^\d{5,}$/.test(insCode)) return [];
    return [{ symbol, insCode }];
  });
  if (record.instrumentSearch.length > 0 && rows.length === 0) {
    throw new MarketShapeError("instrumentSearch rows");
  }
  return rows;
}

export function matchListedSymbol(rows: ListedInstrument[], query: string): ListedInstrument | null {
  const wanted = normalizeSymbol(query);
  if (!wanted) return null;
  return rows.find((row) => normalizeSymbol(row.symbol) === wanted) ?? null;
}

export function parseClosingPrice(payload: unknown): number {
  const info = asRecord(asRecord(payload)?.closingPriceInfo);
  if (!info) throw new MarketShapeError("closingPriceInfo");
  const last = numeric(info.pDrCotVal);
  const close = numeric(info.pClosing);
  const price = last != null && last > 0 ? last : close;
  if (price == null || !(price > 0)) throw new MarketShapeError("last price");
  return price;
}

export function parseInstrumentEps(payload: unknown): number | null {
  const info = asRecord(asRecord(payload)?.instrumentInfo);
  if (!info) throw new MarketShapeError("instrumentInfo");
  const eps = asRecord(info.eps);
  if (!eps) throw new MarketShapeError("eps");
  const estimated = numeric(eps.estimatedEPS);
  const actual = numeric(eps.epsValue);
  if (estimated != null && estimated > 0) return estimated;
  if (actual != null && actual > 0) return actual;
  return null;
}

export function parseLegacySearch(text: string): ListedInstrument[] {
  const rows = text.split(";").flatMap((part) => {
    const cells = part.split(",");
    const symbol = cells[0]?.trim() ?? "";
    const insCode = cells[2]?.trim() ?? "";
    if (!symbol || !/^\d{5,}$/.test(insCode)) return [];
    return [{ symbol, insCode }];
  });
  if (!rows.length) throw new MarketShapeError("legacy search shape");
  return rows;
}

export function parseLegacyLastPrice(text: string): number {
  const cells = (text.split(";")[0] ?? "").split(",");
  if (cells.length < 4) throw new MarketShapeError("legacy price shape");
  const last = Number(cells[2]);
  const close = Number(cells[3]);
  const price = Number.isFinite(last) && last > 0 ? last : close;
  if (!Number.isFinite(price) || price <= 0) throw new MarketShapeError("legacy price missing");
  return price;
}

async function readJson(url: string): Promise<unknown> {
  const text = await fetchText(url, 8_000);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MarketShapeError(`json ${url}`);
  }
}

async function cdnQuote(symbol: string): Promise<{ price: number; eps: number | null }> {
  const payload = await readJson(`${CDN}/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`);
  const match = matchListedSymbol(parseTsetmcSearch(payload), symbol);
  if (!match) throw new Error(`no exact listing for ${symbol}`);
  const price = parseClosingPrice(await readJson(`${CDN}/api/ClosingPrice/GetClosingPriceInfo/${match.insCode}`));
  let eps: number | null = null;
  try {
    eps = parseInstrumentEps(await readJson(`${CDN}/api/Instrument/GetInstrumentInfo/${match.insCode}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] tsetmc eps ${symbol} skipped: ${message}`);
  }
  return { price, eps };
}

async function legacyQuote(symbol: string): Promise<{ price: number; eps: number | null }> {
  const search = await fetchText(`${LEGACY}/tsev2/data/search.aspx?skey=${encodeURIComponent(symbol)}`, 8_000);
  const match = matchListedSymbol(parseLegacySearch(search), symbol);
  if (!match) throw new Error(`no exact legacy listing for ${symbol}`);
  const text = await fetchText(`${LEGACY}/tsev2/data/instinfodata.aspx?i=${match.insCode}&c=57+`, 8_000);
  return { price: parseLegacyLastPrice(text), eps: null };
}

export async function fetchListedQuote(symbol: string): Promise<ListedQuote | null> {
  const result = await fetchFirst(
    [
      { name: "tsetmc-cdn:last", run: () => cdnQuote(symbol) },
      { name: "tsetmc-legacy:last", run: () => legacyQuote(symbol) },
    ],
    (quote) => Number.isFinite(quote.price) && quote.price > 0,
    "prices",
  );
  return result ? { price: result.value.price, eps: result.value.eps, source: result.source } : null;
}
