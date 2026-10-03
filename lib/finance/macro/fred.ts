export class FredShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FredShapeError";
  }
}

export const macroIndicators = ["cpi", "fed_funds", "dxy"] as const;

export type MacroIndicator = (typeof macroIndicators)[number];

export const fredSeries: Record<MacroIndicator, string> = {
  cpi: "CPIAUCSL",
  fed_funds: "FEDFUNDS",
  dxy: "DTWEXBGS",
};

export type FredObservation = {
  date: string;
  value: number;
};

const FRED_OBSERVATIONS = "https://api.stlouisfed.org/fred/series/observations";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseFredObservations(payload: unknown): FredObservation[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.observations)) throw new FredShapeError("observations");
  const points = record.observations.flatMap((item) => {
    const row = asRecord(item);
    const date = row && typeof row.date === "string" ? row.date : "";
    const raw = row && typeof row.value === "string" ? row.value.trim() : "";
    if (!DATE.test(date) || !raw || raw === ".") return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    return [{ date, value }];
  });
  if (record.observations.length > 0 && points.length === 0) {
    throw new FredShapeError("observation values");
  }
  return points.sort((left, right) => left.date.localeCompare(right.date));
}

export async function fetchFredSeries(seriesId: string, apiKey: string): Promise<FredObservation[]> {
  const url = new URL(FRED_OBSERVATIONS);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "40");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${seriesId}`);
  return parseFredObservations(await response.json());
}
