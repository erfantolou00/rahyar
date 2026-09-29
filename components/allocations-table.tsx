"use client";

import { SortableTable } from "@/components/sortable-table";

export type AllocationTableRow = {
  id: string;
  typeLabel: string;
  minLabel: string;
  minValue: number;
  maxLabel: string;
  maxValue: number;
  formula: string;
  fromLabel: string;
  fromValue: string;
  toLabel: string;
  toValue: string | null;
};

const bleed = "-mx-4 -mb-4 overflow-x-auto border-t border-line";

export function AllocationsTable({ rows }: { rows: AllocationTableRow[] }) {
  return (
    <SortableTable
      rows={rows}
      rowKey={(row) => row.id}
      minWidth="40rem"
      className={bleed}
      columns={[
        {
          key: "type",
          label: "طبقه",
          sortValue: (row) => row.typeLabel,
          render: (row) => row.typeLabel,
        },
        {
          key: "min",
          label: "حداقل",
          numeric: true,
          sortValue: (row) => row.minValue,
          render: (row) => <span className="numeric">{row.minLabel}</span>,
        },
        {
          key: "max",
          label: "حداکثر",
          numeric: true,
          sortValue: (row) => row.maxValue,
          render: (row) => <span className="numeric">{row.maxLabel}</span>,
        },
        {
          key: "formula",
          label: "فرمول",
          sortValue: (row) => row.formula,
          render: (row) => <span className="numeric">{row.formula}</span>,
        },
        {
          key: "from",
          label: "از",
          numeric: true,
          sortValue: (row) => row.fromValue,
          render: (row) => row.fromLabel,
        },
        {
          key: "to",
          label: "تا",
          numeric: true,
          sortValue: (row) => row.toValue,
          render: (row) => row.toLabel,
        },
      ]}
    />
  );
}
