import React, { useState, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import Modal from './Modal';

const DAYS_OF_WEEK = [
    { value: 0, label: 'Понеділок' },
    { value: 1, label: 'Вівторок' },
    { value: 2, label: 'Середа' },
    { value: 3, label: 'Четвер' },
    { value: 4, label: "П'ятниця" },
    { value: 5, label: 'Субота' },
    { value: 6, label: 'Неділя' },
];

/**
 * Modal for managing student schedule
 */
function ScheduleModal() {
    const isOpen = useAppStore((state) => state.modals.schedule);
    const closeModal = useAppStore((state) => state.closeModal);
    const selectedStudent = useAppStore((state) => state.selectedStudentForSchedule);
    const loadSchedules = useAppStore((state) => state.loadSchedules);
    const addSchedule = useAppStore((state) => state.addSchedule);
    const deleteSchedule = useAppStore((state) => state.deleteSchedule);
    const autoCreateLessons = useAppStore((state) => state.autoCreateLessons);
    const schedules = useAppStore((state) => state.schedules);

    const [dayOfWeek, setDayOfWeek] = useState(0);
    const [time, setTime] = useState('14:00');
    const [loading, setLoading] = useState(false);
    const [autoCreateLoading, setAutoCreateLoading] = useState(false);
    const [error, setError] = useState(null);

    // Load schedules when modal opens
    useEffect(() => {
        if (isOpen && selectedStudent) {
            loadSchedules(selectedStudent.id);
        }
    }, [isOpen, selectedStudent, loadSchedules]);

    const handleAdd = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await addSchedule(selectedStudent.id, dayOfWeek, time);
            setTime('14:00');
            setDayOfWeek(0);
        } catch (err) {
            setError('Помилка при додаванні розкладу');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (scheduleId) => {
        try {
            await deleteSchedule(scheduleId);
        } catch (err) {
            alert('Помилка при видаленні розкладу');
            console.error(err);
        }
    };

    const handleAutoCreate = async () => {
        setAutoCreateLoading(true);
        setError(null);

        try {
            const created = await autoCreateLessons(selectedStudent.id);
            if (created > 0) {
                alert(`Створено ${created} уроків на основі розкладу`);
            } else {
                alert('Не вдалося створити уроки. Перевірте баланс студента та розклад.');
            }
        } catch (err) {
            setError('Помилка при створенні уроків');
            console.error(err);
        } finally {
            setAutoCreateLoading(false);
        }
    };

    const handleClose = () => {
        setError(null);
        setTime('14:00');
        setDayOfWeek(0);
        closeModal('schedule');
    };

    if (!selectedStudent) return null;

    // Group schedules by day
    const schedulesByDay = DAYS_OF_WEEK.map((day) => ({
        ...day,
        times: schedules
            .filter((s) => s.day_of_week === day.value && s.is_active)
            .sort((a, b) => a.time.localeCompare(b.time)),
    }));

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`Розклад: ${selectedStudent.name}`}
            size="lg"
        >
            <div className="space-y-6">
                {/* Add new schedule */}
                <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-bold text-gray-800 mb-3">Додати день уроку</h3>
                    <form onSubmit={handleAdd} className="flex gap-3">
                        <select
                            value={dayOfWeek}
                            onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {DAYS_OF_WEEK.map((day) => (
                                <option key={day.value} value={day.value}>
                                    {day.label}
                                </option>
                            ))}
                        </select>

                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {loading ? '...' : '+ Додати'}
                        </button>
                    </form>

                    {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}
                </div>

                {/* Info */}
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                    <div className="text-green-800 text-sm">
                        ℹ️ <strong>Як це працює:</strong>
                        <ul className="mt-2 ml-4 space-y-1">
                            <li>• Уроки створюються при натисканні кнопки нижче</li>
                            <li>
                                • Система створює уроки на 12 тижнів вперед (або поки не скінчиться
                                баланс)
                            </li>
                            <li>
                                • Поточний баланс: <strong>{selectedStudent.balance}</strong>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Auto-create button */}
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                    <button
                        onClick={handleAutoCreate}
                        disabled={
                            autoCreateLoading ||
                            schedules.filter((s) => s.is_active).length === 0 ||
                            selectedStudent.balance <= 0
                        }
                        className="w-full px-6 py-3  bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {autoCreateLoading ? '⏳ Створення...' : '✨ Створити уроки по розкладу'}
                    </button>
                    {schedules.filter((s) => s.is_active).length === 0 && (
                        <p className="mt-2 text-sm text-gray-600 text-center">
                            Спочатку додайте дні уроків до розкладу
                        </p>
                    )}
                    {selectedStudent.balance <= 0 &&
                        schedules.filter((s) => s.is_active).length > 0 && (
                            <p className="mt-2 text-sm text-gray-600 text-center">
                                Недостатньо балансу для створення уроків
                            </p>
                        )}
                </div>

                {/* Current schedule */}
                <div>
                    <h3 className="font-bold text-gray-800 mb-3">Поточний розклад</h3>
                    {schedules.filter((s) => s.is_active).length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                            Розклад порожній. Додайте дні уроків вище.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {schedulesByDay.map(
                                (day) =>
                                    day.times.length > 0 && (
                                        <div
                                            key={day.value}
                                            className="border border-gray-200 rounded-lg p-4"
                                        >
                                            <div className="font-bold text-gray-700 mb-2">
                                                {day.label}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {day.times.map((schedule) => (
                                                    <div
                                                        key={schedule.id}
                                                        className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg"
                                                    >
                                                        <span className="font-mono font-bold">
                                                            {schedule.time}
                                                        </span>
                                                        <button
                                                            onClick={() =>
                                                                handleDelete(schedule.id)
                                                            }
                                                            className="text-red-500 hover:text-red-700 font-bold"
                                                            title="Видалити"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ),
                            )}
                        </div>
                    )}
                </div>

                {/* Summary */}
                {schedules.filter((s) => s.is_active).length > 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm text-gray-600">
                            📅 Всього уроків на тиждень:{' '}
                            <strong>{schedules.filter((s) => s.is_active).length}</strong>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export default ScheduleModal;
