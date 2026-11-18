import { Card } from "@/components/dashboard/card";
import { toneClassName, type Tone } from "@/lib/overview/tone";
import { cn } from "cn";

export function KpiTile({
  label,
  value,
  unit,
  hint,
  emphasis = false,
  valueTone = "neutral",
  delta,
  density = "regular",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  emphasis?: boolean;
  valueTone?: Tone;
  delta?: { text: string; tone: Tone };
  density?: "regular" | "compact";
}) {
  const compact = density === "compact";
  return (
    <Card
      density={density}
      className={
        emphasis
          ? "relative overflow-hidden bg-linear-to-bl from-primary/10 to-card before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary/80"
          : undefined
      }
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={compact ? "mt-1" : "mt-3"}>
        <p
          className={cn(
            "numeric font-semibold tracking-tight",
            compact ? "text-xl leading-6" : emphasis ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
            valueTone === "neutral" ? "text-foreground" : toneClassName[valueTone],
          )}
        >
          {value}
        </p>
        {unit ? <p className="mt-1 text-xs text-muted-foreground">{unit}</p> : null}
      </div>
      {delta ? <p className={cn("numeric mt-2 text-sm", toneClassName[delta.tone])}>{delta.text}</p> : null}
      {hint ? <p className="mt-2 text-xs leading-6 text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
