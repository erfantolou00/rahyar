"use client";

import { useActionState } from "react";
import { rebuildFundamentalHistory } from "@/app/(dashboard)/basket/history-actions";
import { Button } from "@/components/ui/button";

export function RebuildHistoryButton() {
  const [state, action, pending] = useActionState(rebuildFundamentalHistory, null);
  return (
    <form action={action} className="grid gap-2">
      <Button type="submit" variant="outline" disabled={pending} className="h-11 w-fit px-4">
        {pending ? "در حال بازسازی تاریخچه..." : "بازسازی تاریخچه"}
      </Button>
      {state ? (
        <div className="grid gap-1">
          <p className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-warn"}>{state.message}</p>
          {state.gaps.length > 0 ? (
            <ul className="grid gap-1">
              {state.gaps.map((gap, index) => (
                <li key={`${index}-${gap}`} className="text-sm leading-7 text-warn">{gap}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
