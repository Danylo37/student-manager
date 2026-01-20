import React, { useState, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import useLessons from '../../hooks/useLessons';
import { formatTime, formatDate, createDateTime } from '../../utils/dateHelpers';
import { getLessonStatus, getStatusLabel } from '../../utils/lessonStatus';
import Modal from './Modal';

/**
 * Modal for editing lesson
 */
function EditLessonModal() {
    const isOpen = useAppStore((state) => state.modals.editLesson);
    const closeModal = useAppStore((state) => state.closeModal);
    const selectedLesson = useAppStore((state) => state.selectedLesson);
    const { updateLesson, deleteLesson } = useLessons();

    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [isPaid, setIsPaid] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initialize form when lesson is selected
    useEffect(() => {
        if (selectedLesson) {
            const lessonDate = new Date(selectedLesson.datetime);
            setDate(formatDate(lessonDate, 'yyyy-MM-dd'));
            setTime(formatTime(selectedLesson.datetime));
            setIsPaid(selectedLesson.is_paid);
            setIsCompleted(selectedLesson.is_completed);
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
            const dateObj = new Date(date);
            const datetime = createDateTime(dateObj, time);

            await updateLesson(selectedLesson.id, {
                datetime,
                is_paid: isPaid,
                is_completed: isCompleted,
            });

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
                    <div className="text-sm text-gray-600">Студент</div>
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
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Час *
                        </label>
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>

                {/* Status checkboxes */}
                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <input
                            type="checkbox"
                            id="isPaidEdit"
                            checked={isPaid}
                            onChange={(e) => setIsPaid(e.target.checked)}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label
                            htmlFor="isPaidEdit"
                            className="text-sm font-medium text-gray-700 cursor-pointer"
                        >
                            Урок оплачено
                        </label>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <input
                            type="checkbox"
                            id="isCompletedEdit"
                            checked={isCompleted}
                            onChange={(e) => setIsCompleted(e.target.checked)}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label
                            htmlFor="isCompletedEdit"
                            className="text-sm font-medium text-gray-700 cursor-pointer"
                        >
                            Урок проведено
                        </label>
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
