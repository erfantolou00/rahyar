"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAssetType,
  parseOptionalNumber,
  parseRequiredNumber,
  parseSymbol,
  readString,
} from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save"): never {
  redirect(`/basket?error=${code}`);
}

function readAsset(formData: FormData) {
  const type = readString(formData, "type");
  const symbol = parseSymbol(readString(formData, "symbol"));
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const avgBuyPrice = parseOptionalNumber(readString(formData, "avg_buy_price"), { min: 0 });
  const manualValue = parseOptionalNumber(readString(formData, "manual_value"), { min: 0 });

  if (
    !isAssetType(type) ||
    !symbol ||
    quantity == null ||
    avgBuyPrice === undefined ||
    manualValue === undefined
  ) {
    return null;
  }

  return {
    type,
    symbol,
    quantity,
    avg_buy_price: avgBuyPrice,
    manual_value: manualValue,
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

  const { error } = await supabase.from("assets").update(asset).eq("id", id);
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

  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  refresh();
  redirect("/basket");
}
