"use client";

import { useFormStatus } from "react-dom";
import { refreshLivePrices } from "@/app/(dashboard)/prices/actions";
import { Button } from "@/components/ui/button";

function RefreshSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "در حال به‌روزرسانی..." : "به‌روزرسانی قیمت"}
    </Button>
  );
}

export function RefreshPricesButton({ returnTo }: { returnTo: "/" | "/basket" | "/prices" }) {
  return (
    <form action={refreshLivePrices}>
      <input type="hidden" name="return_to" value={returnTo} />
      <RefreshSubmit />
    </form>
  );
}
