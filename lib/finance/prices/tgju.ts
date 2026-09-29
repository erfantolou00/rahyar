export function parseMarketNumber(raw: string): number {
  const parsed = Number(raw.replace(/[,،\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid market number: ${raw}`);
  }
  return parsed;
}

export async function fetchText(url: string, timeoutMs = 8_000): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/html;q=0.9",
      "user-agent": "RahyarPriceBot/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return response.text();
}

type TgjuRow = { p?: string };

let boardRequest: Promise<Record<string, TgjuRow>> | null = null;

export function resetTgjuCache(): void {
  boardRequest = null;
}

async function loadTgjuBoard(): Promise<Record<string, TgjuRow>> {
  if (!boardRequest) {
    boardRequest = readTgjuBoard().finally(() => {
      boardRequest = null;
    });
  }
  return boardRequest;
}

async function readTgjuBoard(): Promise<Record<string, TgjuRow>> {
  const hosts = ["https://call1.tgju.org/ajax.json", "https://call5.tgju.org/ajax.json"];
  let lastError: unknown;
  for (const url of hosts) {
    try {
      const text = await fetchText(url);
      const body = JSON.parse(text) as { current?: Record<string, TgjuRow> };
      if (!body.current) throw new Error("tgju board has no current prices");
      return body.current;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("tgju board unavailable");
}

export async function tgjuPrice(key: string): Promise<number> {
  const board = await loadTgjuBoard();
  const row = board[key];
  if (!row?.p) throw new Error(`tgju missing ${key}`);
  return parseMarketNumber(row.p);
}

const profilePrice = /data-col="info\.last_trade\.PDrCotVal"[^>]*>([0-9][0-9,]*)/;

export async function scrapeTgjuProfile(url: string): Promise<number> {
  const html = await fetchText(url, 12_000);
  const match = html.match(profilePrice);
  if (!match?.[1]) throw new Error(`price markup missing at ${url}`);
  return parseMarketNumber(match[1]);
}
