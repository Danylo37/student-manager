import {
    startOfWeek,
    addDays,
    format,
    isSameDay,
    parseISO
} from 'date-fns';
import { uk } from 'date-fns/locale'; // Ukrainian locale

/**
 * Get the start of the week (Monday)
 * @param {Date} date - Any date
 * @returns {Date} - Monday of this week
 */
export function getWeekStart(date) {
    return startOfWeek(date, { weekStartsOn: 1 });
}
/**
 * Get array of 7 days of the week
 * @param {Date} weekStart - Monday
 * @returns {Date[]} - Array [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
 */
export function getWeekDays(weekStart) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        days.push(addDays(weekStart, i));
    }
    return days;
}
/**
 * Format date for display in DD.MM.YYYY format (Ukrainian standard)
 * @param {Date} date - Date object
 * @param {string} formatStr - Format string (default: 'dd.MM.yyyy')
 * @returns {string} - Formatted date like "31.01.2026"
 */
export function formatDate(date, formatStr = 'dd.MM.yyyy') {
    return format(date, formatStr, { locale: uk });
}

/**
 * Format date with month name in Ukrainian
 * @param {Date} date - Date object
 * @returns {string} - Formatted date like "31 січня"
 */
export function formatDateWithMonth(date) {
    return format(date, 'dd MMMM', { locale: uk });
}
/**
 * Format day of week short (first 2 letters)
 * @param {Date} date - Date object
 * @returns {string} - Short day name like "Пн"
 */
export function formatDayOfWeekShort(date) {
    return format(date, 'EEEEEE', { locale: uk });
}

/**
 * Format time
 * @param {Date|string} datetime - Date/time object or ISO string
 * @returns {string} - Time in "10:00" format
 */
export function formatTime(datetime) {
    const date = typeof datetime === 'string' ? parseISO(datetime) : datetime;
    return format(date, 'HH:mm');
}

/**
 * Create full datetime ISO string for database
 * @param {Date} date - Date object
 * @param {string} time - Time string in "10:00" format
 * @returns {string} - ISO string "2026-01-20T10:00:00.000Z"
 */
export function createDateTime(date, time) {
    const [hours, minutes] = time.split(':');
    const datetime = new Date(date);
    datetime.setHours(parseInt(hours, 10));
    datetime.setMinutes(parseInt(minutes, 10));
    datetime.setSeconds(0);
    datetime.setMilliseconds(0);
    return datetime.toISOString();
}

/**
 * Check if two dates are the same day (ignoring time)
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} - true if same day
 */
export function isSameDayAs(date1, date2) {
    const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
    const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
    return isSameDay(d1, d2);
}

/**
 * Get week date range in ISO format for database queries
 * @param {Date} weekStart - Monday
 * @returns {Object} - { start: "2026-01-20T00:00:00.000Z", end: "2026-01-27T00:00:00.000Z" }
 */
export function getWeekRange(weekStart) {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);

    const end = addDays(start, 7);

    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}
