"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAllocationClass, suggestAllocationClass } from "@/lib/finance/allocation-class";
import { isCashAsset, isLedgerAsset, type HoldingMove } from "@/lib/finance/holding-move";
import {
  isAssetType,
  parseDay,
  parseNote,
  parseOptionalNumber,
  parseRequiredNumber,
  parseSymbol,
  readString,
} from "@/lib/finance/parse";
import { isPriceUnit } from "@/lib/finance/prices/unit";
import { tradeErrorCode, type TradeErrorCode } from "@/lib/finance/trade-error";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: TradeErrorCode): never {
  redirect(`/basket?error=${code}`);
}

function readAsset(formData: FormData) {
  const type = readString(formData, "type");
  const symbol = parseSymbol(readString(formData, "symbol"));
  const priceUnit = readString(formData, "price_unit");
  const manualValue = parseOptionalNumber(readString(formData, "manual_value"), { min: 0 });
  const manualClass = readString(formData, "allocation_class_source") === "manual";
  const chosenClass = readString(formData, "allocation_class");
  const ledger = isAssetType(type) && isLedgerAsset(type);
  const quantity = ledger ? 0 : parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const avgBuyPrice = ledger ? null : parseOptionalNumber(readString(formData, "avg_buy_price"), { min: 0 });

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

export async function createAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const asset = readAsset(formData);
  if (!asset) fail("invalid");

  const { error } = await supabase.from("assets").insert(asset);
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
  const asset = readAsset(formData);
  if (!id || !asset) fail("invalid");

  const { error } = await supabase
    .from("assets")
    .update(
      isLedgerAsset(asset.type)
        ? {
            symbol: asset.symbol,
            manual_value: asset.manual_value,
            allocation_class: asset.allocation_class,
            allocation_class_source: asset.allocation_class_source,
          }
        : asset,
    )
    .eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}

function isMove(value: string): value is HoldingMove {
  return value === "add" || value === "remove" || value === "average";
}

export async function moveHolding(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  const move = readString(formData, "move");
  const amount = parseRequiredNumber(readString(formData, "amount"), { min: 0, exclusiveMin: true });
  const price = parseRequiredNumber(readString(formData, "price"), { min: 0 });
  const date = parseDay(readString(formData, "date"));
  const note = parseNote(readString(formData, "note"));
  const settle = readString(formData, "settle_cash") === "1";

  if (!id || !isMove(move) || !date || note === undefined) fail("invalid");

  const asset = await supabase.from("assets").select("type").eq("id", id).maybeSingle();
  if (asset.error || !asset.data || !isLedgerAsset(asset.data.type)) fail("invalid");
  const cash = isCashAsset(asset.data.type);

  if (move === "average") {
    if (cash || price == null) fail("invalid");
    const { error } = await supabase.rpc("adjust_average", {
      p_asset_id: id,
      p_price: price,
      p_traded_on: date,
      p_note: note,
    });
    if (error) {
      console.error(error);
      fail(tradeErrorCode(error));
    }
  } else {
    if (amount == null || (!cash && price == null)) fail("invalid");
    const type = cash ? (move === "add" ? "deposit" : "withdraw") : move === "add" ? "buy" : "sell";
    const { error } = await supabase.rpc("post_transaction", {
      p_asset_id: id,
      p_type: type,
      p_qty: amount,
      p_traded_on: date,
      p_note: note,
      p_price: cash || price == null ? undefined : price,
      p_settles_cash: !cash && settle,
    });
    if (error) {
      console.error(error);
      fail(tradeErrorCode(error));
    }
  }

  refresh();
  revalidatePath("/transactions");
  redirect("/basket");
}

export async function deleteAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  if (!id) fail("invalid");

  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}
