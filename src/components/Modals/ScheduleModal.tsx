import React, { useState, useEffect } from 'react';
import useAppStore from '@/store/appStore';
import { TimePickerInput } from '../common/DateTimePicker';
import { useNotification } from '../common/NotificationProvider';
import Modal from './Modal';

interface DayOfWeek {
  value: number;
  label: string;
}

const DAYS_OF_WEEK: DayOfWeek[] = [
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
  const toggleScheduleActive = useAppStore((state) => state.toggleScheduleActive);
  const autoCreateLessons = useAppStore((state) => state.autoCreateLessons);
  const schedules = useAppStore((state) => state.schedules);
  const { showToast } = useNotification();

  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [time, setTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoCreateLoading, setAutoCreateLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !time) {
      const defaultTime = new Date();
      defaultTime.setHours(14, 0, 0, 0);
      setTime(defaultTime);
    }
  }, [isOpen, time]);

  useEffect(() => {
    if (!isOpen || !selectedStudent) return;

    (async () => {
      try {
        await loadSchedules(selectedStudent.id);
      } catch (err) {
        console.error('Failed to load schedules', err);
      }
    })();
  }, [isOpen, selectedStudent, loadSchedules]);

  const handleAdd = async (e: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!time || !selectedStudent) {
      setError('Оберіть час');
      return;
    }

    setLoading(true);

    try {
      const hours = String(time.getHours()).padStart(2, '0');
      const minutes = String(time.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;

      await addSchedule(selectedStudent.id, dayOfWeek, timeString);

      const dayLabel = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? '';
      showToast(`Додано: ${dayLabel} о ${timeString}!`, 'success');

      const defaultTime = new Date();
      defaultTime.setHours(14, 0, 0, 0);
      setTime(defaultTime);
      setDayOfWeek(0);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        setError('Розклад на цей день і час вже існує');
      } else {
        setError('Помилка при додаванні розкладу');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (scheduleId: number): Promise<void> => {
    try {
      await deleteSchedule(scheduleId);
      showToast('День з розкладу видалено успішно!', 'success');
    } catch (err) {
      showToast('Помилка при видаленні дня з розкладу!', 'error');
      console.error(err);
    }
  };

  const handleToggle = async (scheduleId: number): Promise<void> => {
    try {
      await toggleScheduleActive(scheduleId);
      showToast('Статус дня з розкладу змінено успішно!', 'success');
    } catch (err) {
      showToast('Помилка при зміні статусу розкладу!', 'error');
      console.error(err);
    }
  };

  const handleAutoCreate = async (): Promise<void> => {
    if (!selectedStudent) return;

    setAutoCreateLoading(true);
    setError(null);

    try {
      const created = await autoCreateLessons(selectedStudent.id);
      if (created > 0) {
        showToast(`Створено уроків по розкладу: ${created}`, 'success');
        handleClose();
      } else {
        showToast('Уроки вже існують або немає підходящих слотів!', 'warning');
      }
    } catch (err) {
      showToast('Помилка при створенні уроків!', 'error');
      console.error(err);
    } finally {
      setAutoCreateLoading(false);
    }
  };

  const handleClose = (): void => {
    setError(null);
    const defaultTime = new Date();
    defaultTime.setHours(14, 0, 0, 0);
    setTime(defaultTime);
    setDayOfWeek(0);
    closeModal('schedule');
  };

  if (!selectedStudent) return null;

  const activeSchedulesByDay = DAYS_OF_WEEK.map((day) => ({
    ...day,
    times: schedules
      .filter((s) => s.day_of_week === day.value && s.is_active)
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const inactiveSchedulesByDay = DAYS_OF_WEEK.map((day) => ({
    ...day,
    times: schedules
      .filter((s) => s.day_of_week === day.value && !s.is_active)
      .sort((a, b) => a.time.localeCompare(b.time)),
  }));

  const hasInactiveSchedules = schedules.some((s) => !s.is_active);

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

            <div className="w-40">
              <TimePickerInput value={time} onChange={setTime} />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? '...' : '+ Додати'}
            </button>
          </form>

          {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}
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
              {activeSchedulesByDay.map(
                (day) =>
                  day.times.length > 0 && (
                    <div key={day.value} className="border border-gray-200 rounded-lg p-4">
                      <div className="font-bold text-gray-700 mb-2">{day.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {day.times.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg"
                          >
                            <span className="font-mono font-bold">{schedule.time}</span>
                            <button
                              onClick={() => handleToggle(schedule.id)}
                              className="text-orange-500 hover:text-orange-700 font-bold text-lg"
                              title="Призупинити"
                            >
                              ⏸
                            </button>
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="text-red-500 hover:text-red-700 font-bold text-lg"
                              title="Видалити назавжди"
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

        {/* Inactive schedules */}
        {hasInactiveSchedules && (
          <div>
            <h3 className="font-bold text-gray-600 mb-3">Неактивні розклади</h3>
            <div className="space-y-3">
              {inactiveSchedulesByDay.map(
                (day) =>
                  day.times.length > 0 && (
                    <div
                      key={day.value}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="font-bold text-gray-500 mb-2">{day.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {day.times.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="flex items-center gap-2 bg-gray-200 text-gray-600 px-3 py-2 rounded-lg"
                          >
                            <span className="font-mono font-bold">{schedule.time}</span>
                            <button
                              onClick={() => handleToggle(schedule.id)}
                              className="text-green-600 hover:text-green-800 font-bold text-lg"
                              title="Відновити"
                            >
                              ▶
                            </button>
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="text-red-500 hover:text-red-700 font-bold text-lg"
                              title="Видалити назавжди"
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
          </div>
        )}

        {/* Summary */}
        {schedules.filter((s) => s.is_active).length > 0 && (
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">
              📅 Всього уроків на тиждень:{' '}
              <strong>{schedules.filter((s) => s.is_active).length}</strong>
            </div>
          </div>
        )}

        {/* Auto-create button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleAutoCreate}
            disabled={autoCreateLoading || schedules.filter((s) => s.is_active).length === 0}
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {autoCreateLoading ? '⏳ Створення...' : '✨ Створити уроки по розкладу'}
          </button>
          {schedules.filter((s) => s.is_active).length === 0 && (
            <p className="mt-2 text-sm text-gray-600 text-center">
              Спочатку додайте дні уроків до розкладу
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ScheduleModal;
