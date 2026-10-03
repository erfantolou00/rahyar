export type PriceSource = {
  name: string;
  run: () => Promise<number>;
};

export type FallbackSource<T> = {
  name: string;
  run: () => Promise<T>;
};

export async function fetchFirst<T>(
  sources: FallbackSource<T>[],
  accept: (value: T) => boolean,
  label: string,
): Promise<{ value: T; source: string } | null> {
  const failures: string[] = [];

  for (const source of sources) {
    try {
      const value = await source.run();
      if (!accept(value)) throw new Error("rejected value");
      return { value, source: source.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${source.name}: ${message}`);
      console.error(`[${label}] ${source.name} failed: ${message}`);
    }
  }

  console.error(`[${label}] all sources failed: ${failures.join(" | ")}`);
  return null;
}

export async function fetchWithFallback(
  sources: PriceSource[],
): Promise<{ price: number; source: string } | null> {
  const result = await fetchFirst(
    sources,
    (price) => {
      if (!Number.isFinite(price) || price <= 0) throw new Error("non-positive price");
      return true;
    },
    "prices",
  );
  return result ? { price: result.value, source: result.source } : null;
}
