import React from 'react';
import { formatTime } from '../../utils/dateHelpers';
import {
    getLessonStatus,
    getStatusBorderColor,
    getStatusBgLight,
    getStatusEmoji,
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

    const handleClick = () => {
        selectLesson(lesson);
    };

    return (
        <div
            onClick={handleClick}
            className={`
        ${bgColor} 
        ${borderColor}
        border-2
        p-3
        rounded-2xl
        mb-2 
        cursor-pointer 
        hover:shadow-md 
        transition-shadow
      `}
        >
            {/* Time and status */}
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-800">{formatTime(lesson.datetime)}</span>
                <span className="text-lg" title={status}>
                    {emoji}
                </span>
            </div>

            {/* Student name */}
            <div className="text-sm text-gray-700 font-medium">{lesson.student_name}</div>
        </div>
    );
}

export default LessonCard;
