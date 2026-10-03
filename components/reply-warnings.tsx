import { TriangleAlert } from "lucide-react";
import { replyWarningLabels, type ReplyWarning } from "@/lib/ai/reply-warnings";

export function ReplyWarnings({ warnings }: { warnings: ReplyWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-2 grid gap-1.5">
      {warnings.map((warning) => (
        <li
          key={warning}
          className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-6 text-warn"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{replyWarningLabels[warning]}</span>
        </li>
      ))}
    </ul>
  );
}
