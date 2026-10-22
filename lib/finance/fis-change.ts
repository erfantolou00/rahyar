import type { CompletionResult } from "@/lib/ai/gapgpt";
import { threePersianLines } from "@/lib/ai/lines";
import type { ChatMessage } from "@/lib/ai/messages";
import { replyUsesKnownNumbers } from "@/lib/ai/numbers";
import { formatNumber } from "@/lib/finance/format";
import type { FisStatus } from "@/lib/finance/fis";

/** Same floors as assessFis. A crossing is a label change, not an order. */
export const FIS_ENTER_FLOOR = 60;
export const FIS_HOLD_FLOOR = 45;

const statusLabels: Record<FisStatus, string> = {
  enter: "ورود",
  hold: "نگهداری",
  exit: "خروج",
  watch: "بررسی",
  excluded: "حذف پیش از امتیاز",
};

export type FisChangeFactor = {
  key: string;
  label: string;
  score: number;
};

export type FisChangeSnapshot = {
  status: FisStatus;
  score: number | null;
  factors: FisChangeFactor[];
};

export type FisChangeMovedFactor = {
  key: string;
  label: string;
  from: number;
  to: number;
  delta: number;
};

export type FisChangeDecision = {
  alert: boolean;
  reasons: string[];
  factors: FisChangeMovedFactor[];
};

export type FisChangeNotice = {
  symbol: string;
  previous: FisChangeSnapshot;
  next: FisChangeSnapshot;
  decision: FisChangeDecision;
};

type Completion = (messages: ChatMessage[]) => Promise<CompletionResult>;

function crossed(previous: number, next: number, floor: number): boolean {
  return (previous >= floor && next < floor) || (next >= floor && previous < floor);
}

function biggestMoves(previous: FisChangeSnapshot, next: FisChangeSnapshot): FisChangeMovedFactor[] {
  const prior = new Map(previous.factors.map((factor) => [factor.key, factor]));
  const moves: FisChangeMovedFactor[] = [];
  for (const factor of next.factors) {
    const before = prior.get(factor.key);
    if (!before) continue;
    moves.push({
      key: factor.key,
      label: factor.label,
      from: before.score,
      to: factor.score,
      delta: factor.score - before.score,
    });
  }
  moves.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return moves.slice(0, 2);
}

/**
 * A notice is warranted only when the label changed, the score fell by at least 10,
 * or the score crossed the enter floor (60) or the hold floor (45).
 * A rise that stays on the same side of both floors is quiet.
 * A factor missing on either side is left out; it is not treated as zero.
 */
export function fisChangeAlert(previous: FisChangeSnapshot | null, next: FisChangeSnapshot): FisChangeDecision {
  if (!previous) return { alert: false, reasons: [], factors: [] };

  const reasons: string[] = [];
  if (previous.status !== next.status) {
    reasons.push(`وضعیت از ${statusLabels[previous.status]} به ${statusLabels[next.status]} عوض شد.`);
  }

  const previousScore = previous.score;
  const nextScore = next.score;
  if (previousScore != null && nextScore != null) {
    const drop = previousScore - nextScore;
    if (drop >= 10) {
      reasons.push(
        `امتیاز ${formatNumber(drop, 2)} واحد کم شد و از ${formatNumber(previousScore, 2)} به ${formatNumber(nextScore, 2)} رسید.`,
      );
    }
    if (crossed(previousScore, nextScore, FIS_ENTER_FLOOR)) {
      reasons.push(
        `امتیاز از کف ${formatNumber(FIS_ENTER_FLOOR, 2)} گذشت و از ${formatNumber(previousScore, 2)} به ${formatNumber(nextScore, 2)} رسید.`,
      );
    }
    if (crossed(previousScore, nextScore, FIS_HOLD_FLOOR)) {
      reasons.push(
        `امتیاز از کف ${formatNumber(FIS_HOLD_FLOOR, 2)} گذشت و از ${formatNumber(previousScore, 2)} به ${formatNumber(nextScore, 2)} رسید.`,
      );
    }
  }

  if (reasons.length === 0) return { alert: false, reasons: [], factors: [] };
  return { alert: true, reasons, factors: biggestMoves(previous, next) };
}

export function fisChangeMessage(notice: FisChangeNotice): string {
  const lines = [`صورت مالی جدید ${notice.symbol} ارزیابی شد.`, ...notice.decision.reasons];
  const previousScore = notice.previous.score;
  const nextScore = notice.next.score;
  if (previousScore != null && nextScore != null) {
    lines.push(`امتیاز از ${formatNumber(previousScore, 2)} به ${formatNumber(nextScore, 2)} رسید.`);
  } else if (nextScore != null) {
    lines.push(`امتیاز ${formatNumber(nextScore, 2)} است.`);
  }
  for (const factor of notice.decision.factors) {
    lines.push(`${factor.label} از ${formatNumber(factor.from, 2)} به ${formatNumber(factor.to, 2)} رسید.`);
  }
  while (lines.length > 1 && lines.join(" ").length > 500) lines.pop();
  const text = lines.join(" ");
  return text.length <= 500 ? text : text.slice(0, 500).trim();
}

export function fisChangeFacts(notice: FisChangeNotice): {
  symbol: string;
  previousScore: number | null;
  nextScore: number | null;
  previousStatus: string;
  nextStatus: string;
  enterFloor: number;
  holdFloor: number;
  reasons: string[];
  factors: { label: string; before: number; after: number; change: number }[];
} {
  return {
    symbol: notice.symbol,
    previousScore: notice.previous.score,
    nextScore: notice.next.score,
    previousStatus: statusLabels[notice.previous.status],
    nextStatus: statusLabels[notice.next.status],
    enterFloor: FIS_ENTER_FLOOR,
    holdFloor: FIS_HOLD_FLOOR,
    reasons: notice.decision.reasons,
    factors: notice.decision.factors.map((factor) => ({
      label: factor.label,
      before: factor.from,
      after: factor.to,
      change: factor.to - factor.from,
    })),
  };
}

/** Three Persian lines, or null when the reply is the wrong shape, an order, or uses an unknown number. */
export async function interpretFisChange(notice: FisChangeNotice, complete: Completion): Promise<string | null> {
  const facts = fisChangeFacts(notice);
  try {
    const result = await complete([
      {
        role: "system",
        content: "از همین واقعیت‌ها دقیقاً سه خط فارسی بنویس. هر خط یک جمله. عدد تازه نساز. دستور خرید یا فروش ننویس.",
      },
      { role: "user", content: JSON.stringify(facts) },
    ]);
    if (!result.ok) return null;
    const lines = threePersianLines(result.text);
    if (!lines) return null;
    const text = lines.join("\n");
    if (text.length === 0 || text.length > 500) return null;
    if (/بخر|بفروش|سفارش/.test(text)) return null;
    if (!replyUsesKnownNumbers(text, [facts])) return null;
    return text;
  } catch {
    return null;
  }
}
