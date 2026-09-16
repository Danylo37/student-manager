/** Ukrainian plural: pluralUA(2, 'урок', 'уроки', 'уроків') → 'уроки'. */
export function pluralUA(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const monthsWordUA = (n: number) => pluralUA(n, 'місяць', 'місяці', 'місяців');
export const lessonsWordUA = (n: number) => pluralUA(n, 'урок', 'уроки', 'уроків');
