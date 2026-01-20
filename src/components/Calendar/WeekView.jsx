import React from 'react';
import { getWeekDays } from '../../utils/dateHelpers';
import useLessons from '../../hooks/useLessons';
import DayColumn from './DayColumn';

/**
 * Week view calendar component
 * Displays 7 day columns for the current week
 */
function WeekView() {
    const { currentWeek } = useLessons();

    const weekDays = getWeekDays(currentWeek);

    return (
        <div className="flex-1 grid grid-cols-7 bg-white overflow-hidden border-t border-gray-200">
            {weekDays.map((date, index) => (
                <DayColumn key={index} date={date} />
            ))}
        </div>
    );
}

export default WeekView;