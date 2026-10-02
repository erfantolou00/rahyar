import { btcInUsdt } from "@/lib/finance/prices/btc";
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
const TROY_OUNCE_GRAMS = 31.1034768;
const GOLD_18K_SHARE = 18 / 24;

function quote(symbol: LiveSymbol, assetType: AssetType, price: number, source: string): MarketQuote {
  return { symbol, assetType, price, source, fetchedAt: new Date().toISOString() };
}

export async function fetchUsdQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "tgju-json:price_dollar_rl", run: () => tgjuPrice("price_dollar_rl") },
    { name: "tgju-page:price_dollar_rl", run: () => scrapeTgjuProfile(dollarPage) },
    { name: "nobitex:usdt-rls", run: nobitexUsdtRial },
  ]);
  return result ? quote("USD", "usd", result.price, result.source) : null;
}

export async function fetchGoldQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "tgju-json:geram18", run: () => tgjuPrice("geram18") },
    { name: "tgju-page:geram18", run: () => scrapeTgjuProfile(goldPage) },
    { name: "gold-api:XAU*nobitex:usdt-rls", run: gold18RialFromSpot },
  ]);
  return result ? quote("GOLD18", "gold", result.price, result.source) : null;
}

export async function fetchBtcQuote(): Promise<MarketQuote | null> {
  const result = await fetchWithFallback([
    { name: "nobitex:btc-usdt", run: nobitexBtcUsdt },
    { name: "binance:BTCUSDT", run: binanceBtcUsdt },
    { name: "coingecko:bitcoin-usd", run: coingeckoBtcUsd },
    { name: "tgju-json:crypto-bitcoin-irr/usd", run: tgjuJsonBtcUsdt },
    { name: "tgju-page:crypto-bitcoin-irr/usd", run: tgjuPageBtcUsdt },
  ]);
  return result ? quote("BTC", "crypto", result.price, result.source) : null;
}

async function nobitexUsdtRial(): Promise<number> {
  const text = await fetchText(
    "https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls",
    4_000,
  );
  const body = JSON.parse(text) as { stats?: { "usdt-rls"?: { latest?: string } } };
  const price = Number(body.stats?.["usdt-rls"]?.latest);
  if (!Number.isFinite(price) || price <= 0) throw new Error("nobitex usdt-rls missing");
  return price;
}

/** 18k gram in rials: global ounce converted with the Nobitex tether rate, not tgju. */
async function gold18RialFromSpot(): Promise<number> {
  const [ounceUsd, rialPerUsdt] = await Promise.all([goldApiOunceUsd(), nobitexUsdtRial()]);
  return (ounceUsd / TROY_OUNCE_GRAMS) * GOLD_18K_SHARE * rialPerUsdt;
}

async function goldApiOunceUsd(): Promise<number> {
  const text = await fetchText("https://api.gold-api.com/price/XAU", 4_000);
  const body = JSON.parse(text) as { price?: number };
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("gold-api ounce missing");
  return price;
}

async function nobitexBtcUsdt(): Promise<number> {
  const text = await fetchText(
    "https://apiv2.nobitex.ir/market/stats?srcCurrency=btc&dstCurrency=usdt",
    4_000,
  );
  const body = JSON.parse(text) as { stats?: { "btc-usdt"?: { latest?: string } } };
  const price = Number(body.stats?.["btc-usdt"]?.latest);
  if (!Number.isFinite(price) || price <= 0) throw new Error("nobitex price missing");
  return price;
}

async function binanceBtcUsdt(): Promise<number> {
  const tickerText = await fetchText("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", 4_000);
  const ticker = JSON.parse(tickerText) as { price?: string };
  const btcUsd = Number(ticker.price);
  if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("binance price missing");
  return btcUsd;
}

async function coingeckoBtcUsd(): Promise<number> {
  const text = await fetchText(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    4_000,
  );
  const body = JSON.parse(text) as { bitcoin?: { usd?: number } };
  const price = Number(body.bitcoin?.usd);
  if (!Number.isFinite(price) || price <= 0) throw new Error("coingecko price missing");
  return price;
}

async function tgjuJsonBtcUsdt(): Promise<number> {
  const [btcRial, usdRial] = await Promise.all([
    tgjuPrice("crypto-bitcoin-irr"),
    tgjuPrice("price_dollar_rl"),
  ]);
  return requireBtcUsdt(btcRial, usdRial);
}

async function tgjuPageBtcUsdt(): Promise<number> {
  const [btcRial, usdRial] = await Promise.all([
    scrapeTgjuProfile(bitcoinPage),
    tgjuPrice("price_dollar_rl"),
  ]);
  return requireBtcUsdt(btcRial, usdRial);
}

function requireBtcUsdt(btcRial: number, usdRial: number): number {
  const usdt = btcInUsdt(btcRial, usdRial);
  if (usdt == null) throw new Error("bitcoin dollar conversion failed");
  return usdt;
}

export async function fetchMarketQuotes(): Promise<MarketQuote[]> {
  const quotes = await Promise.all([fetchUsdQuote(), fetchGoldQuote(), fetchBtcQuote()]);
  return quotes.filter((item): item is MarketQuote => item != null);
}
