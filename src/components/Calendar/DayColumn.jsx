import React from 'react';
import { formatDate, formatDayOfWeekShort } from '../../utils/dateHelpers';
import { isToday } from '../../utils/lessonStatus';
import useLessons from '../../hooks/useLessons';
import LessonCard from './LessonCard';

/**
 * Day column component for calendar
 * Displays all lessons for a specific day
 */
function DayColumn({ date }) {
    const { getLessonsForDate } = useLessons();

    const dayLessons = getLessonsForDate(date);
    const isTodayDate = isToday(date.toISOString());

    return (
        <div className="flex flex-col h-full border-r border-gray-200 last:border-r-0">
            {/* Day header */}
            <div
                className={`
                    p-3
                    border-b
                    border-gray-200 
                    text-center
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

            {/* Lessons list */}
            <div className="flex-1 p-2 overflow-y-auto">
                {dayLessons.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm mt-8">Немає уроків</div>
                ) : (
                    dayLessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
                )}
            </div>

            {/* Lessons count */}
            {dayLessons.length > 0 && (
                <div className="p-2 border-t border-gray-200 text-center text-xs text-gray-500">
                    Всього: {dayLessons.length}
                </div>
            )}
        </div>
    );
}

export default DayColumn;
