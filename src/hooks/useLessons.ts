import { useMemo, useCallback } from 'react';
import useAppStore from '@/store/appStore';
import { isSameDayAs, formatDate } from '../utils/dateHelpers';
import { getLessonStatus, LessonStatus } from '../utils/lessonStatus';
import type { Lesson, AddLessonData, UpdateLessonData } from '@/types';

interface LessonsByStatus {
    [LessonStatus.PAID]: Lesson[];
    [LessonStatus.PENDING]: Lesson[];
    [LessonStatus.OVERDUE]: Lesson[];
}

interface LessonStats {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    completed: number;
    notCompleted: number;
}

interface TimeSlotResult {
    time: string;
    date: Date;
}

interface UseLessonsReturn {
    // State
    lessons: Lesson[];
    lessonsLoading: boolean;
    lessonsError: string | null;
    currentWeek: Date;
    lessonsByStatus: LessonsByStatus;
    stats: LessonStats;

    // Actions
    loadLessons: () => Promise<void>;
    addLesson: (data: AddLessonData) => Promise<void>;
    updateLesson: (lessonId: number, updates: UpdateLessonData) => Promise<void>;
    deleteLesson: (lessonId: number) => Promise<void>;
    nextWeek: () => void;
    prevWeek: () => void;
    goToToday: () => void;

    // Helpers
    getLessonsForDate: (date: Date) => Lesson[];
    getLessonsForStudent: (studentId: number) => Lesson[];
    getLessonById: (lessonId: number) => Lesson | undefined;
    hasLessonsOnDate: (date: Date) => boolean;
    getNextTimeSlot: (date: Date) => TimeSlotResult;
}

/**
 * Hook for working with lessons
 * Provides convenient methods and filtered data
 */
function useLessons(): UseLessonsReturn {
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
     * This memo recalculates only when lessons array changes
     */
    const lessonsByDate = useMemo((): Record<string, Lesson[]> => {
        const grouped: Record<string, Lesson[]> = {};

        // Group lessons by date
        lessons.forEach((lesson) => {
            const dateKey = formatDate(new Date(lesson.datetime), 'yyyy-MM-dd');
            if (!grouped[dateKey]) {
                grouped[dateKey] = [];
            }
            grouped[dateKey].push(lesson);
        });

        // Sort lessons in each date group
        Object.keys(grouped).forEach((key) => {
            grouped[key].sort(
                (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
            );
        });

        return grouped;
    }, [lessons]);

    /**
     * Get lessons for specific date
     */
    const getLessonsForDate = useCallback(
        (date: Date): Lesson[] => {
            const dateKey = formatDate(date, 'yyyy-MM-dd');
            return lessonsByDate[dateKey] || [];
        },
        [lessonsByDate],
    );

    /**
     * Get lessons for specific student
     */
    const getLessonsForStudent = useCallback(
        (studentId: number): Lesson[] => {
            return lessons.filter((lesson) => lesson.student_id === studentId);
        },
        [lessons],
    );

    /**
     * Get lesson by ID
     */
    const getLessonById = useCallback(
        (lessonId: number): Lesson | undefined => {
            return lessons.find((l) => l.id === lessonId);
        },
        [lessons],
    );

    /**
     * Get lessons grouped by status
     */
    const lessonsByStatus = useMemo((): LessonsByStatus => {
        const grouped: LessonsByStatus = {
            [LessonStatus.PAID]: [],
            [LessonStatus.PENDING]: [],
            [LessonStatus.OVERDUE]: [],
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
    const stats = useMemo((): LessonStats => {
        const total = lessons.length;
        const paid = lessonsByStatus[LessonStatus.PAID].length;
        const pending = lessonsByStatus[LessonStatus.PENDING].length;
        const overdue = lessonsByStatus[LessonStatus.OVERDUE].length;
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
        (date: Date): boolean => {
            const dateKey = formatDate(date, 'yyyy-MM-dd');
            return !!lessonsByDate[dateKey];
        },
        [lessonsByDate],
    );

    /**
     * Get next available time slot for a date
     */
    const getNextTimeSlot = useCallback(
        (date: Date): TimeSlotResult => {
            const dayLessons = getLessonsForDate(date);
            const today = new Date();
            const isToday = isSameDayAs(date, today);

            if (dayLessons.length === 0) {
                if (isToday) {
                    const now = new Date();
                    const currentHour = now.getHours();
                    const currentMinutes = now.getMinutes();

                    const nextHour = currentMinutes > 0 ? currentHour + 1 : currentHour;

                    if (nextHour > 20) {
                        const nextDay = new Date(date);
                        nextDay.setDate(nextDay.getDate() + 1);
                        return { time: '14:00', date: nextDay };
                    }

                    const hours = String(nextHour).padStart(2, '0');
                    return { time: `${hours}:00`, date };
                }
                return { time: '14:00', date };
            }

            const lastLesson = dayLessons[dayLessons.length - 1];
            const lastTime = new Date(lastLesson.datetime);

            lastTime.setHours(lastTime.getHours() + 1);

            if (isToday && lastTime < today) {
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinutes = now.getMinutes();

                const nextHour = currentMinutes > 0 ? currentHour + 1 : currentHour;

                if (nextHour > 20) {
                    const nextDay = new Date(date);
                    nextDay.setDate(nextDay.getDate() + 1);
                    return { time: '14:00', date: nextDay };
                }

                const hours = String(nextHour).padStart(2, '0');
                return { time: `${hours}:00`, date };
            }

            if (
                lastTime.getHours() > 20 ||
                (lastTime.getHours() === 20 && lastTime.getMinutes() > 0)
            ) {
                const nextDay = new Date(date);
                nextDay.setDate(nextDay.getDate() + 1);
                return { time: '14:00', date: nextDay };
            }

            const hours = String(lastTime.getHours()).padStart(2, '0');
            const minutes = String(lastTime.getMinutes()).padStart(2, '0');

            return { time: `${hours}:${minutes}`, date };
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
