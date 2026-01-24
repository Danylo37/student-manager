/**
 * Lesson status constants
 */
export const LESSON_STATUS = {
    PAID: 'PAID',
    PENDING: 'PENDING',
    OVERDUE: 'OVERDUE',
};

/**
 * Get lesson status based on payment and time
 * @param {Object} lesson - Lesson object from database
 * @param {boolean} lesson.is_paid - Is lesson paid
 * @param {boolean} lesson.is_completed - Is lesson completed
 * @returns {string} - Status: 'PAID' | 'PENDING' | 'OVERDUE'
 */
export function getLessonStatus(lesson) {
    // If not completed yet, always yellow (pending)
    if (!lesson.is_completed) {
        return LESSON_STATUS.PENDING;
    }

    // If completed and paid, green
    if (lesson.is_paid) {
        return LESSON_STATUS.PAID;
    }

    // If completed and not paid, red
    return LESSON_STATUS.OVERDUE;
}

/**
 * Get status border color (Tailwind class)
 * @param {string} status - Status from getLessonStatus()
 * @returns {string} - Tailwind border color class
 */
export function getStatusBorderColor(status) {
    const colors = {
        [LESSON_STATUS.PAID]: 'border-green-500',
        [LESSON_STATUS.PENDING]: 'border-yellow-500',
        [LESSON_STATUS.OVERDUE]: 'border-red-500',
    };
    return colors[status] || 'border-gray-500';
}

/**
 * Get status background color light (Tailwind class)
 * @param {string} status - Status from getLessonStatus()
 * @returns {string} - Tailwind light background color class
 */
export function getStatusBgLight(status) {
    const colors = {
        [LESSON_STATUS.PAID]: 'bg-green-50',
        [LESSON_STATUS.PENDING]: 'bg-yellow-50',
        [LESSON_STATUS.OVERDUE]: 'bg-red-50',
    };
    return colors[status] || 'bg-gray-50';
}

/**
 * Get status label in Ukrainian
 * @param {string} status - Status from getLessonStatus()
 * @returns {string} - Ukrainian status text
 */
export function getStatusLabel(status) {
    const labels = {
        [LESSON_STATUS.PAID]: 'Проведено та оплачено',
        [LESSON_STATUS.PENDING]: 'Заплановано',
        [LESSON_STATUS.OVERDUE]: 'Проведено, не оплачено',
    };
    return labels[status] || 'Невідомо';
}

/**
 * Get status emoji
 * @param {string} status - Status from getLessonStatus()
 * @returns {string} - Emoji icon
 */
export function getStatusEmoji(status) {
    const emojis = {
        [LESSON_STATUS.PAID]: '🟢',
        [LESSON_STATUS.PENDING]: '🟡',
        [LESSON_STATUS.OVERDUE]: '🔴',
    };
    return emojis[status] || '⚪';
}

/**
 * Check if lesson should be marked as completed
 * @param {string} datetime - Lesson datetime in ISO format
 * @returns {boolean} - true if lesson time + duration (50 minutes) has passed
 */
export function shouldBeCompleted(datetime) {
    const now = new Date();
    const lessonDate = new Date(datetime);
    const lessonDurationMinutes = 50;

    const lessonEndTime = new Date(lessonDate.getTime() + lessonDurationMinutes * 60 * 1000);
    return lessonEndTime < now;
}

/**
 * Check if lesson is today
 * @param {string} datetime - Lesson datetime in ISO format
 * @returns {boolean} - true if lesson is today
 */
export function isToday(datetime) {
    const now = new Date();
    const lessonDate = new Date(datetime);

    return (
        now.getDate() === lessonDate.getDate() &&
        now.getMonth() === lessonDate.getMonth() &&
        now.getFullYear() === lessonDate.getFullYear()
    );
}
