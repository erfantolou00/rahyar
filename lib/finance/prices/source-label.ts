const tgjuTopics: Record<string, string> = {
  price_dollar_rl: "نرخ دلار",
  geram18: "طلای ۱۸ عیار",
  "crypto-bitcoin-irr": "بیت‌کوین",
  "crypto-bitcoin-irr/usd": "بیت‌کوین به دلار، از تقسیم قیمت ریالی TGJU بر نرخ دلار",
};

export type SourceLabel = {
  short: string;
  full: string;
};

export function describeSource(source: string): SourceLabel {
  const trimmed = source.trim();
  if (!trimmed) return { short: "—", full: "منبع ثبت نشده" };

  const tgju = /^tgju-(json|page):(.+)$/.exec(trimmed);
  if (tgju) {
    const channel = tgju[1] === "json" ? "وب‌سرویس" : "صفحهٔ سایت";
    const topic = tgjuTopics[tgju[2] ?? ""] ?? tgju[2];
    return {
      short: "TGJU",
      full: `${topic}، ${channel} شبکه اطلاع‌رسانی طلا و ارز (TGJU)`,
    };
  }

  if (trimmed.startsWith("nobitex:usdt-rls")) {
    return {
      short: "نوبیتکس",
      full: "نرخ تتر به ریال در نوبیتکس",
    };
  }

  if (trimmed.startsWith("nobitex")) {
    return {
      short: "نوبیتکس",
      full: "قیمت بیت‌کوین به تتر در نوبیتکس",
    };
  }

  if (trimmed.startsWith("gold-api")) {
    return {
      short: "انس جهانی",
      full: "گرم ۱۸ عیار از انس جهانی ضرب در نرخ تتر نوبیتکس",
    };
  }

  if (trimmed.startsWith("binance")) {
    return {
      short: "بایننس",
      full: "قیمت بیت‌کوین به تتر در بازار بایننس (Binance)",
    };
  }

  if (trimmed.startsWith("coingecko")) {
    return {
      short: "CoinGecko",
      full: "قیمت بیت‌کوین به دلار در CoinGecko",
    };
  }

  if (trimmed === "دستی" || trimmed === "manual") {
    return { short: "دستی", full: "قیمت واردشده به‌صورت دستی" };
  }

  const head = trimmed.split(":")[0] || trimmed;
  const short = head.length > 16 ? `${head.slice(0, 14)}…` : head;
  return { short, full: trimmed };
}
