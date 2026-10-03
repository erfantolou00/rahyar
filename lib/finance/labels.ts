import type {
  AlertChannel,
  AlertKind,
  AllocationStatus,
  AssetType,
  ChatRole,
  NotifyFrequency,
  ReportType,
  TransactionType,
} from "@/lib/finance/types";

export const assetTypeLabels: Record<AssetType, string> = {
  stock: "سهام",
  gold: "طلا",
  coin: "سکه",
  usd: "دلار",
  crypto: "رمزارز",
  cash: "نقد",
  fund: "صندوق",
  loan: "وام",
  real_estate: "ملک",
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  buy: "خرید",
  sell: "فروش",
  deposit: "واریز",
  withdraw: "برداشت",
};

export const reportTypeLabels: Record<ReportType, string> = {
  daily: "روزانه",
  weekly: "هفتگی",
  event: "رویدادی",
  period: "دوره‌ای",
};

export const chatRoleLabels: Record<ChatRole, string> = {
  user: "شما",
  assistant: "دستیار",
  system: "سیستم",
};

export const allocationStatusLabels: Record<AllocationStatus, string> = {
  inside: "داخل محدوده",
  below: "کمتر از حداقل",
  above: "بیشتر از حداکثر",
  unset: "بدون محدوده",
};

export const alertKindLabels: Record<AlertKind, string> = {
  rule: "قاعدهٔ دستی",
  allocation_deviation: "انحراف تخصیص",
  codal_notice: "گزارش کدال",
};

export const alertChannelLabels: Record<AlertChannel, string> = {
  in_app: "داخل برنامه",
  bale: "بله",
  push: "اعلان مرورگر",
};

export const notifyFrequencyLabels: Record<NotifyFrequency, string> = {
  immediate: "فوری",
  daily: "روزانه",
  weekly: "هفتگی",
  off: "خاموش",
};

export const riskLabels: Record<number, string> = {
  1: "بسیار محتاط",
  2: "محتاط",
  3: "متعادل",
  4: "ریسک‌پذیر",
  5: "تهاجمی",
};
