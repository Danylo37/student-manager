import React from 'react';
import { formatTime } from '../../utils/dateHelpers';
import {
    getLessonStatus,
    getStatusBorderColor,
    getStatusBgLight,
    getStatusEmoji,
    isToday
} from '../../utils/lessonStatus';
import useAppStore from '../../store/appStore';

/**
 * Lesson card component
 * Displays single lesson with status, time, and student info
 */
function LessonCard({ lesson }) {
    const selectLesson = useAppStore((state) => state.selectLesson);

    const status = getLessonStatus(lesson);
    const borderColor = getStatusBorderColor(status);
    const bgColor = getStatusBgLight(status);
    const emoji = getStatusEmoji(status);
    const isTodayLesson = isToday(lesson.datetime);

    const handleClick = () => {
        selectLesson(lesson);
    };

    return (
        <div
            onClick={handleClick}
            className={`
        ${bgColor} 
        ${borderColor}
        border-l-4 
        p-3 
        rounded 
        mb-2 
        cursor-pointer 
        hover:shadow-md 
        transition-shadow
        ${isTodayLesson ? 'ring-2 ring-blue-400' : ''}
      `}
        >
            {/* Time and status */}
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-800">
                  {formatTime(lesson.datetime)}
                </span>
                        <span className="text-lg" title={status}>
                  {emoji}
                </span>
            </div>

            {/* Student name */}
            <div className="text-sm text-gray-700 font-medium">
                {lesson.student_name}
            </div>

            {/* Balance indicator */}
            <div className="text-xs text-gray-500 mt-1">
                Баланс: {lesson.balance}
            </div>

            {/* Today badge */}
            {isTodayLesson && (
                <div className="mt-2 text-xs text-blue-600 font-bold">
                    📅 Сьогодні
                </div>
            )}

            {/* Completed badge */}
            {lesson.is_completed && (
                <div className="mt-1 text-xs text-gray-500">
                    ✓ Проведено
                </div>
            )}
        </div>
    );
}

export default LessonCard;
