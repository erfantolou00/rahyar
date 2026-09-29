import { normalizeSymbol } from "@/lib/finance/prices/match";
import { assetTypes, type AssetType } from "@/lib/finance/types";

/**
 * One economic bucket per holding, used for allocation bands.
 * Instrument type stays separate: a coin and a gold fund can both sit in "gold"
 * without being counted twice.
 */

export const allocationClassSources = ["auto", "manual"] as const;
export type AllocationClassSource = (typeof allocationClassSources)[number];

export const allocationClasses = [
  "gold",
  "stock",
  "fund",
  "usd",
  "crypto",
  "cash",
  "loan",
  "real_estate",
] as const;

export type AllocationClass = (typeof allocationClasses)[number];

const goldNames = new Set([
  "طلا",
  "طلا18",
  "طلای18",
  "gold",
  "geram",
  "xau",
  "سکه",
  "امامی",
  "بهار",
  "بهارازادی",
  "نیمسکه",
  "ربعسکه",
  "سکهگرمی",
  "گرمی",
  "عیار",
  "مثقال",
  "کهربا",
  "گوهر",
  "ناب",
  "گنج",
  "آلتون",
  "امرالد",
  "تابش",
  "نفیس",
  "زرفام",
  "جواهر",
]);

export function isAllocationClass(value: string | null | undefined): value is AllocationClass {
  return (allocationClasses as readonly string[]).includes(value ?? "");
}

export function isAllocationClassSource(value: string | null | undefined): value is AllocationClassSource {
  return (allocationClassSources as readonly string[]).includes(value ?? "");
}

export function suggestAllocationClass(type: AssetType, symbol: string): AllocationClass {
  if (looksLikeGold(symbol) || type === "gold" || type === "coin") return "gold";
  if (isAllocationClass(type)) return type;
  return "stock";
}

export function effectiveAllocationClass(asset: {
  type: AssetType;
  symbol: string;
  allocation_class?: string | null;
  allocation_class_source?: string | null;
}): AssetType {
  if (asset.allocation_class_source === "manual" && isAssetTypeValue(asset.allocation_class) && asset.allocation_class !== "coin") {
    return asset.allocation_class;
  }
  return suggestAllocationClass(asset.type, asset.symbol);
}

function looksLikeGold(symbol: string): boolean {
  const name = normalizeSymbol(symbol);
  if (!name) return false;
  if (name.includes("طلا") || name.includes("سکه") || name.includes("gold")) return true;
  return goldNames.has(name);
}

function isAssetTypeValue(value: string | null | undefined): value is AssetType {
  return (assetTypes as readonly string[]).includes(value ?? "");
}
