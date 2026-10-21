"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAllocationClass, suggestAllocationClass } from "@/lib/finance/allocation-class";
import { isCashAsset, isLedgerAsset } from "@/lib/finance/ledger";
import { accountKinds, type AccountKind } from "@/lib/finance/types";
import {
  isAssetType,
  parseOptionalNumber,
  parseRequiredNumber,
  parseSymbol,
  readString,
} from "@/lib/finance/parse";
import { isPriceUnit, type PriceUnit } from "@/lib/finance/prices/unit";
import { toNumber } from "@/lib/finance/format";
import { parseIsoDate } from "@/lib/finance/jalali";
import { findListedMatch, type ListedRow } from "@/lib/finance/merge-holding";
import { requireSession } from "@/lib/supabase/auth";

type BasketError =
  | "invalid"
  | "save"
  | "unit"
  | "oversell"
  | "open"
  | "cash"
  | "currency"
  | "ledger"
  | "history"
  | "account";

function fail(code: BasketError): never {
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
    price_unit: priceUnit as PriceUnit,
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

function readAccountId(formData: FormData): string | null {
  const accountId = readString(formData, "account_id");
  return accountId || null;
}

function readIdempotency(formData: FormData): string | undefined {
  const key = readString(formData, "idempotency_key").trim();
  if (!key || key.length > 80) return undefined;
  return key;
}

function postedError(error: { message?: string }): BasketError {
  const message = error.message ?? "";
  if (/oversell/i.test(message)) return "oversell";
  if (/\bcash\b/i.test(message)) return "cash";
  if (/currency/i.test(message)) return "currency";
  if (/ledger/i.test(message)) return "ledger";
  if (/account/i.test(message)) return "account";
  if (/invalid/i.test(message)) return "invalid";
  return "save";
}

function isAccountKind(value: string): value is AccountKind {
  return (accountKinds as readonly string[]).includes(value);
}

export async function createAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const asset = readAsset(formData);
  const acquiredOn = parseIsoDate(readString(formData, "acquired_on"));
  if (!asset || !acquiredOn) fail("invalid");

  const fee = readFee(formData);
  if (fee == null) fail("invalid");
  if (!isLedgerAsset(asset.type)) {
    const { error } = await supabase.from("assets").insert({ ...asset, acquired_on: acquiredOn });
    if (error) {
      console.error(error);
      fail("save");
    }
    refresh();
    redirect("/basket");
  }

  if (!(asset.quantity > 0)) fail("invalid");
  const settle = readString(formData, "settle") === "yes";
  if (settle && asset.avg_buy_price == null) fail("invalid");

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
  if (existing && existing.price_unit !== asset.price_unit) fail("unit");
  let assetId = existing?.id ?? null;
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

  const opening = !existing && !settle && !isCashAsset(asset.type);
  const posted = await supabase.rpc("post_transaction", {
    p_asset_id: assetId,
    p_account_id: readAccountId(formData) ?? undefined,
    p_type: isCashAsset(asset.type) ? "deposit" : "buy",
    p_qty: asset.quantity,
    p_price: isCashAsset(asset.type) ? 0 : asset.avg_buy_price,
    p_fee: isCashAsset(asset.type) ? 0 : fee,
    p_traded_on: acquiredOn,
    p_settles_cash: isCashAsset(asset.type) ? false : settle,
    p_origin: opening ? "opening" : "manual",
    p_idempotency_key: readIdempotency(formData),
  });
  if (posted.error) {
    console.error(posted.error);
    if (!existing) await supabase.from("assets").delete().eq("id", assetId);
    fail(postedError(posted.error));
  }
  const postedAssetId = posted.data && "asset_id" in posted.data ? posted.data.asset_id : null;
  if (!existing && postedAssetId && postedAssetId !== assetId) {
    await supabase.from("assets").delete().eq("id", assetId);
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

  if (isLedgerAsset(current.data.type)) {
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

  const asset = await supabase.from("assets").select("id,type").eq("id", id).maybeSingle();
  if (asset.error || !asset.data || !isLedgerAsset(asset.data.type) || isCashAsset(asset.data.type)) {
    console.error(asset.error);
    fail(asset.data ? "invalid" : "save");
  }

  const posted = await supabase.rpc("post_transaction", {
    p_asset_id: asset.data.id,
    p_account_id: readAccountId(formData) ?? undefined,
    p_type: "sell",
    p_qty: quantity,
    p_price: price,
    p_fee: fee,
    p_traded_on: tradedOn,
    p_settles_cash: true,
    p_origin: "manual",
    p_idempotency_key: readIdempotency(formData),
  });
  if (posted.error) {
    console.error(posted.error);
    fail(postedError(posted.error));
  }

  refresh();
  redirect("/basket");
}

export async function moveCash(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  const direction = readString(formData, "direction");
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const tradedOn = parseIsoDate(readString(formData, "traded_on"));
  if (!id || (direction !== "deposit" && direction !== "withdraw") || quantity == null || !(quantity > 0) || !tradedOn) {
    fail("invalid");
  }

  const asset = await supabase.from("assets").select("id,type").eq("id", id).maybeSingle();
  if (asset.error || !asset.data || !isCashAsset(asset.data.type)) {
    console.error(asset.error);
    fail(asset.data ? "invalid" : "save");
  }

  const posted = await supabase.rpc("post_transaction", {
    p_asset_id: asset.data.id,
    p_account_id: readAccountId(formData) ?? undefined,
    p_type: direction,
    p_qty: quantity,
    p_price: 0,
    p_fee: 0,
    p_traded_on: tradedOn,
    p_settles_cash: false,
    p_origin: "manual",
    p_idempotency_key: readIdempotency(formData),
  });
  if (posted.error) {
    console.error(posted.error);
    fail(postedError(posted.error));
  }

  refresh();
  redirect("/basket");
}

export async function transferHolding(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  const counterAccountId = readString(formData, "counter_account_id");
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const tradedOn = parseIsoDate(readString(formData, "traded_on"));
  if (!id || !counterAccountId || quantity == null || !(quantity > 0) || !tradedOn) fail("invalid");

  const asset = await supabase.from("assets").select("id,type").eq("id", id).maybeSingle();
  if (asset.error || !asset.data || !isLedgerAsset(asset.data.type)) {
    console.error(asset.error);
    fail(asset.data ? "invalid" : "save");
  }

  const posted = await supabase.rpc("post_transaction", {
    p_asset_id: asset.data.id,
    p_account_id: readAccountId(formData) ?? undefined,
    p_counter_account_id: counterAccountId,
    p_type: "transfer",
    p_qty: quantity,
    p_price: 0,
    p_fee: 0,
    p_traded_on: tradedOn,
    p_settles_cash: false,
    p_origin: "manual",
    p_idempotency_key: readIdempotency(formData),
  });
  if (posted.error) {
    console.error(posted.error);
    fail(postedError(posted.error));
  }

  refresh();
  redirect("/basket");
}

export async function createAccount(formData: FormData) {
  const { supabase } = await requireSession();
  const name = readString(formData, "name").trim();
  const kind = readString(formData, "kind");
  const currency = readString(formData, "currency");
  if (!name || name.length > 80 || !isAccountKind(kind) || !isPriceUnit(currency)) fail("invalid");

  const { error } = await supabase.from("accounts").insert({ name, kind, currency });
  if (error) {
    console.error(error);
    fail("save");
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
  if (isLedgerAsset(current.data.type) && toNumber(current.data.quantity) > 0) fail("open");

  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) {
    console.error(error);
    fail(error.code === "23503" ? "history" : "save");
  }

  refresh();
  redirect("/basket");
}
