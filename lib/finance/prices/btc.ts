/** A bitcoin quote above this is treated as rial, not tether. */
export const btcUsdtCeiling = 10_000_000;

export function isBtcQuotedInRial(price: number): boolean {
  return price > btcUsdtCeiling;
}

export function btcInUsdt(btcQuote: number, usdRial: number | null): number | null {
  if (!(btcQuote > 0)) return null;
  if (!isBtcQuotedInRial(btcQuote)) return btcQuote;
  if (usdRial == null || !(usdRial > 0)) return null;
  return btcQuote / usdRial;
}

export function btcInRial(btcQuote: number, usdRial: number | null): number | null {
  if (!(btcQuote > 0)) return null;
  if (isBtcQuotedInRial(btcQuote)) return btcQuote;
  if (usdRial == null || !(usdRial > 0)) return null;
  return btcQuote * usdRial;
}
