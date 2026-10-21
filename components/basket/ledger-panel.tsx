"use client";

import { createAccount, transferHolding } from "@/app/(dashboard)/basket/actions";
import { AccountSelect, type BasketAccount } from "@/components/basket/account-select";
import { ShamsiDateField } from "@/components/basket/shamsi-date-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/finance/format";
import { todayKey } from "@/lib/finance/holding-growth";
import type { PriceUnit } from "@/lib/finance/prices/unit";
import { useState } from "react";
import { useFormStatus } from "react-dom";

const kindLabels = {
  brokerage: "کارگزاری",
  bullion: "طلا و سکه",
  fx: "ارز",
  wallet: "کیف",
} as const;

export function LedgerPanel({
  ready,
  accounts,
  positions,
  holdings,
}: {
  ready: boolean;
  accounts: BasketAccount[];
  positions: { accountId: string; assetId: string; name: string; quantity: number }[];
  holdings: { id: string; name: string; currency: PriceUnit }[];
}) {
  if (!ready) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          جدول حساب‌ها هنوز روی پایگاه داده نیست. مهاجرت دفتر معاملات را اعمال کنید.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">حساب‌های معاملات</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm leading-6 text-muted-foreground">
          خرید و فروش فقط نقد همان حساب و همان ارز را جابه‌جا می‌کند. انتقال، جمع دارایی را عوض نمی‌کند.
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز حسابی ساخته نشده است. اولین ثبت، حساب پیش‌فرض را می‌سازد.</p>
        ) : (
          <ul className="grid gap-3">
            {accounts.map((account) => {
              const held = positions.filter((position) => position.accountId === account.id);
              return (
                <li key={account.id} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-sm font-medium">
                    {account.name}
                    <span className="mr-2 text-muted-foreground">
                      {kindLabels[account.kind]} · {account.currency === "usd" ? "دلار" : "ریال"}
                    </span>
                  </p>
                  {held.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">مانده‌ای در این حساب نیست.</p>
                  ) : (
                    <ul className="mt-1 grid gap-1">
                      {held.map((position) => (
                        <li key={position.assetId} className="flex justify-between gap-3 text-sm">
                          <span>{position.name}</span>
                          <span className="numeric">{formatNumber(position.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={createAccount} className="grid gap-3">
            <p className="text-sm font-medium">حساب جدید</p>
            <input name="name" required maxLength={80} placeholder="نام حساب" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm" />
            <select name="kind" defaultValue="brokerage" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm">
              {Object.entries(kindLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>{label}</option>
              ))}
            </select>
            <select name="currency" defaultValue="rial" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm">
              <option value="rial">ریال</option>
              <option value="usd">دلار</option>
            </select>
            <SaveButton>ساخت حساب</SaveButton>
          </form>
          <TransferForm accounts={accounts} holdings={holdings} />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          اگر حسابی انتخاب نشود، سهام به کارگزاری، طلا و سکه به میز طلا، دلار به حساب ارز، و رمزارز به کیف می‌رود.
        </p>
      </CardContent>
    </Card>
  );
}

function TransferForm({
  accounts,
  holdings,
}: {
  accounts: BasketAccount[];
  holdings: { id: string; name: string; currency: PriceUnit }[];
}) {
  const [assetId, setAssetId] = useState(holdings[0]?.id ?? "");
  const currency = holdings.find((holding) => holding.id === assetId)?.currency ?? "rial";
  if (holdings.length === 0) {
    return <p className="text-sm text-muted-foreground">برای انتقال، اول یک دارایی در سبد لازم است.</p>;
  }
  return (
    <form action={transferHolding} className="grid gap-3">
      <p className="text-sm font-medium">انتقال بین حساب‌ها</p>
      <input
        type="hidden"
        name="idempotency_key"
        defaultValue=""
        ref={(node) => {
          if (node && !node.value) node.value = crypto.randomUUID();
        }}
      />
      <select
        name="id"
        required
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
        className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm"
      >
        {holdings.map((holding) => (
          <option key={holding.id} value={holding.id}>{holding.name}</option>
        ))}
      </select>
      <AccountSelect key={`${currency}-from`} accounts={accounts} currency={currency} id="transfer-from" label="از حساب" />
      <AccountSelect key={`${currency}-to`} accounts={accounts} currency={currency} name="counter_account_id" id="transfer-to" label="به حساب" />
      <input name="quantity" required inputMode="decimal" dir="ltr" placeholder="مقدار" className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm" />
      <ShamsiDateField name="traded_on" defaultValue={todayKey()} label="تاریخ" />
      <SaveButton>ثبت انتقال</SaveButton>
    </form>
  );
}

function SaveButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-11 px-4">
      {pending ? "در حال ذخیره..." : children}
    </Button>
  );
}
