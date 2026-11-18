"use client";

import { useState, type FormEvent } from "react";
import { createPriceFeed, deletePriceFeed, setPriceFeedFlag } from "@/app/(dashboard)/prices/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { assetTypeLabels } from "@/lib/finance/labels";
import type { PriceFeed } from "@/lib/finance/prices/feeds";
import type { AssetType } from "@/lib/finance/types";

const addableTypes = ["stock", "fund", "coin", "gold", "usd", "crypto"] as const satisfies readonly AssetType[];

const feedErrors = {
  invalid: "اطلاعات نماد معتبر نیست.",
  unsupported: "برای این مورد منبع قیمت یا کدال نیست. سهام، صندوق، یا نام سکه، دلار، طلا و بیت‌کوین را وارد کنید.",
  save: "ذخیره نشد. دوباره تلاش کنید.",
  schema: "جدول منابع هنوز در پایگاه داده نیست. migration را اجرا کنید.",
} as const;

const originLabels: Record<PriceFeed["origin"], string> = {
  market: "بازار",
  holding: "سبد",
  added: "افزوده‌شده",
};

function feedSignature(feeds: PriceFeed[]): string {
  return feeds
    .map((feed) => `${feed.key}:${Number(feed.priceEnabled)}:${Number(feed.codalEnabled)}:${Number(feed.removable)}`)
    .join("|");
}

export function PriceFeedsDialog({
  feeds,
  schemaMissing,
}: {
  feeds: PriceFeed[];
  schemaMissing: boolean;
}) {
  const signature = feedSignature(feeds);
  const [seen, setSeen] = useState(signature);
  const [rows, setRows] = useState(feeds);
  const [open, setOpen] = useState(false);
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [symbol, setSymbol] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (seen !== signature) {
    setSeen(signature);
    setRows(feeds);
  }

  async function toggle(row: PriceFeed, flag: "price" | "codal") {
    if (schemaMissing || pending || (flag === "codal" && !row.codalAvailable)) return;
    const priceEnabled = flag === "price" ? !row.priceEnabled : row.priceEnabled;
    const codalEnabled = flag === "codal" ? !row.codalEnabled : row.codalEnabled;
    setPending(`${row.key}:${flag}`);
    setError(null);
    setNote(null);
    setRows((current) =>
      current.map((item) => (item.key === row.key ? { ...item, priceEnabled, codalEnabled } : item)),
    );
    const result = await setPriceFeedFlag({
      assetType: row.assetType,
      symbol: row.symbol,
      priceEnabled,
      codalEnabled,
    });
    setPending(null);
    if (!result.ok) {
      setRows((current) => current.map((item) => (item.key === row.key ? row : item)));
      setError(feedErrors[result.error]);
    }
  }

  async function addFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (schemaMissing || pending) return;
    setPending("add");
    setError(null);
    setNote(null);
    const result = await createPriceFeed({ assetType, symbol });
    setPending(null);
    if (!result.ok) {
      setError(feedErrors[result.error]);
      return;
    }
    setSymbol("");
    setNote(result.note);
  }

  async function remove(row: PriceFeed) {
    if (schemaMissing || pending || !row.removable) return;
    setPending(`${row.key}:remove`);
    setError(null);
    setNote(null);
    const result = await deletePriceFeed({ assetType: row.assetType, symbol: row.symbol });
    setPending(null);
    if (!result.ok) setError(feedErrors[result.error]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" className="h-11 px-4" />}>
        منابع دریافت
      </DialogTrigger>
      <DialogContent className="max-h-[min(42rem,calc(100%-2rem))] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pe-8">
          <DialogTitle>منابع دریافت</DialogTitle>
          <DialogDescription>
            این فهرست هر دارایی‌ای است که قیمت یا کدال آن خوانده می‌شود. سوییچ قیمت دریافت خودکار را خاموش یا روشن
            می‌کند. سوییچ کدال فقط برای سهام و صندوق است. تغییر قیمت از به‌روزرسانی بعدی اعمال می‌شود و کدال در نوبت
            سرور خوانده می‌شود.
          </DialogDescription>
        </DialogHeader>
        {schemaMissing ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {feedErrors.schema}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {note ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{note}</p> : null}
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-3 px-3 text-xs text-muted-foreground">
          <span>دارایی</span>
          <span className="text-center">قیمت</span>
          <span className="text-center">کدال</span>
        </div>
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 rounded-lg border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {row.label}
                  {row.removable ? (
                    <button
                      type="button"
                      className="ms-2 text-xs font-normal text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                      disabled={pending != null}
                      onClick={() => remove(row)}
                    >
                      حذف
                    </button>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {assetTypeLabels[row.assetType]} · {originLabels[row.origin]}
                  {row.label !== row.symbol ? <span dir="ltr"> · {row.symbol}</span> : null}
                </p>
              </div>
              <FeedSwitch
                on={row.priceEnabled}
                label={`قیمت ${row.label}`}
                disabled={schemaMissing || pending != null}
                onToggle={() => toggle(row, "price")}
              />
              <FeedSwitch
                on={row.codalEnabled}
                label={`کدال ${row.label}`}
                disabled={schemaMissing || pending != null || !row.codalAvailable}
                title={row.codalAvailable ? undefined : "کدال برای این دارایی نیست"}
                onToggle={() => toggle(row, "codal")}
              />
            </li>
          ))}
        </ul>
        <form onSubmit={addFeed} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-2 text-sm">
            <span>نوع</span>
            <select
              value={assetType}
              onChange={(event) => setAssetType(event.target.value as AssetType)}
              className="field-input"
              disabled={schemaMissing || pending != null}
            >
              {addableTypes.map((type) => (
                <option key={type} value={type}>
                  {assetTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>نماد</span>
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              required
              maxLength={32}
              dir="ltr"
              placeholder="فولاد یا امامی"
              className="field-input text-start"
              disabled={schemaMissing || pending != null}
            />
          </label>
          <Button type="submit" className="h-11 px-4" disabled={schemaMissing || pending != null || !symbol.trim()}>
            {pending === "add" ? "در حال افزودن..." : "افزودن"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedSwitch({
  on,
  label,
  disabled,
  title,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled: boolean;
  title?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={`relative mx-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 ${
        on ? "bg-primary" : "bg-muted"
      }`}
    >
      <span className={`absolute size-5 rounded-full bg-white shadow-sm ${on ? "start-5" : "start-0.5"}`} />
    </button>
  );
}
