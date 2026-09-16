import React from 'react';
import { formatTime } from '@/utils/dateHelpers.ts';
import {
  getLessonStatus,
  getStatusBorderColor,
  getStatusBgLight,
  getStatusEmoji,
} from '@/utils/lessonStatus.ts';
import useAppStore from '@/store/appStore';
import { useNotification } from '../common/NotificationProvider';
import { rejectionReason } from '@/utils/ipc';
import type { Lesson } from '@/types';

interface LessonCardProps {
  lesson: Lesson;
}

/**
 * Lesson card component
 * Displays single lesson with status, time, and student info
 */
function LessonCard({ lesson }: LessonCardProps) {
  const selectLesson = useAppStore((state) => state.selectLesson);
  const toggleLessonPayment = useAppStore((state) => state.toggleLessonPayment);
  const { showToast } = useNotification();

  const status = getLessonStatus(lesson);
  const borderColor = getStatusBorderColor(status);
  const bgColor = getStatusBgLight(status);
  const emoji = getStatusEmoji(status);

  const handleClick = (): void => {
    selectLesson(lesson);
  };

  const handleTogglePayment = async (e: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.stopPropagation(); // Prevent card click
    try {
      await toggleLessonPayment(lesson.id);
    } catch (error) {
      const reason = rejectionReason(error);
      if (reason) showToast(reason, 'error');
      else console.error('Failed to toggle payment status:', error);
    }
  };

  // Show payment button only for completed lessons; a trial one is free
  const isTrial = !!lesson.is_trial;
  const showPaymentButton = !!lesson.is_completed && !lesson.is_paid && !isTrial;

  // A trial lesson is only 30 minutes tall, so it holds a single row
  if (isTrial) {
    return (
      <div
        onClick={handleClick}
        className={`
                ${bgColor}
                ${borderColor}
                border-2
                px-2
                rounded-2xl
                h-full
                flex
                items-center
                gap-2
                overflow-hidden
                cursor-pointer
                hover:shadow-md
                transition-shadow
            `}
        title={status}
      >
        <span className="font-bold text-gray-800">{formatTime(lesson.datetime)}</span>
        <span className="text-sm text-gray-700 font-medium truncate">{lesson.student_name}</span>
        <span className="ml-auto text-xs text-blue-600 font-medium shrink-0">Пробний</span>
      </div>
    );
  }

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
                h-full
                overflow-hidden
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
      <div className="text-sm text-gray-700 font-medium truncate">{lesson.student_name}</div>
    </div>
  );
}

export default LessonCard;
