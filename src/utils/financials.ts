import type { TaxSettings } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// KOPIYKY HELPERS
// All monetary values in the DB are stored as INTEGER kopiyky (1 ₴ = 100 копійок).
// ─────────────────────────────────────────────────────────────────────────────

/** Parse user text input ("350", "350.50", "350,50") to kopiyky integer. Returns null if invalid. */
export function parseInputToKopiyky(str: string): number | null {
  const cleaned = str.replace(',', '.').trim();
  if (cleaned === '' || cleaned === '.') return null;
  const value = parseFloat(cleaned);
  if (isNaN(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Convert kopiyky to a string suitable for <input> value ("350.50"). */
export function kopiykyToInput(kopiyky: number): string {
  return (kopiyky / 100).toFixed(2);
}

/** Format kopiyky as "1 234,56 ₴" (Ukrainian locale, always 2 decimals). */
export function formatUAH(kopiyky: number): string {
  const hryvnias = kopiyky / 100;
  return (
    hryvnias.toLocaleString('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ₴'
  );
}

/** Format kopiyky as "1 234 ₴" (no decimals, for whole hryvnias). */
export function formatUAHWhole(kopiyky: number): string {
  return Math.round(kopiyky / 100).toLocaleString('uk-UA') + ' ₴';
}

// ─────────────────────────────────────────────────────────────────────────────
// TAX CALCULATION  (all values in kopiyky)
// ─────────────────────────────────────────────────────────────────────────────

export type EarningsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface EarningsBreakdown {
  gross: number; // kopiyky
  net: number; // kopiyky
  taxTotal: number; // kopiyky
  percentageTaxAmount: number; // kopiyky (military)
  fixedTaxAmount: number; // kopiyky (ESV)
}

/**
 * Calculate net earnings after taxes.
 * @param grossKopiyky  - gross income in kopiyky
 * @param tax           - tax settings (null = no taxes configured)
 * @param period        - used to pro-rate fixed monthly taxes
 * @param monthsCount   - actual number of months with income inside the period.
 *                        For month/quarter/year/all the fixed monthly tax (ЄСВ) is
 *                        charged for the months that really happened, so a year
 *                        viewed in July shows ЄСВ × 7, not ЄСВ × 12.
 */
export function calculateNetEarnings(
  grossKopiyky: number,
  tax: TaxSettings | null,
  period: EarningsPeriod = 'month',
  monthsCount?: number,
): EarningsBreakdown {
  if (!tax) {
    return {
      gross: grossKopiyky,
      net: grossKopiyky,
      taxTotal: 0,
      percentageTaxAmount: 0,
      fixedTaxAmount: 0,
    };
  }

  // Fixed monthly taxes (kopiyky/month)
  let fixedMonthlyKopiyky = 0;
  if (tax.esv_type === 'fixed') fixedMonthlyKopiyky += tax.esv_fixed;

  // Percentage taxes (applied to gross)
  let percentageRate = 0;
  if (tax.military_tax_enabled) percentageRate += tax.military_tax_rate;

  // Pro-rate fixed taxes to the period.
  // Day/week are fractions of a month, so they stay proportional.
  // Month/quarter/year/all are charged per actual month with income.
  const fallbackMultiplier: Record<EarningsPeriod, number> = {
    day: 1 / 30,
    week: 1 / 4.33,
    month: 1,
    quarter: 3,
    year: 12,
    all: 0,
  };

  const usesActualMonths = period === 'month' || period === 'quarter' || period === 'year' || period === 'all';
  const multiplier =
    usesActualMonths && monthsCount !== undefined ? monthsCount : fallbackMultiplier[period];

  const fixedTaxAmount = Math.round(fixedMonthlyKopiyky * multiplier);
  const percentageTaxAmount = Math.round((grossKopiyky * percentageRate) / 100);
  const taxTotal = fixedTaxAmount + percentageTaxAmount;
  const net = Math.max(0, grossKopiyky - taxTotal);

  return { gross: grossKopiyky, net, taxTotal, percentageTaxAmount, fixedTaxAmount };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE RANGES
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRange {
  start: string; // ISO (inclusive)
  end: string; // ISO (exclusive)
  label: string;
}

const MONTHS_UA = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];
const MONTHS_UA_GEN = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

/** Date range for a specific day. */
export function getDayRange(date: Date): DateRange {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label: string;
  if (start.getTime() === today.getTime()) label = 'Сьогодні';
  else if (start.getTime() === yesterday.getTime()) label = 'Вчора';
  else label = `${start.getDate()} ${MONTHS_UA_GEN[start.getMonth()]} ${start.getFullYear()}`;

  return { start: start.toISOString(), end: end.toISOString(), label };
}

/**
 * Date range for a period with offset.
 * offset=0 → current, offset=-1 → previous, etc.
 */
export function getDateRangeForPeriod(period: EarningsPeriod, offset = 0): DateRange {
  const now = new Date();

  if (period === 'day') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return getDayRange(d);
  }

  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7);
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);
    const label =
      offset === 0 ? 'Цей тиждень' : offset === -1 ? 'Минулий тиждень' : fmtShort(monday);
    return { start: monday.toISOString(), end: sunday.toISOString(), label };
  }

  if (period === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() + offset);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label =
      offset === 0
        ? 'Цей місяць'
        : offset === -1
          ? 'Минулий місяць'
          : `${MONTHS_UA[d.getMonth()]} ${d.getFullYear()}`;
    return { start: start.toISOString(), end: end.toISOString(), label };
  }

  if (period === 'quarter') {
    const d = new Date(now);
    const totalMonths = d.getFullYear() * 12 + d.getMonth() + offset * 3;
    const year = Math.floor(totalMonths / 12);
    const month = totalMonths % 12;
    const q = Math.floor(month / 3);
    const startMonth = q * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 1);
    const qNum = q + 1;
    const label =
      offset === 0
        ? `${qNum} квартал ${year}`
        : offset === -1
          ? 'Попередній квартал'
          : `${qNum} кв. ${year}`;
    return { start: start.toISOString(), end: end.toISOString(), label };
  }

  if (period === 'year') {
    const year = now.getFullYear() + offset;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const label = offset === 0 ? 'Цей рік' : String(year);
    return { start: start.toISOString(), end: end.toISOString(), label };
  }

  // 'all'
  return {
    start: new Date(2020, 0, 1).toISOString(),
    end: new Date(now.getFullYear() + 1, 0, 1).toISOString(),
    label: 'Весь час',
  };
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// MISC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Format a percentage change: "+12%" or "−5%" */
export function formatChange(
  current: number,
  previous: number,
): { text: string; positive: boolean; neutral: boolean } {
  if (previous === 0) {
    if (current === 0) return { text: '—', positive: false, neutral: true };
    return { text: '+100%', positive: true, neutral: false };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? '+' : ''}${pct}%`, positive: pct >= 0, neutral: false };
}

/** Price per lesson from a bundle (in kopiyky). */
export function pricePerLesson(totalKopiyky: number, lessonsCount: number): number {
  return Math.round(totalKopiyky / lessonsCount);
}

/** Convert Date to YYYY-MM-DD for <input type="date"> */
export function toInputDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD from <input type="date"> to local Date */
export function fromInputDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
