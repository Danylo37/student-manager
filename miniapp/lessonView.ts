import {
  getStatusLabel,
  LessonStatus,
  lessonStatusOf,
  shouldBeCompleted,
} from '@shared/lessonStatus';
import { lessonsWordUA } from '@shared/plural';
import type { LessonHint } from '@shared/types';
import type { ViewLesson, ViewStudent } from './overlay';

const PENDING_LABEL = {
  add: 'Очікує ПК',
  move: 'Переноситься · очікує ПК',
  delete: 'Видаляється · очікує ПК',
  pay: 'Оплачено · очікує ПК',
  complete: 'Проведено · очікує ПК',
};

/** What the desktop needs to name the lesson in its history once the row is gone. */
export const lessonHint = (lesson: ViewLesson): LessonHint => ({
  studentName: lesson.studentName,
  datetime: lesson.datetime,
  isTrial: lesson.isTrial,
});

export function lessonTitle(lesson: ViewLesson): string {
  if (lesson.isTrial)
    return lesson.studentName ? `${lesson.studentName} (пробний)` : 'Пробний урок';
  return lesson.studentName ?? 'Видалений учень';
}

/**
 * Dot colour and the line under the name. A lesson whose time has passed but
 * which the desktop has not confirmed yet is "мав відбутися": the desktop marks
 * it held (and paid, when the balance allows) the moment it is on.
 */
export function lessonState(
  lesson: ViewLesson,
  now: Date,
): { status: LessonStatus | 'gray'; label: string } {
  const status = lessonStatusOf(lesson);
  if (lesson.pending) return { status, label: PENDING_LABEL[lesson.pending] };
  if (status === LessonStatus.PENDING && shouldBeCompleted(lesson.datetime, false, now)) {
    return { status: 'gray', label: 'Мав відбутися' };
  }
  return { status, label: getStatusLabel(status) };
}

export function balanceStatus(student: ViewStudent): LessonStatus {
  if (student.balance < 0) return LessonStatus.OVERDUE;
  if (student.balance === 0) return LessonStatus.PENDING;
  return LessonStatus.PAID;
}

/** "3 уроки", "борг 2 уроки", "0 уроків". */
export function balanceText(balance: number): string {
  const n = Math.abs(balance);
  const words = `${n} ${lessonsWordUA(n)}`;
  return balance < 0 ? `борг ${words}` : words;
}
