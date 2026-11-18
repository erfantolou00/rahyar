export type Tone = "profit" | "loss" | "neutral";

export function toneOf(value: number | null | undefined): Tone {
  if (value == null || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "profit" : "loss";
}

export const toneClassName: Record<Tone, string> = {
  profit: "text-ok",
  loss: "text-danger",
  neutral: "text-muted-foreground",
};
