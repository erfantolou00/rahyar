"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addPriceFeed, removePriceFeed, savePriceFeedFlags, type FeedMutation } from "@/lib/finance/prices/feed-store";
import { isAssetType, parseRequiredNumber, parseSymbol, readString } from "@/lib/finance/parse";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";
import { requireSession } from "@/lib/supabase/auth";

const returnPages = new Set(["/", "/basket", "/prices"]);

function returnTo(formData: FormData): string {
  const value = readString(formData, "return_to");
  return returnPages.has(value) ? value : "/prices";
}

function revalidatePrices() {
  revalidatePath("/prices");
  revalidatePath("/basket");
  revalidatePath("/");
}

export async function refreshLivePrices(formData: FormData) {
  const { supabase, userId } = await requireSession();
  const target = returnTo(formData);
  const report = await refreshAllPrices(supabase, userId);
  revalidatePrices();
  redirect(report.stored.length === 0 ? `${target}?error=prices` : target);
}

export async function setPriceFeedFlag(input: {
  assetType: string;
  symbol: string;
  priceEnabled: boolean;
  codalEnabled: boolean;
}): Promise<FeedMutation> {
  const { supabase, userId } = await requireSession();
  if (
    !isAssetType(input.assetType) ||
    typeof input.symbol !== "string" ||
    typeof input.priceEnabled !== "boolean" ||
    typeof input.codalEnabled !== "boolean"
  ) {
    return { ok: false, error: "invalid" };
  }
  const result = await savePriceFeedFlags(supabase, userId, {
    assetType: input.assetType,
    symbol: input.symbol,
    priceEnabled: input.priceEnabled,
    codalEnabled: input.codalEnabled,
  });
  if (result.ok) revalidatePrices();
  return result;
}

export async function createPriceFeed(input: { assetType: string; symbol: string }): Promise<FeedMutation> {
  const { supabase, userId } = await requireSession();
  if (!isAssetType(input.assetType) || typeof input.symbol !== "string") {
    return { ok: false, error: "invalid" };
  }
  const result = await addPriceFeed(supabase, userId, { assetType: input.assetType, symbol: input.symbol });
  if (result.ok) revalidatePrices();
  return result;
}

export async function deletePriceFeed(input: { assetType: string; symbol: string }): Promise<FeedMutation> {
  const { supabase, userId } = await requireSession();
  const assetType = input.assetType;
  if (!isAssetType(assetType) || typeof input.symbol !== "string") {
    return { ok: false, error: "invalid" };
  }
  const result = await removePriceFeed(supabase, userId, { assetType, symbol: input.symbol });
  if (result.ok) revalidatePrices();
  return result;
}

function fail(code: "invalid" | "save"): never {
  redirect(`/prices?error=${code}`);
}

export async function createPrice(formData: FormData) {
  const { supabase } = await requireSession();
  const assetType = readString(formData, "asset_type");
  const symbol = parseSymbol(readString(formData, "symbol"));
  const price = parseRequiredNumber(readString(formData, "price"), { min: 0 });
  const source = readString(formData, "source") || "manual";

  if (!isAssetType(assetType) || !symbol || price == null || source.length > 80) {
    fail("invalid");
  }

  const { error } = await supabase.from("prices").insert({
    asset_type: assetType,
    symbol,
    price,
    source,
  });

  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/prices");
  revalidatePath("/");
  redirect("/prices");
}
