import React, { useState, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import useLessons from '../../hooks/useLessons';
import useStudents from '../../hooks/useStudents';
import { getLessonStatus, getStatusLabel, shouldBeCompleted } from '@/utils/lessonStatus';
import { DatePickerInput, TimePickerInput } from '../common/DateTimePicker';
import Modal from './Modal';

/**
 * Modal for editing lesson
 */
function EditLessonModal() {
    const isOpen = useAppStore((state) => state.modals.editLesson);
    const closeModal = useAppStore((state) => state.closeModal);
    const selectedLesson = useAppStore((state) => state.selectedLesson);
    const { updateLesson, deleteLesson } = useLessons();
    const { getStudentById } = useStudents();

    const [date, setDate] = useState(null);
    const [time, setTime] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initialize form when lesson is selected
    useEffect(() => {
        if (selectedLesson) {
            const lessonDate = new Date(selectedLesson.datetime);
            setDate(lessonDate);
            setTime(lessonDate);
        }
    }, [selectedLesson]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!date || !time) {
            setError('Вкажіть дату та час');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const datetime = new Date(date);
            datetime.setHours(time.getHours(), time.getMinutes(), 0, 0);

            const is_completed = shouldBeCompleted(datetime);
            const completionStatusChanged = is_completed !== (selectedLesson.is_completed === 1);

            const updateData = {
                datetime: datetime.toISOString(),
            };

            // Recalculate completion and payment status if completion status changed
            if (completionStatusChanged) {
                const student = getStudentById(selectedLesson.student_id);
                updateData.is_completed = is_completed;
                updateData.is_paid = student && student.balance > 0 && is_completed ? 1 : 0;
            }

            await updateLesson(selectedLesson.id, updateData);

            closeModal('editLesson');
        } catch (err) {
            setError('Помилка при оновленні уроку');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Видалити цей урок?')) {
            return;
        }

        try {
            await deleteLesson(selectedLesson.id);
            closeModal('editLesson');
        } catch (err) {
            alert('Помилка при видаленні уроку');
            console.error(err);
        }
    };

    const handleClose = () => {
        setError(null);
        closeModal('editLesson');
    };

    if (!selectedLesson) return null;

    const status = getLessonStatus(selectedLesson);
    const statusLabel = getStatusLabel(status);

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Редагувати урок" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Student info (read-only) */}
                <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Учень</div>
                    <div className="text-lg font-bold text-gray-800">
                        {selectedLesson.student_name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                        Баланс: {selectedLesson.balance} | Статус: {statusLabel}
                    </div>
                </div>

                {/* Date and time */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Дата *
                        </label>
                        <DatePickerInput value={date} onChange={setDate} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Час *
                        </label>
                        <TimePickerInput value={time} onChange={setTime} />
                    </div>
                </div>

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
                        onClick={handleDelete}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                        disabled={loading}
                    >
                        Видалити
                    </button>
                    <div className="flex-1"></div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={loading}
                    >
                        Скасувати
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? 'Збереження...' : 'Зберегти'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default EditLessonModal;
