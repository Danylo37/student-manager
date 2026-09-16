import { TZDate } from '@date-fns/tz';
import { addDays, addHours, format, startOfDay, startOfHour, startOfWeek } from 'date-fns';
import { uk } from 'date-fns/locale';
import { lessonDurationMinutes } from '@shared/constants';
import type { SnapshotLesson } from '@shared/types';

// Every date on screen is in the tutor's zone from the snapshot, never the
// phone's: a trip abroad must not shift the timetable. TZDate carries the zone,
// so date-fns getters and format() work in it and date-fns functions keep it;
// `new TZDate(date)` without a zone would switch to the phone's, and
// toISOString() would print an offset, so UTC strings go through a plain Date.

const WINDOW_BEFORE_DAYS = 7;
const WINDOW_AFTER_DAYS = 21;

export const zoned = (iso: string, tz: string) => new TZDate(iso, tz);

export const nowIn = (tz: string) => TZDate.tz(tz);

/** Calendar day as "yyyy-MM-dd" in the zone the date carries. */
export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

export const timeKey = (date: Date) => format(date, 'HH:mm');

export const timeOf = (iso: string, tz: string) => timeKey(zoned(iso, tz));

export const dateOf = (iso: string, tz: string) => format(zoned(iso, tz), 'd MMMM', { locale: uk });

/** "Сьогодні", "Завтра", "Вчора" or the weekday; the date is appended by the caller. */
export function relativeDayName(day: Date, today: Date): string {
  const diff = Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Сьогодні';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчора';
  return format(day, 'EEEE', { locale: uk });
}

export const weekStart = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });

export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** The next full hour: the default slot for a new lesson. Past 23:00 it is tomorrow. */
export const nextFullHour = (now: Date) => addHours(startOfHour(now), 1);

/** The days the snapshot covers: the desktop's window around the day it was built. */
export function snapshotWindow(generatedAt: string, tz: string): { first: Date; last: Date } {
  const built = startOfDay(zoned(generatedAt, tz));
  return { first: addDays(built, -WINDOW_BEFORE_DAYS), last: addDays(built, WINDOW_AFTER_DAYS) };
}

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
