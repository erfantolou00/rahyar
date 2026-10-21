import { fetchFirst } from "@/lib/finance/prices/fetch-with-fallback";
import {
  CodalShapeError,
  isFinancialStatement,
  isMonthlyActivity,
  lettersForSymbol,
  parseCodalSearch,
  parseCodalSearchXml,
  periodFromTitle,
  selectDividendLetters,
  selectFisStatementLetters,
  selectMonthlyLetters,
  type ChosenStatement,
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

async function fetchCodalText(url: string, headers: Record<string, string> = HEADERS): Promise<string> {
  const allowed = codalUrl(url);
  if (!allowed) throw new Error(`blocked codal url ${url}`);
  const response = await fetch(allowed, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${allowed}`);
  return response.text();
}

const SEARCH_HEADERS = { ...HEADERS, accept: "application/json" };
const PAGE_SIZE = 20;

async function readSearch(url: string): Promise<CodalLetter[]> {
  const text = await fetchCodalText(url, SEARCH_HEADERS);
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) return parseCodalSearchXml(trimmed);
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed) as unknown;
  } catch {
    throw new CodalShapeError("ساختار فهرست کدال عوض شده؛ پاسخ JSON نیست");
  }
  return parseCodalSearch(payload);
}

function issuerParams(includeChildren: boolean): string {
  return [
    `Childs=${includeChildren}`,
    "Mains=true",
    "AuditorRef=-1",
    "CompanyState=-1",
    "CompanyType=-1",
    "Publisher=false",
    "ReportingType=-1",
    "TracingNo=-1",
    "Audited=true",
    "NotAudited=true",
    "Consolidatable=true",
    "NotConsolidatable=true",
    "Length=-1",
    "search=true",
  ].join("&");
}

async function searchPages(
  symbol: string,
  filter: string,
  maxPages: number,
  done: (letters: CodalLetter[]) => boolean,
): Promise<{ letters: CodalLetter[]; reached: boolean }> {
  const collected: CodalLetter[] = [];
  let reached = false;
  for (const includeChildren of [false, true]) {
    if (includeChildren && collected.length > 0) break;
    for (let page = 1; page <= maxPages; page += 1) {
      const url = `https://search.codal.ir/api/search/v2/q?Symbol=${encodeURIComponent(symbol)}&PageNumber=${page}&${filter}&${issuerParams(includeChildren)}`;
      try {
        const batch = lettersForSymbol(await readSearch(url), symbol);
        reached = true;
        collected.push(...batch);
        if (collected.length > 0 && done(collected)) return { letters: collected, reached };
        if (batch.length < PAGE_SIZE) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[codal] search failed: ${message}`);
        break;
      }
    }
  }
  return { letters: collected, reached };
}

export type CodalDossier = {
  statements: ChosenStatement[];
  monthly: CodalLetter[];
  dividends: CodalLetter[];
  newest: CodalLetter | null;
  source: string;
};

function statementPageDone(letters: CodalLetter[]): boolean {
  return selectFisStatementLetters(letters).some((item) => item.role === "same-period-last-year");
}

function monthlyPageDone(letters: CodalLetter[]): boolean {
  const newest = periodFromTitle(selectMonthlyLetters(letters, 1)[0]?.title ?? "");
  if (!newest) return false;
  const previous = `${Number(newest.slice(0, 4)) - 1}/${newest.slice(5)}`;
  return letters.some((letter) => periodFromTitle(letter.title) === previous);
}

export async function fetchCodalDossier(symbol: string): Promise<CodalDossier | null> {
  const general = await searchPages(symbol, "Category=-1&LetterType=-1", 1, () => true);
  const byCode = await searchPages(
    symbol,
    `Category=-1&LetterType=-1&LetterCode=${encodeURIComponent("ن-10")}`,
    2,
    statementPageDone,
  );
  const statementLetters = byCode.letters.some(isFinancialStatement)
    ? byCode
    : await searchPages(symbol, "Category=1&LetterType=6", 2, statementPageDone);
  const byMonthlyCode = await searchPages(
    symbol,
    `Category=3&LetterType=-1&LetterCode=${encodeURIComponent("ن-30")}`,
    2,
    monthlyPageDone,
  );
  const monthlyLetters = byMonthlyCode.letters.some(isMonthlyActivity)
    ? byMonthlyCode
    : await searchPages(symbol, "Category=3&LetterType=58", 2, monthlyPageDone);
  const decisions = await searchPages(symbol, "Category=6&LetterType=20", 1, () => true);
  const summaries = await searchPages(symbol, "Category=6&LetterType=2020", 1, () => true);
  const schedules = decisions.letters.length + summaries.letters.length > 0
    ? { letters: [], reached: true }
    : await searchPages(symbol, "Category=1&LetterType=30", 1, () => true);
  const queries = [general, byCode, statementLetters, byMonthlyCode, monthlyLetters, decisions, summaries, schedules];
  if (!queries.some((query) => query.reached)) return null;
  const all = queries.flatMap((query) => query.letters);
  const newest = all.slice().sort((left, right) => right.tracingNo - left.tracingNo)[0] ?? null;
  return {
    statements: selectFisStatementLetters([...statementLetters.letters, ...general.letters]),
    monthly: selectMonthlyLetters([...monthlyLetters.letters, ...general.letters], 18),
    dividends: selectDividendLetters([...decisions.letters, ...summaries.letters, ...schedules.letters, ...general.letters]),
    newest,
    source: "codal-search:issuer",
  };
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
  const result = await fetchFirst(sources, (html) => /<tr[\s>]/i.test(html), "codal");
  return result ? { html: result.value, source: result.source } : null;
}
