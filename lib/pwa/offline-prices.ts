import { btcInUsdt } from "@/lib/finance/prices/btc";
import { formatDollar, formatNumber, formatTimestamp, toNumber } from "@/lib/finance/format";
import { assetTypeLabels } from "@/lib/finance/labels";
import type { AssetType, Numeric } from "@/lib/finance/types";

/** Read by public/offline.html. Keep the two copies of this key in sync. */
export const OFFLINE_PRICES_KEY = "rahyar-prices";

export type OfflinePrice = {
  symbol: string;
  typeLabel: string;
  priceLabel: string;
  timeLabel: string;
};

export type OfflinePriceCache = {
  savedAt: string;
  rows: OfflinePrice[];
};

export type OfflinePriceSource = {
  asset_type: AssetType;
  symbol: string;
  price: Numeric;
  timestamp: string;
};

export function latestOfflinePrices(prices: OfflinePriceSource[]): OfflinePrice[] {
  const usd = prices.find((row) => row.symbol === "USD");
  const usdRial = usd ? toNumber(usd.price) : null;
  const seen = new Set<string>();
  const rows: OfflinePrice[] = [];

  for (const row of prices) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    const raw = toNumber(row.price);
    const shown = row.symbol === "BTC" ? btcInUsdt(raw, usdRial) : raw;
    rows.push({
      symbol: row.symbol,
      typeLabel: assetTypeLabels[row.asset_type],
      priceLabel: row.symbol === "BTC" && shown != null ? formatDollar(shown) : formatNumber(shown ?? raw),
      timeLabel: formatTimestamp(row.timestamp),
    });
  }

  return rows;
}
