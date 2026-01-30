import { LESSON_DURATION_MINUTES } from './constants';
import type { Lesson } from '@/types';

/**
 * Lesson status constants
 */
export enum LessonStatus {
    PAID = 'PAID',
    PENDING = 'PENDING',
    OVERDUE = 'OVERDUE',
}

/**
 * Get lesson status based on payment and time
 */
export function getLessonStatus(lesson: Lesson): LessonStatus {
    // If not completed yet, always yellow (pending)
    if (!lesson.is_completed) {
        return LessonStatus.PENDING;
    }

    // If completed and paid, green
    if (lesson.is_paid) {
        return LessonStatus.PAID;
    }

    // If completed and not paid, red
    return LessonStatus.OVERDUE;
}

/**
 * Get status border color (Tailwind class)
 */
export function getStatusBorderColor(status: LessonStatus): string {
    const colors: Record<LessonStatus, string> = {
        [LessonStatus.PAID]: 'border-green-500',
        [LessonStatus.PENDING]: 'border-yellow-500',
        [LessonStatus.OVERDUE]: 'border-red-500',
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
    };
    return colors[status] || 'bg-gray-50';
}

/**
 * Get status label in Ukrainian
 */
export function getStatusLabel(status: LessonStatus): string {
    const labels: Record<LessonStatus, string> = {
        [LessonStatus.PAID]: 'Проведено та оплачено',
        [LessonStatus.PENDING]: 'Заплановано',
        [LessonStatus.OVERDUE]: 'Проведено, не оплачено',
    };
    return labels[status] || 'Невідомо';
}

/**
 * Get status emoji
 */
export function getStatusEmoji(status: LessonStatus): string {
    const emojis: Record<LessonStatus, string> = {
        [LessonStatus.PAID]: '🟢',
        [LessonStatus.PENDING]: '🟡',
        [LessonStatus.OVERDUE]: '🔴',
    };
    return emojis[status] || '⚪';
}

/**
 * Check if lesson should be marked as completed
 */
export function shouldBeCompleted(datetime: string): boolean {
    const now = new Date();
    const lessonDate = new Date(datetime);

    const lessonEndTime = new Date(lessonDate.getTime() + LESSON_DURATION_MINUTES * 60 * 1000);
    return lessonEndTime < now;
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
