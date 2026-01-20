import React from 'react';
import { getWeekDays, formatDateWithMonth } from '../../utils/dateHelpers';
import useLessons from '../../hooks/useLessons';
import DayColumn from './DayColumn';

/**
 * Week view calendar component
 * Displays 7 day columns for the current week
 */
function WeekView() {
    const { currentWeek, nextWeek, prevWeek, goToToday, lessonsLoading } = useLessons();

    const weekDays = getWeekDays(currentWeek);
    const weekStart = weekDays[0];
    const weekEnd = weekDays[6];

    return (
        <div className="flex flex-col h-full">
            {/* Week navigation */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                {/* Week range display */}
                <div className="text-lg font-bold text-gray-800">
                    {formatDateWithMonth(weekStart)} - {formatDateWithMonth(weekEnd)}
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={prevWeek}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={lessonsLoading}
                    >
                        ← Попередній
                    </button>

                    <button
                        onClick={goToToday}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                        disabled={lessonsLoading}
                    >
                        Сьогодні
                    </button>

                    <button
                        onClick={nextWeek}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={lessonsLoading}
                    >
                        Наступний →
                    </button>
                </div>
            </div>

            {/* Loading indicator */}
            {lessonsLoading && (
                <div className="bg-blue-50 border-b border-blue-200 p-2 text-center text-blue-700 text-sm">
                    Завантаження...
                </div>
            )}

            {/* Week grid */}
            <div className="flex-1 grid grid-cols-7 bg-white overflow-hidden">
                {weekDays.map((date, index) => (
                    <DayColumn key={index} date={date} />
                ))}
            </div>
        </div>
    );
}

export default WeekView;
