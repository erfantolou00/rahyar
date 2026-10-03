import { fetchFirst } from "@/lib/finance/prices/fetch-with-fallback";
import {
  CodalShapeError,
  lettersForSymbol,
  parseCodalSearch,
  type CodalLetter,
} from "@/lib/finance/codal/parse";

const HEADERS = {
  accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  referer: "https://www.codal.ir/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const HOSTS = new Set(["excel.codal.ir", "www.codal.ir", "codal.ir", "search.codal.ir"]);

export function codalUrl(value: string): string | null {
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(value, "https://www.codal.ir");
    if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchCodalText(url: string): Promise<string> {
  const allowed = codalUrl(url);
  if (!allowed) throw new Error(`blocked codal url ${url}`);
  const response = await fetch(allowed, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${allowed}`);
  return response.text();
}

async function readSearch(url: string): Promise<CodalLetter[]> {
  const text = await fetchCodalText(url);
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new CodalShapeError("ساختار فهرست کدال عوض شده؛ پاسخ JSON نیست");
  }
  return parseCodalSearch(payload);
}

export async function fetchCodalLetters(symbol: string): Promise<{ letters: CodalLetter[]; source: string } | null> {
  const encoded = encodeURIComponent(symbol);
  const plain = `https://search.codal.ir/api/search/v2/q?Symbol=${encoded}&PageNumber=1&search=true`;
  const full =
    `https://search.codal.ir/api/search/v2/q?Audited=true&AuditorRef=-1&Category=-1&Childs=true` +
    `&CompanyState=-1&CompanyType=-1&Consolidatable=true&IsNotAudited=false&Length=-1&LetterType=-1` +
    `&Mains=true&NotAudited=true&NotConsolidatable=true&PageNumber=1&Publisher=false&ReportingType=-1` +
    `&Symbol=${encoded}&TracingNo=-1&search=true`;
  const result = await fetchFirst(
    [
      { name: "codal-search:v2", run: () => readSearch(plain) },
      { name: "codal-search:v2-full", run: () => readSearch(full) },
    ],
    (letters) => Array.isArray(letters),
    "codal",
  );
  if (!result) return null;
  return { letters: lettersForSymbol(result.value, symbol), source: result.source };
}

export async function fetchCodalReport(letter: CodalLetter): Promise<{ html: string; source: string } | null> {
  const sources: { name: string; run: () => Promise<string> }[] = [];
  if (letter.excelUrl && codalUrl(letter.excelUrl)) {
    sources.push({ name: "excel.codal", run: () => fetchCodalText(letter.excelUrl as string) });
  }
  if (letter.htmlPath && codalUrl(letter.htmlPath)) {
    sources.push({ name: "codal.ir:decision", run: () => fetchCodalText(letter.htmlPath as string) });
  }
  if (sources.length === 0) return null;
  const result = await fetchFirst(sources, (html) => html.includes("<"), "codal");
  return result ? { html: result.value, source: result.source } : null;
}
