import { assetTypeLabels } from "@/lib/finance/labels";
import type { OverviewSource } from "@/lib/overview/types";

const parts = [
  { type: "stock" as const, value: 2_100_000_000 },
  { type: "gold" as const, value: 1_070_000_000 },
  { type: "crypto" as const, value: 720_000_000 },
  { type: "fund" as const, value: 600_000_000 },
  { type: "usd" as const, value: 360_000_000 },
];

function sampleSeries(): { at: string; value: number }[] {
  const points: { at: string; value: number }[] = [];
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(Date.UTC(2026, 9, 18 + day));
    const wave = Math.sin(day / 4) * 0.012 + day * 0.004;
    points.push({
      at: date.toISOString().slice(0, 10),
      value: Math.round(4_200_000_000 * (1 + wave)),
    });
  }
  return points;
}

export function sampleOverviewSource(reason: "empty" | "preview"): OverviewSource {
  const totalValue = parts.reduce((sum, part) => sum + part.value, 0);
  return {
    sample: true,
    sampleReason: reason,
    totalValue,
    holdingsCount: parts.length,
    todayAbsolute: 63_050_000,
    todayPercent: 1.3,
    totalAbsolute: 640_000_000,
    totalPercent: 15.2,
    slices: parts.map((part) => ({
      id: part.type,
      label: assetTypeLabels[part.type],
      value: part.value,
      weight: (part.value / totalValue) * 100,
    })),
    alerts: [
      {
        id: "sample-gold",
        title: "اونس طلا از ۴۲۰۰ دلار عبور کند",
        meta: "آستانه ۴٬۲۰۰ · اعلان مرورگر · فوری",
      },
      {
        id: "sample-btc",
        title: "بیت‌کوین پایین‌تر از ۹۰٬۰۰۰ دلار",
        meta: "آستانه ۹۰٬۰۰۰ · بله · روزانه",
      },
      {
        id: "sample-stock",
        title: "وزن سهام از ۵۰٪ بیشتر شود",
        meta: "آستانه ۵۰ · داخل برنامه · هفتگی",
      },
    ],
    alertsNote: null,
    trades: [
      {
        id: "sample-buy",
        title: "فولاد",
        side: "buy",
        sideLabel: "خرید",
        qty: "۲٬۵۰۰",
        when: "۱۴۰۵/۸/۲۴",
        note: "اضافه کردن به هسته سبد",
      },
      {
        id: "sample-sell",
        title: "طلای ۱۸ عیار",
        side: "sell",
        sideLabel: "فروش",
        qty: "۱۲",
        when: "۱۴۰۵/۸/۲۲",
        note: null,
      },
      {
        id: "sample-deposit",
        title: "نقد",
        side: "deposit",
        sideLabel: "واریز",
        qty: "۱۵۰٬۰۰۰٬۰۰۰",
        when: "۱۴۰۵/۸/۲۰",
        note: "واریز ریالی",
      },
    ],
    tradesNote: null,
    series: sampleSeries(),
    seriesCaption: "روند نمونه یک ماه اخیر. این خط از دفتر شما خوانده نشده است.",
  };
}
