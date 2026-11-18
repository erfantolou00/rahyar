/** Typed contract for non-CSS consumers. Runtime colors stay in app/globals.css. */
export const fontFamily = {
  sans: "Vazirmatn, Inter, ui-sans-serif, system-ui, sans-serif",
  numeric: "Vazirmatn, Inter, ui-sans-serif, system-ui, sans-serif",
} as const;

export const space = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  card: "1.25rem",
  section: "1rem",
  lg: "1.5rem",
} as const;

export const radius = {
  sm: "0.5rem",
  md: "0.75rem",
  card: "1.125rem",
  pill: "999px",
} as const;

export const colorVar = {
  background: "var(--background)",
  surface: "var(--card)",
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  line: "var(--line)",
  profit: "var(--ok)",
  loss: "var(--danger)",
  warning: "var(--warn)",
  accent: "var(--primary)",
} as const;

export const chartPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export function chartColor(index: number): string {
  return chartPalette[index % chartPalette.length] ?? chartPalette[0];
}
