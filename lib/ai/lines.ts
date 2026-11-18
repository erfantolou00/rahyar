export function fivePersianLines(text: string): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*]|\d{1,2}[.)])\s+/, "").trim())
    .filter(Boolean);
  if (lines.length !== 5 || lines.some((line) => line.length > 500)) return null;
  return lines;
}
