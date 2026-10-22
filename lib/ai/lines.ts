function persianLines(text: string, count: number): string[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*]|\d{1,2}[.)])\s+/, "").trim())
    .filter(Boolean);
  if (lines.length !== count || lines.some((line) => line.length > 500)) return null;
  return lines;
}

export function fivePersianLines(text: string): string[] | null {
  return persianLines(text, 5);
}

export function threePersianLines(text: string): string[] | null {
  return persianLines(text, 3);
}
