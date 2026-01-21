import React, { useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { formatDateWithMonth } from '../../utils/dateHelpers';
import useLessons from '../../hooks/useLessons';
import useAppStore from '../../store/appStore';

/**
 * Application header with action buttons and week navigation
 */
function Header() {
    const { nextWeek, prevWeek, goToToday, lessonsLoading, lessons } = useLessons();
    const openModal = useAppStore((state) => state.openModal);
    const syncLessons = useAppStore((state) => state.syncLessons);
    const loadStudents = useAppStore((state) => state.loadStudents);
    const loadLessons = useAppStore((state) => state.loadLessons);

    const [syncing, setSyncing] = useState(false);

    const weekDays = useLessons().currentWeek;
    const weekStart = new Date(weekDays);
    const weekEnd = new Date(weekDays);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await syncLessons();
            await loadStudents();
            await loadLessons();
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <header className="bg-white border-b border-gray-200 shadow-sm">
            <div className="px-6 py-4">
                <div className="flex items-center justify-between">
                    {/* Left: Action buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => openModal('addStudent')}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                        >
                            + Додати студента
                        </button>

                        <button
                            onClick={() => openModal('addLesson')}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                        >
                            + Додати урок
                        </button>

                        <button
                            onClick={() => openModal('studentsList')}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <Users size={18} />
                            Студенти
                        </button>

                        {/* Sync button */}
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="p-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors disabled:opacity-50"
                            title="Синхронізувати уроки"
                        >
                            <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Center: Week range and lesson count */}
                    <div className="flex items-center gap-4">
                        <div className="text-xl font-bold text-gray-800">
                            {formatDateWithMonth(weekStart)} - {formatDateWithMonth(weekEnd)}
                        </div>

                        {/* Lesson count badge */}
                        <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                            {lessons.length} {lessons.length === 1 ? 'урок' : 'уроків'}
                        </div>

                        {lessonsLoading && (
                            <div className="flex items-center gap-2 text-blue-600 text-sm">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                                Завантаження...
                            </div>
                        )}
                    </div>

                    {/* Right: Week navigation */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={prevWeek}
                            disabled={lessonsLoading}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ← Попередній
                        </button>

                        <button
                            onClick={goToToday}
                            disabled={lessonsLoading}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Сьогодні
                        </button>

                        <button
                            onClick={nextWeek}
                            disabled={lessonsLoading}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Наступний →
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
