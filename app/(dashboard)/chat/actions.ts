"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readString } from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

export async function saveChatMessage(formData: FormData) {
  const { supabase } = await requireSession();
  const message = readString(formData, "message");
  if (!message || message.length > 4000) redirect("/chat?error=invalid");

  const { error } = await supabase.from("chat_logs").insert({
    role: "user",
    message,
    context: { surface: "dashboard" },
  });

  if (error) {
    console.error(error);
    redirect("/chat?error=save");
  }

  revalidatePath("/chat");
  redirect("/chat");
}
