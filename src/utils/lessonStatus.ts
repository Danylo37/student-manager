import { LessonStatus, lessonStatusOf } from '@shared/lessonStatus';
import type { Lesson } from '@/types';

export {
  LessonStatus,
  getStatusLabel,
  getStatusEmoji,
  shouldBeCompleted,
} from '@shared/lessonStatus';

/**
 * Get lesson status based on payment and time
 */
export function getLessonStatus(lesson: Lesson): LessonStatus {
  return lessonStatusOf({
    isTrial: !!lesson.is_trial,
    isCompleted: !!lesson.is_completed,
    isPaid: !!lesson.is_paid,
  });
}

/**
 * Get status border color (Tailwind class)
 */
export function getStatusBorderColor(status: LessonStatus): string {
  const colors: Record<LessonStatus, string> = {
    [LessonStatus.PAID]: 'border-green-500',
    [LessonStatus.PENDING]: 'border-yellow-500',
    [LessonStatus.OVERDUE]: 'border-red-500',
    [LessonStatus.TRIAL]: 'border-blue-500',
  };
  return colors[status] || 'border-gray-500';
}

/**
 * Get status background color light (Tailwind class)
 */
export function getStatusBgLight(status: LessonStatus): string {
  const colors: Record<LessonStatus, string> = {
    [LessonStatus.PAID]: 'bg-green-50',
    [LessonStatus.PENDING]: 'bg-yellow-50',
    [LessonStatus.OVERDUE]: 'bg-red-50',
    [LessonStatus.TRIAL]: 'bg-blue-50',
  };
  return colors[status] || 'bg-gray-50';
}

/**
 * Check if lesson is today
 */
export function isToday(datetime: string): boolean {
  const now = new Date();
  const lessonDate = new Date(datetime);

  return (
    now.getDate() === lessonDate.getDate() &&
    now.getMonth() === lessonDate.getMonth() &&
    now.getFullYear() === lessonDate.getFullYear()
  );
}
