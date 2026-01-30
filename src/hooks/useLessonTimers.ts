import { useEffect, useRef } from 'react';
import useAppStore from '@/store/appStore';
import { LESSON_DURATION_MINUTES } from '../utils/constants';
import type { Lesson } from '@/types';

/**
 * Hook that creates timers for each lesson
 * When lesson should complete, automatically updates its status
 */
function useLessonTimers(): null {
    const lessons = useAppStore((state) => state.lessons);
    const updateLesson = useAppStore((state) => state.updateLesson);
    const loadStudents = useAppStore((state) => state.loadStudents);

    // Store all active timers
    const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

    // Function to update the lesson
    const completeLessonAutomatically = async (lesson: Lesson): Promise<void> => {
        try {
            // Update lesson in DB
            await updateLesson(lesson.id, {
                is_completed: 1,
                is_paid: lesson.balance && lesson.balance > 0 ? 1 : 0, // Mark as paid if balance exists
            });

            // Update student balances
            await loadStudents();
        } catch (error) {
            console.error('Error automatically completing lesson:', error);
        }
    };

    // Create timer for a single lesson
    const createTimer = (lesson: Lesson): void => {
        // If lesson is already completed, skip
        if (lesson.is_completed) {
            return;
        }

        const lessonStart = new Date(lesson.datetime);
        const lessonEnd = new Date(lessonStart.getTime() + LESSON_DURATION_MINUTES * 60 * 1000);
        const now = new Date();

        // If lesson should have already completed, complete it immediately
        if (now >= lessonEnd) {
            completeLessonAutomatically(lesson);
            return;
        }

        // Time until lesson completion
        const timeUntilEnd = lessonEnd.getTime() - now.getTime();

        // Create timer
        const timerId = setTimeout(() => {
            completeLessonAutomatically(lesson);
            timersRef.current.delete(lesson.id); // Remove from timer list
        }, timeUntilEnd);

        // Save timer
        timersRef.current.set(lesson.id, timerId);
    };

    // Clear all timers
    const clearAllTimers = (): void => {
        timersRef.current.forEach((timerId) => clearTimeout(timerId));
        timersRef.current.clear();
    };

    useEffect(() => {
        // Clear old timers
        clearAllTimers();

        // Create timers for all uncompleted lessons
        lessons.forEach((lesson) => {
            createTimer(lesson);
        });

        // Clear all timers on unmount
        return () => {
            clearAllTimers();
        };
    }, [lessons]); // Recreate timers when lesson list changes

    return null; // This hook doesn't render anything
}

export default useLessonTimers;
