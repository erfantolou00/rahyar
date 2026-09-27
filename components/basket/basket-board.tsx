"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createAsset, deleteAsset, updateAsset } from "@/app/(dashboard)/basket/actions";
import { AssetFields } from "@/components/basket/asset-fields";
import { basketColumns, emptyAssetValues, type AssetFormValues } from "@/lib/finance/basket-fields";
import type { PresentedRow, ValueTone } from "@/lib/finance/basket-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const toneClass: Record<ValueTone, string> = {
  up: "text-ok",
  down: "text-danger",
  flat: "text-foreground",
  empty: "text-muted-foreground",
};

export function BasketBoard({
  rows,
  totalValue,
  totalAbsolute,
  totalPercent,
  totalTone,
}: {
  rows: PresentedRow[];
  totalValue: string;
  totalAbsolute: string;
  totalPercent: string;
  totalTone: ValueTone;
}) {
  const [editing, setEditing] = useState<PresentedRow | null>(null);
  const [removing, setRemoving] = useState<PresentedRow | null>(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="ارزش سبد" value={totalValue} />
        <Summary label="سود/زیان" value={totalAbsolute} tone={totalTone} />
        <Summary label="بازده" value={totalPercent} tone={totalTone} />
      </div>

      <div className="flex justify-start">
        <Dialog>
          <DialogTrigger render={<Button type="button" />}>افزودن دارایی</DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>دارایی جدید</DialogTitle>
              <DialogDescription>قیمت فعلی، قیمت هر واحد به ریال است. ارزش کل و سود روی سرور حساب می‌شود.</DialogDescription>
            </DialogHeader>
            <AssetEditor action={createAsset} values={emptyAssetValues()} submitLabel="افزودن به سبد" />
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">هنوز دارایی‌ای در سبد نیست.</CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-visible md:block">
            <CardContent className="px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    {basketColumns.map((column) => (
                      <TableHead key={column.key}>{column.label}</TableHead>
                    ))}
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      {basketColumns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={column.numeric ? "numeric" : undefined}
                        >
                          <span className={column.key === "absolute" || column.key === "percent" ? toneClass[row.tone] : undefined}>
                            {row.cells[column.key]}
                          </span>
                        </TableCell>
                      ))}
                      <TableCell>
                        <RowActions row={row} onEdit={setEditing} onRemove={setRemoving} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <ul className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{row.cells.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {basketColumns.slice(1).map((column) => (
                      <p key={column.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{column.label}</span>
                        <span className={`${column.numeric ? "numeric" : ""} ${column.key === "absolute" || column.key === "percent" ? toneClass[row.tone] : ""}`}>
                          {row.cells[column.key]}
                        </span>
                      </p>
                    ))}
                    <RowActions row={row} onEdit={setEditing} onRemove={setRemoving} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش دارایی</DialogTitle>
            <DialogDescription>تغییرها بعد از ذخیره در محاسبهٔ سبد اعمال می‌شود.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <AssetEditor
              key={editing.id}
              action={updateAsset}
              values={editing.values}
              id={editing.id}
              submitLabel="ذخیره"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف دارایی</DialogTitle>
            <DialogDescription>
              {removing ? `«${removing.cells.name}» و تراکنش‌های وابستهٔ آن حذف می‌شوند.` : ""}
            </DialogDescription>
          </DialogHeader>
          {removing ? (
            <form action={deleteAsset}>
              <input type="hidden" name="id" value={removing.id} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                  انصراف
                </Button>
                <Button type="submit" variant="destructive">
                  حذف
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({ label, value, tone = "flat" }: { label: string; value: string; tone?: ValueTone }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`numeric text-2xl font-semibold ${toneClass[tone]}`}>{value}</CardContent>
    </Card>
  );
}

function RowActions({
  row,
  onEdit,
  onRemove,
}: {
  row: PresentedRow;
  onEdit: (row: PresentedRow) => void;
  onRemove: (row: PresentedRow) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row)}>
        ویرایش
      </Button>
      <Button type="button" size="sm" variant="destructive" onClick={() => onRemove(row)}>
        حذف
      </Button>
    </div>
  );
}

function AssetEditor({
  action,
  values,
  submitLabel,
  id,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values: AssetFormValues;
  submitLabel: string;
  id?: string;
}) {
  return (
    <form action={action} className="grid gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <AssetFields values={values} />
      <DialogFooter>
        <SaveButton>{submitLabel}</SaveButton>
      </DialogFooter>
    </form>
  );
}

function SaveButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "در حال ذخیره..." : children}
    </Button>
  );
}
