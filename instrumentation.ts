export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV === "production") return;

  const globalState = globalThis as { rahyarPriceCron?: boolean };
  if (globalState.rahyarPriceCron) return;
  globalState.rahyarPriceCron = true;

  const run = async () => {
    const { refreshAllPrices } = await import("@/lib/finance/prices/refresh");
    await refreshAllPrices();
  };

  setTimeout(() => {
    run().catch((error) => console.error("[prices] startup refresh failed", error));
  }, 5_000);
  setInterval(() => {
    run().catch((error) => console.error("[prices] interval refresh failed", error));
  }, 15 * 60 * 1000);
}
