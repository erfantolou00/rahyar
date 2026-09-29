"use client";

import { SourceName } from "@/components/source-name";
import { SortableTable } from "@/components/sortable-table";

export type PriceTableRow = {
  id: string;
  timeLabel: string;
  timeValue: number;
  typeLabel: string;
  symbol: string;
  priceLabel: string;
  priceValue: number;
  source: string;
};

const bleed = "-mx-4 -mb-4 overflow-x-auto border-t border-line";

export function PricesTable({ rows }: { rows: PriceTableRow[] }) {
  return (
    <SortableTable
      rows={rows}
      rowKey={(row) => row.id}
      minWidth="36rem"
      className={bleed}
      columns={[
        {
          key: "time",
          label: "زمان",
          numeric: true,
          sortValue: (row) => row.timeValue,
          render: (row) => row.timeLabel,
        },
        {
          key: "type",
          label: "نوع",
          sortValue: (row) => row.typeLabel,
          render: (row) => row.typeLabel,
        },
        {
          key: "symbol",
          label: "نماد",
          sortValue: (row) => row.symbol,
          render: (row) => <span className="numeric">{row.symbol}</span>,
        },
        {
          key: "price",
          label: "قیمت",
          numeric: true,
          sortValue: (row) => row.priceValue,
          render: (row) => <span className="numeric">{row.priceLabel}</span>,
        },
        {
          key: "source",
          label: "منبع",
          sortValue: (row) => row.source,
          render: (row) => <SourceName source={row.source} />,
        },
      ]}
    />
  );
}
