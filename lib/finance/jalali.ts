const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

export type JalaliDate = { jy: number; jm: number; jd: number };
export type GregorianDate = { gy: number; gm: number; gd: number };

const monthNames = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

function div(a: number, b: number): number {
  return ~~(a / b);
}

function mod(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0] ?? 0;
  if (jy < jp || jy >= (breaks[bl - 1] ?? 0)) {
    throw new Error("Invalid Jalaali year");
  }

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i] ?? 0;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const jdn = g2d(gy, gm, gd);
  const gyYear = d2g(jdn).gy;
  let jy = gyYear - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gyYear, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function jalaliMonthName(jm: number): string {
  return monthNames[jm - 1] ?? "";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function gregorianIso(gy: number, gm: number, gd: number): string {
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export function parseIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const gy = Number(match[1]);
  const gm = Number(match[2]);
  const gd = Number(match[3]);
  if (gy < 1921 || gy > 2100 || gm < 1 || gm > 12 || gd < 1 || gd > 31) return null;
  try {
    const jalali = gregorianToJalali(gy, gm, gd);
    const back = jalaliToGregorian(jalali.jy, jalali.jm, jalali.jd);
    if (back.gy !== gy || back.gm !== gm || back.gd !== gd) return null;
    return gregorianIso(gy, gm, gd);
  } catch {
    return null;
  }
}

export function isoToJalali(iso: string): JalaliDate | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const [gy, gm, gd] = parsed.split("-").map(Number);
  if (!gy || !gm || !gd) return null;
  return gregorianToJalali(gy, gm, gd);
}

function persianNumber(value: number, width: number): string {
  return String(value)
    .padStart(width, "0")
    .replace(/\d/g, (digit) => persianDigits[Number(digit)] ?? digit);
}

export function formatJalaliYear(jy: number): string {
  return persianNumber(jy, 4);
}

export function formatJalali(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = isoToJalali(iso.slice(0, 10));
  if (!date) return "—";
  return `${persianNumber(date.jy, 4)}/${persianNumber(date.jm, 2)}/${persianNumber(date.jd, 2)}`;
}

export function weekdayIndex(gy: number, gm: number, gd: number): number {
  const day = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return (day + 1) % 7;
}
