"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAssetType, parseRequiredNumber, readString } from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save"): never {
  redirect(`/allocations?error=${code}`);
}

export async function replaceAllocation(formData: FormData) {
  const { supabase } = await requireSession();
  const assetType = readString(formData, "asset_type");
  const minPercent = parseRequiredNumber(readString(formData, "min_percent"), { min: 0, max: 100 });
  const maxPercent = parseRequiredNumber(readString(formData, "max_percent"), { min: 0, max: 100 });
  const formulaVersion = readString(formData, "formula_version");

  if (
    !isAssetType(assetType) ||
    minPercent == null ||
    maxPercent == null ||
    minPercent > maxPercent ||
    formulaVersion.length < 1 ||
    formulaVersion.length > 40
  ) {
    fail("invalid");
  }

  const { error } = await supabase.rpc("replace_allocation", {
    p_asset_type: assetType,
    p_min_percent: minPercent,
    p_max_percent: maxPercent,
    p_formula_version: formulaVersion,
  });

  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/allocations");
  revalidatePath("/");
  redirect("/allocations");
}
