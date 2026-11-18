import { assetTypes, type AssetType } from "@/lib/finance/types";
import { priceUnits } from "@/lib/finance/prices/unit";

export const assetFieldNames = [
  "type",
  "symbol",
  "quantity",
  "price_unit",
  "avg_buy_price",
  "manual_value",
] as const;

export type AssetFieldName = (typeof assetFieldNames)[number];

export type AssetField = {
  name: AssetFieldName;
  label: string;
  kind: "text" | "number" | "select";
  required: boolean;
  dir?: "ltr";
  min?: number;
  maxLength?: number;
};

export const assetFields: AssetField[] = [
  { name: "type", label: "نوع", kind: "select", required: true },
  { name: "symbol", label: "نام", kind: "text", required: true, maxLength: 32, dir: "ltr" },
  { name: "quantity", label: "تعداد", kind: "number", required: true, min: 0, dir: "ltr" },
  { name: "price_unit", label: "مبنای قیمت", kind: "select", required: true },
  {
    name: "avg_buy_price",
    label: "قیمت خرید متوسط",
    kind: "number",
    required: false,
    min: 0,
    dir: "ltr",
  },
  { name: "manual_value", label: "قیمت فعلی", kind: "number", required: false, min: 0, dir: "ltr" },
];

export const basketColumns = [
  { key: "name", label: "نام", numeric: false },
  { key: "type", label: "نوع", numeric: false },
  { key: "class", label: "طبقه تخصیص", numeric: false },
  { key: "quantity", label: "تعداد", numeric: true },
  { key: "avgBuyPrice", label: "قیمت خرید متوسط", numeric: true },
  { key: "currentPrice", label: "قیمت فعلی", numeric: true },
  { key: "currentValue", label: "ارزش فعلی", numeric: true },
  { key: "absolute", label: "سود/زیان", numeric: true },
  { key: "percent", label: "سود/زیان درصدی", numeric: true },
  { key: "weight", label: "وزن در سبد", numeric: true },
] as const;

export type BasketColumnKey = (typeof basketColumns)[number]["key"];

export type AssetFormValues = Record<AssetFieldName, string> & {
  allocation_class: string;
  allocation_class_source: string;
};

export function emptyAssetValues(): AssetFormValues {
  return {
    type: assetTypes[0],
    symbol: "",
    quantity: "",
    price_unit: priceUnits[0],
    avg_buy_price: "",
    manual_value: "",
    allocation_class: "stock",
    allocation_class_source: "auto",
  };
}

export function isAssetFieldName(value: string): value is AssetFieldName {
  return (assetFieldNames as readonly string[]).includes(value);
}

export type AssetTypeOption = { value: AssetType; label: string };
