import { fetchWithFallback } from "@/lib/finance/prices/fetch-with-fallback";
import { fetchText, scrapeTgjuProfile, tgjuPrice } from "@/lib/finance/prices/tgju";
import type { LiveSymbol } from "@/lib/finance/prices/match";
import type { AssetType } from "@/lib/finance/types";

export type MarketQuote = {
  symbol: LiveSymbol;
  assetType: AssetType;
  price: number;
  source: string;
  fetchedAt: string;
};

const dollarPage = "https://www.tgju.org/profile/price_dollar_rl";
const goldPage = "https://www.tgju.org/profile/geram18";
const bitcoinPage = "https://www.tgju.org/profile/crypto-bitcoin-irr";

function quote(symbol: LiveSymbol, assetType: AssetType, price: number, source: string): MarketQuote {
  return { symbol, assetType, price, source, fetchedAt: new Date().toISOString() };
}

export async function fetchUsdQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "tgju-json:price_dollar_rl", run: () => tgjuPrice("price_dollar_rl") },
    { name: "tgju-page:price_dollar_rl", run: () => scrapeTgjuProfile(dollarPage) },
  ]);
  return result ? quote("USD", "cash", result.price, result.source) : null;
}

export async function fetchGoldQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "tgju-json:geram18", run: () => tgjuPrice("geram18") },
    { name: "tgju-page:geram18", run: () => scrapeTgjuProfile(goldPage) },
  ]);
  return result ? quote("GOLD18", "gold", result.price, result.source) : null;
}

export async function fetchBtcQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "binance:BTCUSDT", run: binanceBtcInRial },
    { name: "tgju-json:crypto-bitcoin-irr", run: () => tgjuPrice("crypto-bitcoin-irr") },
    { name: "tgju-page:crypto-bitcoin-irr", run: () => scrapeTgjuProfile(bitcoinPage) },
  ]);
  return result ? quote("BTC", "crypto", result.price, result.source) : null;
}

async function binanceBtcInRial(): Promise<number> {
  const [tickerText, usdIrr] = await Promise.all([
    fetchText("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", 4_000),
    tgjuPrice("price_dollar_rl"),
  ]);
  const ticker = JSON.parse(tickerText) as { price?: string };
  const btcUsd = Number(ticker.price);
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("binance price missing");
  return btcUsd * usdIrr;
}

export async function fetchMarketQuotes(): Promise<MarketQuote[]> {
  const quotes = await Promise.all([fetchUsdQuote(), fetchGoldQuote(), fetchBtcQuote()]);
  return quotes.filter((item): item is MarketQuote => item != null);
}
