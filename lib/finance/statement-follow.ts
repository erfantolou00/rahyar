import { completeChat } from "@/lib/ai/gapgpt";
import { INTERPRET_POLICY, takeRateSlot } from "@/lib/ai/rate-limit";
import { isFinancialStatement, type CodalLetter } from "@/lib/finance/codal/parse";
import {
  fisChangeAlert,
  fisChangeMessage,
  interpretFisChange,
  type FisChangeNotice,
  type FisChangeSnapshot,
} from "@/lib/finance/fis-change";
import type { FinanceClient } from "@/lib/finance/queries";
import { dispatchAlertNotifications } from "@/lib/notify/dispatch";

export const FIS_CHANGE_KIND = "fis_change" as const;

export type StatementFollowResult = {
  scored: boolean;
  alerted: boolean;
};

export type PublishedSymbolFis =
  | { ok: true; previous: FisChangeSnapshot | null; next: FisChangeSnapshot }
  | { ok: false; code: string };

type PublishSymbol = () => Promise<PublishedSymbolFis>;
type InterpretNotice = (notice: FisChangeNotice) => Promise<string | null>;
type DispatchNotice = (supabase: FinanceClient) => Promise<unknown>;

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}

export function fisChangeRule(symbol: string, tracingNo: string): string {
  return clip(`تغییر ارزیابی ${symbol} · ${tracingNo}`, 200);
}

/** True only for a ن-۱۰ that was not the letter already stored for this symbol. */
export function isNewFinancialStatement(
  previousTracing: string | null,
  newest: Pick<CodalLetter, "tracingNo" | "letterCode" | "title"> | null,
): boolean {
  if (!previousTracing || !newest) return false;
  if (!isFinancialStatement(newest)) return false;
  return previousTracing !== String(newest.tracingNo);
}

export async function interpretStoredFisChange(userId: string, notice: FisChangeNotice): Promise<string | null> {
  const slot = takeRateSlot(`fis-change:${userId}`, Date.now(), INTERPRET_POLICY);
  if (!slot.ok) return null;
  return interpretFisChange(notice, completeChat);
}

/**
 * Scores one symbol after its new statement period is stored, then inserts at most one notice.
 * A second call for the same letter finds the tracing already stored, or the unique index rejects the row.
 */
export async function followSyncedStatement(input: {
  supabase: FinanceClient;
  userId: string;
  symbol: string;
  previousTracing: string | null;
  newest: Pick<CodalLetter, "tracingNo" | "letterCode" | "title"> | null;
  periodStored: boolean;
  publish: PublishSymbol;
  interpret?: InterpretNotice;
  dispatch?: DispatchNotice;
}): Promise<StatementFollowResult> {
  if (!input.periodStored || !isNewFinancialStatement(input.previousTracing, input.newest) || !input.newest) {
    return { scored: false, alerted: false };
  }

  let published: PublishedSymbolFis;
  try {
    published = await input.publish();
  } catch (error) {
    console.error(error);
    return { scored: false, alerted: false };
  }
  if (!published.ok) {
    console.error(`[fis] ${input.symbol} was not scored: ${published.code}`);
    return { scored: false, alerted: false };
  }

  const decision = fisChangeAlert(published.previous, published.next);
  if (!decision.alert || !published.previous) return { scored: true, alerted: false };

  const notice: FisChangeNotice = {
    symbol: input.symbol,
    previous: published.previous,
    next: published.next,
    decision,
  };
  let message = fisChangeMessage(notice);
  if (input.interpret) {
    try {
      const text = await input.interpret(notice);
      if (text) message = text;
    } catch (error) {
      console.error(error);
    }
  }

  const inserted = await input.supabase.from("alerts").insert({
    user_id: input.userId,
    kind: FIS_CHANGE_KIND,
    asset_type: "stock",
    rule: fisChangeRule(input.symbol, String(input.newest.tracingNo)),
    message,
    threshold: published.next.score ?? 0,
    channel: "in_app",
    frequency: "immediate",
    is_active: true,
  });
  if (inserted.error) {
    if (inserted.error.code !== "23505") console.error(inserted.error);
    return { scored: true, alerted: false };
  }

  try {
    const dispatch = input.dispatch ?? ((client: FinanceClient) => dispatchAlertNotifications(client));
    await dispatch(input.supabase);
  } catch (error) {
    console.error(error);
  }
  return { scored: true, alerted: true };
}
