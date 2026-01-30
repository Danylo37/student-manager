import { startOfWeek, addDays, format, isSameDay, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';

/**
 * Get the start of the week (Monday)
 */
export function getWeekStart(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

/**
 * Get array of 7 days of the week
 */
export function getWeekDays(weekStart: Date): Date[] {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
        days.push(addDays(weekStart, i));
    }
    return days;
}

/**
 * Format date for display in DD.MM.YYYY format (Ukrainian standard)
 */
export function formatDate(date: Date, formatStr: string = 'dd.MM.yyyy'): string {
    return format(date, formatStr, { locale: uk });
}

/**
 * Format date with month name in Ukrainian
 */
export function formatDateWithMonth(date: Date): string {
    return format(date, 'dd MMMM', { locale: uk });
}

/**
 * Format day of week short (first 2 letters)
 */
export function formatDayOfWeekShort(date: Date): string {
    return format(date, 'EEEEEE', { locale: uk });
}

/**
 * Format time
 */
export function formatTime(datetime: Date | string): string {
    const date = typeof datetime === 'string' ? parseISO(datetime) : datetime;
    return format(date, 'HH:mm');
}

/**
 * Check if two dates are the same day (ignoring time)
 */
export function isSameDayAs(date1: Date | string, date2: Date | string): boolean {
    const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
    const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
    return isSameDay(d1, d2);
}

/**
 * Get week date range in ISO format for database queries
 */
export function getWeekRange(weekStart: Date): { start: string; end: string } {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);

    const end = addDays(start, 7);

    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
}
