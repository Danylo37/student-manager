import { getWeekDays } from '@/utils/dateHelpers';
import useLessons from '../../hooks/useLessons';
import DayColumn from './DayColumn';

// Time slots from 9:00 to 21:00
const TIME_SLOTS: number[] = Array.from({ length: 13 }, (_, i) => i + 9);

/**
 * Week view calendar component with time slots
 * Displays 7-day columns with time grid
 */
function WeekView() {
    const { currentWeek } = useLessons();
    const weekDays = getWeekDays(currentWeek);

    return (
        <div className="flex-1 flex bg-white border-t border-gray-200">
            {/* Time column */}
            <div className="border-r border-gray-200 bg-gray-50 sticky left-0 z-10">
                {/* Empty header space */}
                <div className="h-20 border-b border-gray-200"></div>

                {/* Time slots */}
                {TIME_SLOTS.map((hour) => (
                    <div key={hour} className="h-20 border-b border-gray-200 px-3 py-2 text-right">
                        <span className="text-xs font-semibold text-gray-600">
                            {String(hour).padStart(2, '0')}:00
                        </span>
                    </div>
                ))}
            </div>

            {/* Days grid */}
            <div className="flex-1 grid grid-cols-7">
                {weekDays.map((date, index) => (
                    <DayColumn key={index} date={date} timeSlots={TIME_SLOTS} />
                ))}
            </div>
        </div>
    );
}

export default WeekView;
