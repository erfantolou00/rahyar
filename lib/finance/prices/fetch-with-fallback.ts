export type PriceSource = {
  name: string;
  run: () => Promise<number>;
};

export async function fetchWithFallback(
  sources: PriceSource[],
): Promise<{ price: number; source: string } | null> {
  const failures: string[] = [];

  for (const source of sources) {
    try {
      const price = await source.run();
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("non-positive price");
      }
      return { price, source: source.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${source.name}: ${message}`);
      console.error(`[prices] ${source.name} failed: ${message}`);
    }
  }

  console.error(`[prices] all sources failed: ${failures.join(" | ")}`);
  return null;
}
