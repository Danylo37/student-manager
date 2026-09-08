import React, { useState, useEffect } from 'react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import useLessons from '@/hooks/useLessons';
import { useNotification } from '../common/NotificationProvider';
import { shouldBeCompleted } from '@/utils/lessonStatus';
import { DatePickerInput, TimePickerInput } from '../common/DateTimePicker';
import { submitOnEnter } from '@/utils/keyboard';
import Modal from './Modal';

/**
 * Modal for adding new lesson
 */
function AddLessonModal() {
  const isOpen = useAppStore((state) => state.modals.addLesson);
  const closeModal = useAppStore((state) => state.closeModal);
  const openModal = useAppStore((state) => state.openModal);
  const returnToList = useAppStore((state) => state.returnToStudentsList);
  const prefilledDateTime = useAppStore((state) => state.prefilledLessonDateTime);
  const prefilledStudentId = useAppStore((state) => state.prefilledLessonStudentId);
  const { students } = useStudents();
  const { addLesson, getNextTimeSlot } = useLessons();
  const { showToast } = useNotification();

  const [studentId, setStudentId] = useState<string>('');
  const [isTrial, setIsTrial] = useState<boolean>(false);
  const [trialName, setTrialName] = useState<string>('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStudentId(prefilledStudentId ? String(prefilledStudentId) : '');
      setIsTrial(false);
      setTrialName('');

      if (prefilledDateTime) {
        setDate(prefilledDateTime);
        setTime(prefilledDateTime);
      } else {
        const today = new Date();
        const { time: suggestedTime, date: suggestedDate } = getNextTimeSlot(today);

        setDate(suggestedDate);

        const [hours, minutes] = suggestedTime.split(':');
        const timeDate = new Date();
        timeDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        setTime(timeDate);
      }
    }
  }, [isOpen, getNextTimeSlot, prefilledDateTime, prefilledStudentId]);

  const handleDateChange = (newDate: Date | null): void => {
    setDate(newDate);
    if (newDate) {
      const { time: suggestedTime } = getNextTimeSlot(newDate);
      const [hours, minutes] = suggestedTime.split(':');
      const timeDate = new Date();
      timeDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      setTime(timeDate);
    }
  };

  const handleSubmit = async (e?: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    e?.preventDefault();

    if (loading) return;

    if (isTrial ? !trialName.trim() : !studentId) {
      setError(isTrial ? "Вкажіть ім'я" : 'Оберіть учня');
      return;
    }

    if (!date || !time) {
      setError('Вкажіть дату та час');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const datetime = new Date(date);
      datetime.setHours(time.getHours(), time.getMinutes(), 0, 0);

      const isCompleted = shouldBeCompleted(datetime.toISOString(), isTrial);

      await addLesson({
        studentId: isTrial ? null : parseInt(studentId),
        datetime: datetime.toISOString(),
        isCompleted,
        isTrial,
        studentName: isTrial ? trialName.trim() : null,
      });

      showToast(`Урок створено успішно!`, 'success');

      setStudentId('');
      setIsTrial(false);
      setTrialName('');
      setDate(null);
      setTime(null);
      closeModal('addLesson');
    } catch (err) {
      showToast('Помилка при створенні уроку!', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (): void => {
    setStudentId('');
    setIsTrial(false);
    setTrialName('');
    setDate(null);
    setTime(null);
    setError(null);
    closeModal('addLesson');
  };

  const handleBack = (): void => {
    handleClose();
    openModal('studentsList');
  };

  const selectedStudent = isTrial ? undefined : students.find((s) => s.id === parseInt(studentId));

  const datetime =
    date && time
      ? (() => {
        const dt = new Date(date);
        dt.setHours(time.getHours(), time.getMinutes(), 0, 0);
        return dt;
      })()
      : null;
  const isPastTime = datetime ? shouldBeCompleted(datetime.toISOString(), isTrial) : false;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      onBack={returnToList ? handleBack : undefined}
      title="Додати урок"
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={submitOnEnter(() => void handleSubmit())}
        className="space-y-4"
      >
        {/* Trial lesson */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTrial}
            onChange={(e) => {
              setIsTrial(e.target.checked);
              setError(null);
            }}
            className="w-4 h-4 accent-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Пробний урок</span>
        </label>

        {/* Student */}
        {isTrial ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я *</label>
            <input
              type="text"
              value={trialName}
              onChange={(e) => {
                setTrialName(e.target.value);
                if (e.target.value.trim()) {
                  setError(null);
                }
              }}
              placeholder="Ім'я учня"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Учень *</label>
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                if (e.target.value) {
                  setError(null);
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            >
              <option value="" disabled={studentId !== ''}>
                Оберіть учня...
              </option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} (Баланс: {student.balance})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date and time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Дата *
            </label>
            <DatePickerInput value={date} onChange={handleDateChange} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Час *
            </label>
            <TimePickerInput value={time} onChange={setTime} />
          </div>
        </div>

        {/* Warning for past datetime */}
        {isPastTime && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded text-sm">
            ⚠️ Час уже минув. Урок буде автоматично позначено як проведений
          </div>
        )}

        {/* Trial info */}
        {isTrial && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm">
            Пробний урок: 30 хвилин, безкоштовно. Ім'я не додається до списку учнів
          </div>
        )}

        {/* Payment info */}
        {selectedStudent && (
          <div
            className={`p-4 rounded-lg ${selectedStudent.balance > 0
              ? 'bg-green-50 border border-green-200'
              : 'bg-yellow-50 border border-yellow-200'
              }`}
          >
            {selectedStudent.balance > 0 ? (
              <div className="text-green-800 text-sm">
                ✓ Урок буде позначено як оплачений (баланс:{' '}
                {selectedStudent.balance})
              </div>
            ) : (
              <div className="text-yellow-800 text-sm">
                ⚠️ Недостатньо балансу. Після проведення уроку баланс стане
                від'ємним
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Скасувати
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Додавання...' : 'Додати урок'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AddLessonModal;
