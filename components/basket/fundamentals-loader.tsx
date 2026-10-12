"use client";

import { useEffect, useRef, useState } from "react";
import { FundamentalsPanel } from "@/components/basket/fundamentals-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PresentedFundamental } from "@/lib/finance/basket-view";

type Ready = {
  status: "ready";
  rows: PresentedFundamental[];
  schemaIssue: boolean | null;
};

type State = { status: "idle" | "loading" | "error" } | Ready;

export function FundamentalsLoader({ enabled }: { enabled: boolean }) {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<State>({ status: "idle" });
  const loaded = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    if (!loaded.current) setState({ status: "loading" });
    void fetch("/api/basket/fundamentals")
      .then(async (response) => {
        if (!response.ok) throw new Error("fundamentals");
        return (await response.json()) as { rows: PresentedFundamental[]; schemaIssue: boolean | null };
      })
      .then((body) => {
        if (ignore) return;
        loaded.current = true;
        setState({ status: "ready", rows: body.rows, schemaIssue: body.schemaIssue });
      })
      .catch(() => {
        if (!ignore && !loaded.current) setState({ status: "error" });
      });
    return () => {
      ignore = true;
    };
  }, [enabled, request]);

  if (state.status === "ready") {
    return <FundamentalsPanel rows={state.rows} schemaIssue={state.schemaIssue} />;
  }
  if (!enabled) return null;
  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="grid gap-3 py-8 text-sm text-muted-foreground">
          <p>شاخص‌های بنیادی خوانده نشد.</p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                loaded.current = false;
                setState({ status: "idle" });
                setRequest((current) => current + 1);
              }}
            >
              تلاش دوباره
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8 text-sm text-muted-foreground" aria-busy="true">
        در حال خواندن شاخص‌های بنیادی...
      </CardContent>
    </Card>
  );
}
