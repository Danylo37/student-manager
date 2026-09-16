import { lessonDurationMinutes } from './constants';

export enum LessonStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  OVERDUE = 'OVERDUE',
  TRIAL = 'TRIAL',
}

export interface LessonFlags {
  isTrial: boolean;
  isCompleted: boolean;
  isPaid: boolean;
}

/** Status from the three flags: trial, then not held yet, then paid or not. */
export function lessonStatusOf({ isTrial, isCompleted, isPaid }: LessonFlags): LessonStatus {
  // A trial lesson is free, so payment never applies to it
  if (isTrial) return LessonStatus.TRIAL;
  if (!isCompleted) return LessonStatus.PENDING;
  return isPaid ? LessonStatus.PAID : LessonStatus.OVERDUE;
}

const LABELS: Record<LessonStatus, string> = {
  [LessonStatus.PAID]: 'Проведено та оплачено',
  [LessonStatus.PENDING]: 'Заплановано',
  [LessonStatus.OVERDUE]: 'Проведено, не оплачено',
  [LessonStatus.TRIAL]: 'Пробний урок',
};

const EMOJIS: Record<LessonStatus, string> = {
  [LessonStatus.PAID]: '🟢',
  [LessonStatus.PENDING]: '🟡',
  [LessonStatus.OVERDUE]: '🔴',
  [LessonStatus.TRIAL]: '🔵',
};

/** Get status label in Ukrainian */
export function getStatusLabel(status: LessonStatus): string {
  return LABELS[status] || 'Невідомо';
}

/** Get status emoji */
export function getStatusEmoji(status: LessonStatus): string {
  return EMOJIS[status] || '⚪';
}

/** Whether the lesson's end time has passed, so it should be marked completed. */
export function shouldBeCompleted(
  datetime: string,
  isTrial: boolean | number = false,
  now: Date = new Date(),
): boolean {
  const lessonEnd = new Date(datetime).getTime() + lessonDurationMinutes(isTrial) * 60 * 1000;
  return lessonEnd < now.getTime();
}
