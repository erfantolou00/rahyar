"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isTransactionType,
  parseDay,
  parseNote,
  parseRequiredNumber,
  readString,
} from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save"): never {
  redirect(`/transactions?error=${code}`);
}

export async function createTransaction(formData: FormData) {
  const { supabase } = await requireSession();
  const assetId = readString(formData, "asset_id");
  const type = readString(formData, "type");
  const qty = parseRequiredNumber(readString(formData, "qty"), { min: 0, exclusiveMin: true });
  const price = parseRequiredNumber(readString(formData, "price"), { min: 0 });
  const date = parseDay(readString(formData, "date"));
  const note = parseNote(readString(formData, "note"));

  if (!assetId || !isTransactionType(type) || qty == null || price == null || !date || note === undefined) {
    fail("invalid");
  }

  const { error } = await supabase.from("transactions").insert({
    asset_id: assetId,
    type,
    qty,
    price,
    date,
    note,
  });

  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  redirect("/transactions");
}
