import type { AssetType } from "@/lib/finance/types";
import {
  canonicalFeed,
  isLiveSymbol,
  liveAssetTypes,
  liveSymbolLabels,
  liveSymbols,
  normalizeSymbol,
  type LiveSymbol,
} from "@/lib/finance/prices/match";

export type FeedOrigin = "market" | "holding" | "added";

export type StoredPriceFeed = {
  assetType: AssetType;
  symbol: string;
  priceEnabled: boolean;
  codalEnabled: boolean;
  added: boolean;
};

export type PriceFeed = {
  key: string;
  assetType: AssetType;
  symbol: string;
  label: string;
  origin: FeedOrigin;
  priceEnabled: boolean;
  codalEnabled: boolean;
  codalAvailable: boolean;
  removable: boolean;
};

export type FeedHolding = {
  type: AssetType;
  symbol: string;
};

export const marketFeedCatalog: { symbol: LiveSymbol; assetType: AssetType; label: string }[] = liveSymbols.map(
  (symbol) => ({
    symbol,
    assetType: liveAssetTypes[symbol],
    label: liveSymbolLabels[symbol],
  }),
);

export function codalAvailableFor(type: AssetType): boolean {
  return type === "stock" || type === "fund";
}

export function feedKey(assetType: AssetType, symbol: string): string {
  return `${assetType}:${normalizeSymbol(symbol)}`;
}

function applyOverride(feed: PriceFeed, stored: Map<string, StoredPriceFeed>): PriceFeed {
  const row = stored.get(feed.key);
  if (!row) return feed;
  return {
    ...feed,
    priceEnabled: row.priceEnabled,
    codalEnabled: feed.codalAvailable && row.codalEnabled,
  };
}

export function resolvePriceFeeds(holdings: FeedHolding[], stored: StoredPriceFeed[]): PriceFeed[] {
  const storedByKey = new Map<string, StoredPriceFeed>();
  for (const row of stored) {
    const series = canonicalFeed(row.assetType, row.symbol);
    if (!series) continue;
    storedByKey.set(feedKey(series.assetType, series.symbol), row);
  }

  const seen = new Set<string>();
  const feeds: PriceFeed[] = [];

  for (const market of marketFeedCatalog) {
    const key = feedKey(market.assetType, market.symbol);
    seen.add(key);
    feeds.push(
      applyOverride(
        {
          key,
          assetType: market.assetType,
          symbol: market.symbol,
          label: market.label,
          origin: "market",
          priceEnabled: true,
          codalEnabled: false,
          codalAvailable: false,
          removable: false,
        },
        storedByKey,
      ),
    );
  }

  const holdingSeries = holdings.flatMap((holding) => {
    if (holding.type !== "stock" && holding.type !== "fund") return [];
    const series = canonicalFeed(holding.type, holding.symbol);
    if (!series || isLiveSymbol(series.symbol)) return [];
    return [series];
  });
  holdingSeries.sort((left, right) => left.symbol.localeCompare(right.symbol, "fa"));

  for (const series of holdingSeries) {
    const key = feedKey(series.assetType, series.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    const codalAvailable = codalAvailableFor(series.assetType);
    feeds.push(
      applyOverride(
        {
          key,
          assetType: series.assetType,
          symbol: series.symbol,
          label: series.symbol,
          origin: "holding",
          priceEnabled: true,
          codalEnabled: series.assetType === "stock",
          codalAvailable,
          removable: false,
        },
        storedByKey,
      ),
    );
  }

  const extras: PriceFeed[] = [];
  for (const row of stored) {
    if (!row.added) continue;
    const series = canonicalFeed(row.assetType, row.symbol);
    if (!series) continue;
    const key = feedKey(series.assetType, series.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    const codalAvailable = codalAvailableFor(series.assetType);
    extras.push({
      key,
      assetType: series.assetType,
      symbol: series.symbol,
      label: series.symbol,
      origin: "added",
      priceEnabled: row.priceEnabled,
      codalEnabled: codalAvailable && row.codalEnabled,
      codalAvailable,
      removable: true,
    });
  }
  extras.sort((left, right) => left.symbol.localeCompare(right.symbol, "fa"));
  return [...feeds, ...extras];
}
