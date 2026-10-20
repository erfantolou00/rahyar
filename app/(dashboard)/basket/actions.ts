"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAllocationClass, suggestAllocationClass } from "@/lib/finance/allocation-class";
import {
  isAssetType,
  parseOptionalNumber,
  parseRequiredNumber,
  parseSymbol,
  readString,
} from "@/lib/finance/parse";
import { isPriceUnit } from "@/lib/finance/prices/unit";
import { toNumber } from "@/lib/finance/format";
import { parseIsoDate } from "@/lib/finance/jalali";
import { findListedMatch, isListedHolding, type ListedRow } from "@/lib/finance/merge-holding";
import { canSell } from "@/lib/finance/trades";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save" | "unit" | "oversell" | "open"): never {
  redirect(`/basket?error=${code}`);
}

function readAsset(formData: FormData) {
  const type = readString(formData, "type");
  const symbol = parseSymbol(readString(formData, "symbol"));
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const priceUnit = readString(formData, "price_unit");
  const avgBuyPrice = parseOptionalNumber(readString(formData, "avg_buy_price"), { min: 0 });
  const manualValue = parseOptionalNumber(readString(formData, "manual_value"), { min: 0 });
  const manualClass = readString(formData, "allocation_class_source") === "manual";
  const chosenClass = readString(formData, "allocation_class");

  if (
    !isAssetType(type) ||
    !isPriceUnit(priceUnit) ||
    !symbol ||
    quantity == null ||
    avgBuyPrice === undefined ||
    manualValue === undefined
  ) {
    return null;
  }

  const allocationClass = manualClass
    ? isAllocationClass(chosenClass)
      ? chosenClass
      : null
    : suggestAllocationClass(type, symbol);
  if (allocationClass == null) return null;

  return {
    type,
    symbol,
    quantity,
    price_unit: priceUnit,
    avg_buy_price: avgBuyPrice,
    manual_value: manualValue,
    allocation_class: allocationClass,
    allocation_class_source: manualClass ? "manual" as const : "auto" as const,
  };
}

function refresh() {
  revalidatePath("/basket");
  revalidatePath("/");
  revalidatePath("/api/basket");
}

function readFee(formData: FormData): number | null {
  const fee = parseOptionalNumber(readString(formData, "fee"), { min: 0 });
  if (fee === undefined) return null;
  return fee ?? 0;
}

function tradeFailed(error: { message?: string }): "oversell" | "save" {
  return /oversell/i.test(error.message ?? "") ? "oversell" : "save";
}

export async function createAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const asset = readAsset(formData);
  const acquiredOn = parseIsoDate(readString(formData, "acquired_on"));
  if (!asset || !acquiredOn) fail("invalid");

  const fee = readFee(formData);
  if (fee == null) fail("invalid");

  if (isListedHolding(asset.type)) {
    if (!(asset.quantity > 0) || asset.avg_buy_price == null) fail("invalid");
    const rows = await supabase
      .from("assets")
      .select("id,symbol,quantity,avg_buy_price,price_unit,acquired_on,created_at")
      .eq("type", asset.type)
      .order("created_at", { ascending: true });
    if (rows.error) {
      console.error(rows.error);
      fail("save");
    }
    const existing = findListedMatch((rows.data ?? []) as ListedRow[], asset.symbol);
    let assetId = existing?.id ?? null;
    if (existing && existing.price_unit !== asset.price_unit) fail("unit");
    if (!assetId) {
      const inserted = await supabase
        .from("assets")
        .insert({ ...asset, quantity: 0, avg_buy_price: null, acquired_on: null })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) {
        console.error(inserted.error);
        fail("save");
      }
      assetId = inserted.data.id;
    }
    const bought = await supabase.from("trades").insert({
      asset_id: assetId,
      asset_type: asset.type,
      symbol: asset.symbol,
      side: "buy",
      quantity: asset.quantity,
      price: asset.avg_buy_price,
      fee,
      price_unit: asset.price_unit,
      traded_on: acquiredOn,
    });
    if (bought.error) {
      console.error(bought.error);
      if (!existing) await supabase.from("assets").delete().eq("id", assetId);
      fail(tradeFailed(bought.error));
    }
    refresh();
    redirect("/basket");
  }

  const { error } = await supabase.from("assets").insert({ ...asset, acquired_on: acquiredOn });
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}

export async function updateAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  if (!id) fail("invalid");
  const current = await supabase.from("assets").select("id,type,symbol").eq("id", id).maybeSingle();
  if (current.error || !current.data) {
    console.error(current.error);
    fail("save");
  }

  if (isListedHolding(current.data.type)) {
    const symbol = parseSymbol(readString(formData, "symbol"));
    const manualValue = parseOptionalNumber(readString(formData, "manual_value"), { min: 0 });
    const manualClass = readString(formData, "allocation_class_source") === "manual";
    const chosenClass = readString(formData, "allocation_class");
    const allocationClass = manualClass
      ? isAllocationClass(chosenClass)
        ? chosenClass
        : null
      : suggestAllocationClass(current.data.type, symbol ?? current.data.symbol);
    if (!symbol || manualValue === undefined || allocationClass == null) fail("invalid");
    const { error } = await supabase
      .from("assets")
      .update({
        symbol,
        manual_value: manualValue,
        allocation_class: allocationClass,
        allocation_class_source: manualClass ? "manual" : "auto",
      })
      .eq("id", id);
    if (error) {
      console.error(error);
      fail("save");
    }
    if (symbol !== current.data.symbol) {
      const renamed = await supabase.from("trades").update({ symbol }).eq("asset_id", id);
      if (renamed.error) console.error(renamed.error);
    }
    refresh();
    redirect("/basket");
  }

  const asset = readAsset(formData);
  if (!asset) fail("invalid");

  const { error } = await supabase.from("assets").update(asset).eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}

export async function sellHolding(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const price = parseRequiredNumber(readString(formData, "price"), { min: 0 });
  const fee = readFee(formData);
  const tradedOn = parseIsoDate(readString(formData, "traded_on"));
  if (!id || quantity == null || !(quantity > 0) || price == null || fee == null || !tradedOn) fail("invalid");

  const asset = await supabase
    .from("assets")
    .select("id,type,symbol,quantity,price_unit")
    .eq("id", id)
    .maybeSingle();
  if (asset.error || !asset.data || !isListedHolding(asset.data.type)) {
    console.error(asset.error);
    fail(asset.data ? "invalid" : "save");
  }
  if (!canSell(toNumber(asset.data.quantity), quantity)) fail("oversell");

  const { error } = await supabase.from("trades").insert({
    asset_id: asset.data.id,
    asset_type: asset.data.type,
    symbol: asset.data.symbol,
    side: "sell",
    quantity,
    price,
    fee,
    price_unit: asset.data.price_unit,
    traded_on: tradedOn,
  });
  if (error) {
    console.error(error);
    fail(tradeFailed(error));
  }

  refresh();
  redirect("/basket");
}

export async function deleteAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  if (!id) fail("invalid");

  const current = await supabase.from("assets").select("id,type,quantity").eq("id", id).maybeSingle();
  if (current.error || !current.data) {
    console.error(current.error);
    fail("save");
  }
  if (isListedHolding(current.data.type) && toNumber(current.data.quantity) > 0) fail("open");

  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}
