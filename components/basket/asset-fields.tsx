"use client";

import { useState } from "react";
import { allocationClasses, suggestAllocationClass } from "@/lib/finance/allocation-class";
import { assetTypeLabels } from "@/lib/finance/labels";
import { assetFields, type AssetField, type AssetFormValues } from "@/lib/finance/basket-fields";
import { priceUnits, type PriceUnit } from "@/lib/finance/prices/unit";
import { assetTypes, type AssetType } from "@/lib/finance/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const controlClass = "h-10 bg-card";
const unitLabels: Record<PriceUnit, string> = { rial: "ریال", usd: "دلار" };

export function AssetFields({ values }: { values: AssetFormValues }) {
  const [type, setType] = useState(values.type);
  const [symbol, setSymbol] = useState(values.symbol);
  const [unit, setUnit] = useState<PriceUnit>(values.price_unit === "usd" ? "usd" : "rial");
  const [manualClass, setManualClass] = useState(values.allocation_class_source === "manual");
  const [chosenClass, setChosenClass] = useState(initialClass(values));
  const typeOptions = assetTypes.map((option) => ({
    value: option,
    label: assetTypeLabels[option],
  }));
  const unitOptions = priceUnits.map((option) => ({
    value: option,
    label: unitLabels[option],
  }));
  const suggestion = suggestAllocationClass(asAssetType(type), symbol);

  function changeType(next: string) {
    setType(next);
    const untouched =
      values.avg_buy_price === "" && values.manual_value === "" && values.price_unit !== "usd";
    if (untouched && next === "crypto") setUnit("usd");
  }

  return (
    <div className="grid gap-3">
      {assetFields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          values={values}
          type={type}
          symbol={symbol}
          unit={unit}
          onTypeChange={changeType}
          onSymbolChange={setSymbol}
          onUnitChange={setUnit}
          typeOptions={typeOptions}
          unitOptions={unitOptions}
        />
      ))}
      <AllocationClassField
        manual={manualClass}
        chosen={chosenClass}
        suggestion={suggestion}
        onManual={setManualClass}
        onChosen={setChosenClass}
      />
    </div>
  );
}

function FieldControl({
  field,
  values,
  type,
  symbol,
  unit,
  onTypeChange,
  onSymbolChange,
  onUnitChange,
  typeOptions,
  unitOptions,
}: {
  field: AssetField;
  values: AssetFormValues;
  type: string;
  symbol: string;
  unit: PriceUnit;
  onTypeChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onUnitChange: (value: PriceUnit) => void;
  typeOptions: { value: string; label: string }[];
  unitOptions: { value: string; label: string }[];
}) {
  const id = `asset-${field.name}`;
  const unitLabel = unitLabels[unit];
  const label =
    field.name === "avg_buy_price" || field.name === "manual_value"
      ? `${field.label} (${unitLabel})`
      : field.label;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {field.kind === "select" ? (
        <select
          id={id}
          name={field.name}
          required={field.required}
          value={field.name === "price_unit" ? unit : type}
          onChange={(event) => {
            const next = event.target.value;
            if (field.name === "price_unit" && (next === "rial" || next === "usd")) onUnitChange(next);
            if (field.name === "type") onTypeChange(next);
          }}
          className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {(field.name === "price_unit" ? unitOptions : typeOptions).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          name={field.name}
          required={field.required}
          value={field.name === "symbol" ? symbol : undefined}
          defaultValue={field.name === "symbol" ? undefined : values[field.name]}
          onChange={field.name === "symbol" ? (event) => onSymbolChange(event.target.value) : undefined}
          placeholder={placeholderFor(field.name, type, unit)}
          dir={field.dir}
          maxLength={field.maxLength}
          min={field.min}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          className={controlClass}
        />
      )}
      {field.name === "price_unit" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          قیمت خرید و قیمت فعلی با همین واحد نوشته می‌شوند. ارزش سبد باز هم به ریال حساب می‌شود.
        </p>
      ) : null}
      {field.name === "symbol" && type === "usd" ? (
        <p className="text-xs leading-5 text-muted-foreground">با نوع دلار، قیمت زندهٔ دلار به ریال روی این دارایی اعمال می‌شود.</p>
      ) : null}
      {field.name === "manual_value" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          اگر خالی بماند و قیمت زنده باشد، همان قیمت در جدول نشان داده می‌شود.
        </p>
      ) : null}
    </div>
  );
}

function AllocationClassField({
  manual,
  chosen,
  suggestion,
  onManual,
  onChosen,
}: {
  manual: boolean;
  chosen: AssetType;
  suggestion: AssetType;
  onManual: (value: boolean) => void;
  onChosen: (value: AssetType) => void;
}) {
  const applied = manual ? chosen : suggestion;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="asset-allocation-class">طبقه تخصیص</Label>
      <input type="hidden" name="allocation_class_source" value={manual ? "manual" : "auto"} />
      <input type="hidden" name="allocation_class" value={applied} />
      <p className="text-sm">
        پیشنهاد خودکار: <span className="font-medium">{assetTypeLabels[suggestion]}</span>
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={manual}
          onChange={(event) => onManual(event.target.checked)}
        />
        خودم تعیین می‌کنم
      </label>
      {manual ? (
        <select
          id="asset-allocation-class"
          value={chosen}
          onChange={(event) => onChosen(asAssetType(event.target.value))}
          className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {allocationClasses.map((option) => (
            <option key={option} value={option}>
              {assetTypeLabels[option]}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          بازهٔ سبد با این طبقه حساب می‌شود، نه با نوع ابزار. سکه، طلای ۱۸ عیار و صندوق‌هایی مثل عیار خودکار در طلا قرار می‌گیرند.
        </p>
      )}
    </div>
  );
}

function initialClass(values: AssetFormValues): AssetType {
  return (allocationClasses as readonly string[]).includes(values.allocation_class)
    ? asAssetType(values.allocation_class)
    : suggestAllocationClass(asAssetType(values.type), values.symbol);
}

function asAssetType(value: string): AssetType {
  return (assetTypes as readonly string[]).includes(value) ? (value as AssetType) : "stock";
}

function placeholderFor(name: string, type: string, unit: PriceUnit): string | undefined {
  if (name === "symbol" && type === "usd") return "دلار";
  if (name === "quantity" && type === "crypto") return "0.0003";
  if (name === "avg_buy_price" && unit === "usd" && type === "crypto") return "74000";
  return undefined;
}
