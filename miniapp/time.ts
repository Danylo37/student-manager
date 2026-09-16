import { TZDate } from '@date-fns/tz';
import { addDays, addHours, format, startOfWeek } from 'date-fns';
import { uk } from 'date-fns/locale';
import { lessonDurationMinutes } from '@shared/constants';
import type { SnapshotLesson } from '@shared/types';

// Every date on screen is in the tutor's zone from the snapshot, never the
// phone's: a trip abroad must not shift the timetable. TZDate carries the zone,
// so date-fns getters and format() work in it; toISOString() on it would print
// an offset, so UTC strings go through a plain Date.

export const zoned = (iso: string, tz: string) => new TZDate(iso, tz);

export const nowIn = (tz: string) => TZDate.tz(tz);

/** Calendar day as "yyyy-MM-dd" in the zone the date carries. */
export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export const timeOf = (iso: string, tz: string) => format(zoned(iso, tz), 'HH:mm');

export const dateOf = (iso: string, tz: string) => format(zoned(iso, tz), 'd MMMM', { locale: uk });

export const weekdayOf = (iso: string, tz: string) =>
  format(zoned(iso, tz), 'EEEEEE', { locale: uk });

/** "Сьогодні", "Завтра", "Вчора" or the weekday; the date is appended by the caller. */
export function relativeDayName(day: Date, today: Date): string {
  const diff = Math.round((dayStart(day).getTime() - dayStart(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Сьогодні';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчора';
  return format(day, 'EEEE', { locale: uk });
}

export const dayStart = (date: Date) => {
  const start = new TZDate(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const weekStart = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });

export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** "HH:00" of the next hour in the zone the date carries: the default slot for a new lesson. */
export const nextFullHour = (now: Date) =>
  format(addHours(dayStart(now), now.getHours() + 1), 'HH:mm');

/** "yyyy-MM-dd" plus "HH:mm" in the tutor's zone → UTC ISO as the desktop stores it. */
export function toUtcIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, tz).getTime()).toISOString();
}

/** The desktop's rule: intervals overlap, a trial lesson is shorter. */
export function findBusy(
  lessons: SnapshotLesson[],
  datetime: string,
  isTrial: boolean,
  exceptId: number | null = null,
): SnapshotLesson | null {
  const start = Date.parse(datetime);
  const end = start + lessonDurationMinutes(isTrial) * 60_000;
  return (
    lessons.find((l) => {
      if (l.id === exceptId) return false;
      const s = Date.parse(l.datetime);
      return s < end && s + lessonDurationMinutes(l.isTrial) * 60_000 > start;
    }) ?? null
  );
}

export const byDatetime = (a: { datetime: string }, b: { datetime: string }) =>
  a.datetime.localeCompare(b.datetime);
