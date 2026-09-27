"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAssetType,
  parseOptionalNumber,
  parseRequiredNumber,
  parseRiskLevel,
  parseSymbol,
  readString,
} from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save"): never {
  redirect(`/assets?error=${code}`);
}

export async function createAsset(formData: FormData) {
  const { supabase } = await requireSession();
  const type = readString(formData, "type");
  const symbol = parseSymbol(readString(formData, "symbol"));
  const quantity = parseRequiredNumber(readString(formData, "quantity"), { min: 0 });
  const avgBuyPrice = parseOptionalNumber(readString(formData, "avg_buy_price"), { min: 0 });
  const targetMin = parseOptionalNumber(readString(formData, "target_min_weight"), {
    min: 0,
    max: 100,
  });
  const targetMax = parseOptionalNumber(readString(formData, "target_max_weight"), {
    min: 0,
    max: 100,
  });
  const riskLevel = parseRiskLevel(readString(formData, "risk_level"));

  if (
    !isAssetType(type) ||
    !symbol ||
    quantity == null ||
    avgBuyPrice === undefined ||
    targetMin === undefined ||
    targetMax === undefined ||
    riskLevel === undefined ||
    (targetMin != null && targetMax != null && targetMin > targetMax)
  ) {
    fail("invalid");
  }

  const { error } = await supabase.from("assets").insert({
    type,
    symbol,
    quantity,
    avg_buy_price: avgBuyPrice,
    target_min_weight: targetMin,
    target_max_weight: targetMax,
    risk_level: riskLevel,
  });

  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/assets");
  revalidatePath("/");
  redirect("/assets");
}
