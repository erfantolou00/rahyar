"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

export type SortValue = string | number | null;

export type SortableColumn<T> = {
  key: string;
  label: string;
  numeric?: boolean;
  sortValue: (row: T) => SortValue;
  render: (row: T) => React.ReactNode;
};

type SortState = {
  key: string;
  direction: "asc" | "desc";
};

export function SortableTable<T>({
  rows,
  rowKey,
  columns,
  trailing,
  minWidth = "40rem",
  className = "overflow-x-auto rounded-xl border border-line bg-card",
}: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: SortableColumn<T>[];
  trailing?: { label: string; render: (row: T) => React.ReactNode };
  minWidth?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<SortState | null>(null);
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  function toggle(column: SortableColumn<T>) {
    setSort((current) => nextSort(current, column.key, Boolean(column.numeric)));
  }

  return (
    <div className={className}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key ? sort.direction : null;
              return (
                <th key={column.key} scope="col" aria-sort={ariaSort(active)}>
                  <button
                    type="button"
                    onClick={() => toggle(column)}
                    className="inline-flex items-center gap-1 rounded-md text-start text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                  >
                    <span>{column.label}</span>
                    <SortIcon direction={active} />
                  </button>
                </th>
              );
            })}
            {trailing ? (
              <th scope="col">
                <span className="text-xs font-semibold text-muted-foreground">{trailing.label}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
              {trailing ? <td>{trailing.render(row)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />;
}

function ariaSort(direction: "asc" | "desc" | null): "ascending" | "descending" | "none" {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

function nextSort(current: SortState | null, key: string, numeric: boolean): SortState | null {
  const first: SortState["direction"] = numeric ? "desc" : "asc";
  const second: SortState["direction"] = numeric ? "asc" : "desc";
  if (!current || current.key !== key) return { key, direction: first };
  if (current.direction === first) return { key, direction: second };
  return null;
}

function sortRows<T>(rows: T[], columns: SortableColumn<T>[], sort: SortState | null): T[] {
  if (!sort) return rows;
  const column = columns.find((item) => item.key === sort.key);
  if (!column) return rows;
  return [...rows].sort((left, right) => compare(column.sortValue(left), column.sortValue(right), sort.direction));
}

function compare(left: SortValue, right: SortValue, direction: "asc" | "desc"): number {
  const leftEmpty = left == null || left === "";
  const rightEmpty = right == null || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  const base =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "fa");
  return direction === "asc" ? base : -base;
}
