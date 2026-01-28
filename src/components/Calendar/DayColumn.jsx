import React from 'react';
import { formatDate, formatDayOfWeekShort } from '../../utils/dateHelpers';
import { isToday } from '../../utils/lessonStatus';
import useLessons from '../../hooks/useLessons';
import useAppStore from '../../store/appStore';
import LessonCard from './LessonCard';

/**
 * Day column component for calendar with time grid
 */
function DayColumn({ date, timeSlots }) {
    const { getLessonsForDate } = useLessons();
    const openAddLessonModal = useAppStore((state) => state.openAddLessonModal);
    const dayLessons = getLessonsForDate(date);
    const isTodayDate = isToday(date.toISOString());

    /**
     * Get the hour from a datetime string
     */
    const getLessonHour = (datetime) => {
        const lessonDate = new Date(datetime);
        return lessonDate.getHours();
    };

    /**
     * Get the minute offset for positioning within the hour slot
     */
    const getLessonMinuteOffset = (datetime) => {
        const lessonDate = new Date(datetime);
        return lessonDate.getMinutes();
    };

    /**
     * Get lessons for a specific hour
     */
    const getLessonsForHour = (hour) => {
        return dayLessons.filter((lesson) => {
            const lessonHour = getLessonHour(lesson.datetime);
            return lessonHour === hour;
        });
    };

    /**
     * Handle click on time slot
     */
    const handleTimeSlotClick = (hour) => {
        // Make 21:00 slot non-clickable
        if (hour === 21) return;

        const datetime = new Date(date);
        datetime.setHours(hour, 0, 0, 0);
        openAddLessonModal(datetime);
    };

    return (
        <div className="flex flex-col h-full border-r border-gray-200 last:border-r-0">
            {/* Day header */}
            <div
                className={`
                    p-3
                    h-20
                    border-b
                    border-gray-200 
                    text-center
                    flex
                    flex-col
                    justify-center
                    ${isTodayDate ? 'bg-blue-50 border-blue-300' : 'bg-gray-50'}
                `}
            >
                {/* Day of week */}
                <div
                    className={`
                    text-xs 
                    font-semibold
                    uppercase
                    ${isTodayDate ? 'text-blue-600' : 'text-gray-500'}
                    `}
                >
                    {formatDayOfWeekShort(date)}
                </div>

                {/* Date */}
                <div
                    className={`
                    text-sm 
                    font-bold 
                    mt-1
                    ${isTodayDate ? 'text-blue-700' : 'text-gray-700'}
                    `}
                >
                    {formatDate(date, 'dd.MM')}
                </div>
            </div>

            {/* Time grid */}
            <div className="flex-1 relative">
                {timeSlots.map((hour) => {
                    const hourLessons = getLessonsForHour(hour);
                    const isNonClickable = hour === 21;

                    return (
                        <div
                            key={hour}
                            className={`h-20 border-b border-gray-200 relative p-2 transition-colors ${
                                isNonClickable
                                    ? 'cursor-not-allowed'
                                    : `cursor-pointer ${hourLessons.length === 0 ? 'hover:bg-blue-50' : ''}`
                            }`}
                            onClick={() => handleTimeSlotClick(hour)}
                        >
                            {/* Lessons in this hour */}
                            {hourLessons.map((lesson) => {
                                const minuteOffset = getLessonMinuteOffset(lesson.datetime);
                                // Calculate top position based on minutes (0-60 minutes = 0-80px)
                                const topPosition = (minuteOffset / 60) * 80;

                                return (
                                    <div
                                        key={lesson.id}
                                        className="absolute left-1 right-3 z-10"
                                        style={{ top: `${topPosition}px` }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <LessonCard lesson={lesson} />
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default DayColumn;
