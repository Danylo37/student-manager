// KOPIYKY HELPERS
// All monetary values in the DB and in IPC are INTEGER kopiyky (1 ₴ = 100 копійок).

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
