import React from 'react';
import { formatTime } from '@/utils/dateHelpers';
import {
    getLessonStatus,
    getStatusBorderColor,
    getStatusBgLight,
    getStatusEmoji,
} from '@/utils/lessonStatus';
import useAppStore from '../../store/appStore';

/**
 * Lesson card component
 * Displays single lesson with status, time, and student info
 */
function LessonCard({ lesson }) {
    const selectLesson = useAppStore((state) => state.selectLesson);
    const toggleLessonPayment = useAppStore((state) => state.toggleLessonPayment);

    const status = getLessonStatus(lesson);
    const borderColor = getStatusBorderColor(status);
    const bgColor = getStatusBgLight(status);
    const emoji = getStatusEmoji(status);

    const handleClick = () => {
        selectLesson(lesson);
    };

    const handleTogglePayment = async (e) => {
        e.stopPropagation(); // Prevent card click
        try {
            await toggleLessonPayment(lesson.id);
        } catch (error) {
            console.error('Failed to toggle payment status:', error);
        }
    };

    // Show payment button only for completed lessons
    const showPaymentButton = !!lesson.is_completed && !lesson.is_paid;

    return (
        <div
            onClick={handleClick}
            className={`
                group
                ${bgColor} 
                ${borderColor}
                border-2
                p-2
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
                <div className="flex items-center gap-1">
                    {showPaymentButton && (
                        <button
                            onClick={handleTogglePayment}
                            className="text-lg hover:scale-110 transition-transform opacity-0 group-hover:opacity-100"
                            title="Відмітити як оплачений"
                        >
                            💵
                        </button>
                    )}
                    <span className="text-lg" title={status}>
                        {emoji}
                    </span>
                </div>
            </div>

            {/* Student name */}
            <div className="text-sm text-gray-700 font-medium">{lesson.student_name}</div>
        </div>
    );
}

export default LessonCard;
