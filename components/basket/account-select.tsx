import type { AccountKind } from "@/lib/finance/types";
import type { PriceUnit } from "@/lib/finance/prices/unit";

export type BasketAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: PriceUnit;
};

export function AccountSelect({
  accounts,
  currency,
  preferredId,
  name = "account_id",
  id,
  label = "حساب",
}: {
  accounts: BasketAccount[];
  currency?: PriceUnit;
  preferredId?: string | null;
  name?: string;
  id?: string;
  label?: string;
}) {
  const choices = currency ? accounts.filter((account) => account.currency === currency) : accounts;
  if (choices.length === 0) return null;
  const fallback = choices.find((account) => account.id === preferredId)?.id ?? choices[0]?.id;
  const fieldId = id ?? name;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">{label}</label>
      <select
        id={fieldId}
        name={name}
        defaultValue={fallback}
        className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm"
      >
        {choices.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}
