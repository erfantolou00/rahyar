"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAssetType, parseRequiredNumber, parseSymbol, readString } from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

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
