"use client";

import { assetTypeLabels } from "@/lib/finance/labels";
import { assetFields, type AssetField, type AssetFormValues } from "@/lib/finance/basket-fields";
import { assetTypes } from "@/lib/finance/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const controlClass = "h-10 bg-card";

export function AssetFields({ values }: { values: AssetFormValues }) {
  const typeOptions = assetTypes.map((type) => ({
    value: type,
    label: assetTypeLabels[type],
  }));

  return (
    <div className="grid gap-3">
      {assetFields.map((field) => (
        <FieldControl key={field.name} field={field} values={values} typeOptions={typeOptions} />
      ))}
    </div>
  );
}

function FieldControl({
  field,
  values,
  typeOptions,
}: {
  field: AssetField;
  values: AssetFormValues;
  typeOptions: { value: string; label: string }[];
}) {
  const id = `asset-${field.name}`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {field.kind === "select" ? (
        <select
          id={id}
          name={field.name}
          required={field.required}
          defaultValue={values[field.name]}
          className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {typeOptions.map((option) => (
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
          defaultValue={values[field.name]}
          dir={field.dir}
          maxLength={field.maxLength}
          min={field.min}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          className={controlClass}
        />
      )}
    </div>
  );
}
