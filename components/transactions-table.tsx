"use client";

import { SortableTable } from "@/components/sortable-table";

export type TransactionTableRow = {
  id: string;
  dateLabel: string;
  dateValue: string;
  asset: string;
  typeLabel: string;
  qtyLabel: string;
  qtyValue: number;
  priceLabel: string;
  priceValue: number;
  note: string;
};

const bleed = "-mx-4 -mb-4 overflow-x-auto border-t border-line";

export function TransactionsTable({ rows }: { rows: TransactionTableRow[] }) {
  return (
    <SortableTable
      rows={rows}
      rowKey={(row) => row.id}
      minWidth="40rem"
      className={bleed}
      columns={[
        {
          key: "date",
          label: "تاریخ",
          numeric: true,
          sortValue: (row) => row.dateValue,
          render: (row) => row.dateLabel,
        },
        {
          key: "asset",
          label: "دارایی",
          sortValue: (row) => row.asset,
          render: (row) => <span className="numeric">{row.asset}</span>,
        },
        {
          key: "type",
          label: "نوع",
          sortValue: (row) => row.typeLabel,
          render: (row) => row.typeLabel,
        },
        {
          key: "qty",
          label: "مقدار",
          numeric: true,
          sortValue: (row) => row.qtyValue,
          render: (row) => <span className="numeric">{row.qtyLabel}</span>,
        },
        {
          key: "price",
          label: "قیمت",
          numeric: true,
          sortValue: (row) => row.priceValue,
          render: (row) => <span className="numeric">{row.priceLabel}</span>,
        },
        {
          key: "note",
          label: "یادداشت",
          sortValue: (row) => row.note,
          render: (row) => row.note,
        },
      ]}
    />
  );
}
