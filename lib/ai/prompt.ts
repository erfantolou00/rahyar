import type { WeeklyReportContent } from "@/lib/finance/weekly";

export type ChatFacts = {
  portfolio: {
    totalValue: number;
    holdings: Array<{
      id: string;
      type: string;
      symbol: string;
      quantity: number;
      price: number | null;
      value: number;
      weight: number | null;
    }>;
    byType: Array<{
      type: string;
      value: number;
      weight: number;
      minPercent: number | null;
      maxPercent: number | null;
      status: string;
    }>;
  };
  activeAlertCount: number;
  activeAlerts: Array<{
    id: string;
    kind: string;
    rule: string;
    message: string | null;
    assetType: string | null;
    threshold: number;
    createdAt: string;
    isActive: boolean;
  }>;
  latestWeeklyReport: WeeklyReportContent | null;
  stocks: ChatStockFact[];
};

export type ChatStockFact = {
  symbol: string;
  price: number | null;
  pe: number | null;
  eps: number | null;
  roe: number | null;
  profitMargin: number | null;
  adjusted: boolean;
  latestTitle: string | null;
  lastPrice: number | null;
  dailyChange: number | null;
  dailyPercent: number | null;
  monthPercent: number | null;
  quarterPercent: number | null;
  yearPercent: number | null;
  volume: number | null;
  tradeValue: number | null;
  marketCap: number | null;
  freeFloatPercent: number | null;
  pb: number | null;
  dps: number | null;
  industry: string | null;
};

const SHARED_RULES = [
  "فقط فارسی جواب بده.",
  "عدد نساز. فقط عددهایی را که در JSON همین پیام هست، عیناً تکرار کن.",
  "گرد کردن، تخمین، و محاسبهٔ تازه ممنوع است.",
  "اگر عددی در JSON نیست، بگو در داده‌های داده‌شده نیست.",
  "تاریخ و ساعت را به عدد تبدیل نکن.",
  "دستور خرید یا فروش نده.",
];

export function chatSystemPrompt(facts: ChatFacts): string {
  return [
    "تو دستیار مالی رهیار هستی.",
    ...SHARED_RULES,
    "اگر سابقهٔ گفتگو با JSON فرق داشت، JSON معتبر است.",
    "مشخصات و بازده سهام در stocks است. dailyPercent و monthPercent و quarterPercent و yearPercent درصد تغییر قیمت‌اند. lastPrice آخرین قیمت، dailyChange تغییر روزانه به ریال، و marketCap ارزش بازار به ریال است.",
    "داده:",
    JSON.stringify(facts),
  ].join("\n");
}

export function interpretSystemPrompt(content: WeeklyReportContent): string {
  const facts = { ...content, commentary: null };
  return [
    "این تفسیر یک گزارش هفتگی است.",
    "خروجی دقیقاً ۵ خط فارسی باشد. هر خط یک جمله. شماره‌گذاری نکن.",
    ...SHARED_RULES,
    "داده:",
    JSON.stringify(facts),
  ].join("\n");
}
