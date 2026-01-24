import { useMemo, useCallback } from 'react';
import useAppStore from '../store/appStore';
import { isSameDayAs } from '../utils/dateHelpers';
import { getLessonStatus, LESSON_STATUS } from '../utils/lessonStatus';

/**
 * Hook for working with lessons
 * Provides convenient methods and filtered data
 */
function useLessons() {
    // Get state from store
    const lessons = useAppStore((state) => state.lessons);
    const lessonsLoading = useAppStore((state) => state.lessonsLoading);
    const lessonsError = useAppStore((state) => state.lessonsError);
    const currentWeek = useAppStore((state) => state.currentWeek);

    // Get actions from store
    const loadLessons = useAppStore((state) => state.loadLessons);
    const addLesson = useAppStore((state) => state.addLesson);
    const updateLesson = useAppStore((state) => state.updateLesson);
    const deleteLesson = useAppStore((state) => state.deleteLesson);
    const nextWeek = useAppStore((state) => state.nextWeek);
    const prevWeek = useAppStore((state) => state.prevWeek);
    const goToToday = useAppStore((state) => state.goToToday);

    /**
     * Get lessons for specific date
     * @param {Date} date - Date to filter
     * @returns {Array} - Lessons for this date
     */
    const getLessonsForDate = useCallback(
        (date) => {
            return lessons
                .filter((lesson) => isSameDayAs(lesson.datetime, date))
                .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
        },
        [lessons],
    );

    /**
     * Get lessons for specific student
     * @param {number} studentId - Student ID
     * @returns {Array} - Student's lessons
     */
    const getLessonsForStudent = useCallback(
        (studentId) => {
            return lessons.filter((lesson) => lesson.student_id === studentId);
        },
        [lessons],
    );

    /**
     * Get lesson by ID
     */
    const getLessonById = useCallback(
        (lessonId) => {
            return lessons.find((l) => l.id === lessonId);
        },
        [lessons],
    );

    /**
     * Get lessons grouped by status
     */
    const lessonsByStatus = useMemo(() => {
        const grouped = {
            [LESSON_STATUS.PAID]: [],
            [LESSON_STATUS.PENDING]: [],
            [LESSON_STATUS.OVERDUE]: [],
        };

        lessons.forEach((lesson) => {
            const status = getLessonStatus(lesson);
            grouped[status].push(lesson);
        });

        return grouped;
    }, [lessons]);

    /**
     * Get lessons statistics
     */
    const stats = useMemo(() => {
        const total = lessons.length;
        const paid = lessonsByStatus[LESSON_STATUS.PAID].length;
        const pending = lessonsByStatus[LESSON_STATUS.PENDING].length;
        const overdue = lessonsByStatus[LESSON_STATUS.OVERDUE].length;
        const completed = lessons.filter((l) => l.is_completed).length;

        return {
            total,
            paid,
            pending,
            overdue,
            completed,
            notCompleted: total - completed,
        };
    }, [lessons, lessonsByStatus]);

    /**
     * Check if there are lessons on specific date
     */
    const hasLessonsOnDate = useCallback(
        (date) => {
            return lessons.some((lesson) => isSameDayAs(lesson.datetime, date));
        },
        [lessons],
    );

    /**
     * Get next available time slot for a date
     * Returns suggested time (e.g., last lesson time + 1 hour)
     * For today's date, returns the nearest rounded hour
     */
    const getNextTimeSlot = useCallback(
        (date) => {
            const dayLessons = getLessonsForDate(date);
            const today = new Date();
            const isToday = isSameDayAs(date, today);

            if (dayLessons.length === 0) {
                // No lessons - suggest nearest rounded hour if today, otherwise 14:00
                if (isToday) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMinutes = now.getMinutes();

                    // Round to next hour
                    const nextHour = currentMinutes > 0 ? currentHour + 1 : currentHour;
                    const hours = String(nextHour).padStart(2, '0');

                    return `${hours}:00`;
                }
                return '14:00';
            }

            // Get last lesson time
            const lastLesson = dayLessons[dayLessons.length - 1];
            const lastTime = new Date(lastLesson.datetime);

            // Add 1 hour
            lastTime.setHours(lastTime.getHours() + 1);

            // If it's today and the suggested time is in the past, use current time rounded to next hour
            if (isToday && lastTime < today) {
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinutes = now.getMinutes();

                // Round to next hour
                const nextHour = currentMinutes > 0 ? currentHour + 1 : currentHour;
                const hours = String(nextHour).padStart(2, '0');

                return `${hours}:00`;
            }

            const hours = String(lastTime.getHours()).padStart(2, '0');
            const minutes = String(lastTime.getMinutes()).padStart(2, '0');

            return `${hours}:${minutes}`;
        },
        [getLessonsForDate],
    );

    return {
        // State
        lessons,
        lessonsLoading,
        lessonsError,
        currentWeek,
        lessonsByStatus,
        stats,

        // Actions
        loadLessons,
        addLesson,
        updateLesson,
        deleteLesson,
        nextWeek,
        prevWeek,
        goToToday,

        // Helpers
        getLessonsForDate,
        getLessonsForStudent,
        getLessonById,
        hasLessonsOnDate,
        getNextTimeSlot,
    };
}

export default useLessons;
