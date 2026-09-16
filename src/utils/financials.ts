import type { TaxSettings } from '@/types';

export { parseInputToKopiyky, kopiykyToInput, formatUAH } from '@shared/financials';

// # TAX CALCULATION  (all values in kopiyky)

export type EarningsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';

/** Average weeks in a month (52 / 12) — converts a weekly rate to a monthly one. */
export const WEEKS_PER_MONTH = 52 / 12;

/** Єдиний податок rate for ФОП group 3 — the default offered in settings. */
export const DEFAULT_SINGLE_TAX_RATE = 5;

/** Військовий збір rate — the default offered in settings. */
export const DEFAULT_MILITARY_TAX_RATE = 1;

export interface EarningsBreakdown {
  gross: number; // kopiyky
  net: number; // kopiyky
  taxTotal: number; // kopiyky
  percentageTaxAmount: number; // kopiyky (єдиний податок + military)
  singleTaxAmount: number; // kopiyky (єдиний податок)
  militaryTaxAmount: number; // kopiyky (military)
  fixedTaxAmount: number; // kopiyky (ESV)
}

/** Whether any tax is switched on. The settings row always exists, so a null check is not enough. */
export function hasAnyTax(settings: TaxSettings | null): boolean {
  if (!settings) return false;
  return (
    settings.esv_type !== 'none' || !!settings.single_tax_enabled || !!settings.military_tax_enabled
  );
}

/**
 * Calculate net earnings after taxes.
 * @param grossKopiyky  - gross income in kopiyky
 * @param tax           - tax settings (null = no taxes configured)
 * @param period        - used to pro-rate fixed monthly taxes
 * @param months        - how many months the fixed monthly tax (ЄСВ) is due for
 *                        inside the period. Use countChargeableMonths() to get it.
 *                        Omit to fall back to a whole calendar period.
 * @param taxableKopiyky - the part of the gross the percentage taxes are charged on.
 *                        Money from tax-exempt students is left out of it and goes
 *                        into the net whole. ЄСВ is fixed and stays untouched.
 */
export function calculateNetEarnings(
  grossKopiyky: number,
  tax: TaxSettings | null,
  period: EarningsPeriod = 'month',
  months?: number,
  taxableKopiyky: number = grossKopiyky,
): EarningsBreakdown {
  if (!tax) {
    return {
      gross: grossKopiyky,
      net: grossKopiyky,
      taxTotal: 0,
      percentageTaxAmount: 0,
      singleTaxAmount: 0,
      militaryTaxAmount: 0,
      fixedTaxAmount: 0,
    };
  }

  // Fixed monthly taxes (kopiyky/month)
  let fixedMonthlyKopiyky = 0;
  if (tax.esv_type === 'fixed') fixedMonthlyKopiyky += tax.esv_fixed;

  // Percentage taxes (applied to the taxable part of the gross)
  const singleRate = tax.single_tax_enabled ? (tax.single_tax_rate ?? 0) : 0;
  const militaryRate = tax.military_tax_enabled ? (tax.military_tax_rate ?? 0) : 0;

  // Fixed monthly taxes are charged per chargeable month (see countChargeableMonths).
  // Without that information, fall back to a whole calendar period.
  const fallbackMultiplier: Record<EarningsPeriod, number> = {
    day: 1 / 30,
    week: 1 / WEEKS_PER_MONTH,
    month: 1,
    quarter: 3,
    year: 12,
    all: 0,
  };

  const multiplier = months ?? fallbackMultiplier[period];
  const fixedTaxAmount = Math.round(fixedMonthlyKopiyky * multiplier);
  const singleTaxAmount = Math.round((taxableKopiyky * singleRate) / 100);
  const militaryTaxAmount = Math.round((taxableKopiyky * militaryRate) / 100);
  const percentageTaxAmount = singleTaxAmount + militaryTaxAmount;
  const taxTotal = fixedTaxAmount + percentageTaxAmount;
  const net = Math.max(0, grossKopiyky - taxTotal);

  return {
    gross: grossKopiyky,
    net,
    taxTotal,
    percentageTaxAmount,
    singleTaxAmount,
    militaryTaxAmount,
    fixedTaxAmount,
  };
}

/** Calendar month as a comparable integer. */
function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/**
 * How many months the fixed monthly tax (ЄСВ) is due for inside a period.
 *
 * A ФОП pays ЄСВ every month regardless of income, so months without lessons
 * count too. Two limits keep the number honest:
 *  - nothing is charged before `taxStart`, the month ЄСВ was switched on in the
 *    settings, so the months from before it stay untaxed;
 *  - nothing is charged for months that have not happened yet, so a year viewed
 *    in July charges 7 months, not 12.
 *
 * Day and week periods are shorter than a month and stay proportional instead.
 *
 * @param taxStart    - YYYY-MM-DD, first day of the month ЄСВ is counted from
 *                      (tax_settings.esv_since), or null while it is off
 * @param periodStart - ISO start of the period (inclusive)
 * @param periodEnd   - ISO end of the period (exclusive)
 */
function countChargeableMonths(
  taxStart: string | null | undefined,
  periodStart: string,
  periodEnd: string,
  now: Date = new Date(),
): number {
  if (!taxStart) return 0;

  // periodEnd is exclusive, so the last month inside the period is the one
  // containing the day before it.
  const lastDay = new Date(periodEnd);
  lastDay.setDate(lastDay.getDate() - 1);

  const first = Math.max(monthIndex(fromInputDate(taxStart)), monthIndex(new Date(periodStart)));
  const last = Math.min(monthIndex(lastDay), monthIndex(now));

  return Math.max(0, last - first + 1);
}

/**
 * Fixed-tax multiplier for a period: whole months for month/quarter/year/all,
 * a fraction of a month for day/week. Returns 0 while ЄСВ is off (no start month).
 */
export function getFixedTaxMonths(
  period: EarningsPeriod,
  taxStart: string | null | undefined,
  periodStart: string,
  periodEnd: string,
  now: Date = new Date(),
): number {
  if (!taxStart) return 0;

  if (period === 'day' || period === 'week') {
    // Only charge once the period has actually reached the tax start month.
    const started = monthIndex(new Date(periodStart)) >= monthIndex(fromInputDate(taxStart));
    const notFuture = new Date(periodStart) <= now;
    if (!started || !notFuture) return 0;
    return period === 'day' ? 1 / 30 : 1 / WEEKS_PER_MONTH;
  }

  return countChargeableMonths(taxStart, periodStart, periodEnd, now);
}

// # DATE RANGES

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

// # MISC HELPERS

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
