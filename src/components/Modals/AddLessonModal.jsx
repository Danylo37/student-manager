import React, { useState, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import useStudents from '../../hooks/useStudents';
import useLessons from '../../hooks/useLessons';
import { createDateTime, formatDate } from '../../utils/dateHelpers';
import Modal from './Modal';

/**
 * Modal for adding new lesson
 */
function AddLessonModal() {
    const isOpen = useAppStore((state) => state.modals.addLesson);
    const closeModal = useAppStore((state) => state.closeModal);
    const { students } = useStudents();
    const { addLesson, getNextTimeSlot } = useLessons();

    const [studentId, setStudentId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('10:00');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Set default date to today
    useEffect(() => {
        if (isOpen) {
            const today = new Date();
            setDate(formatDate(today, 'yyyy-MM-dd'));
        }
    }, [isOpen]);

    // Update suggested time when date changes
    const handleDateChange = (newDate) => {
        setDate(newDate);
        const dateObj = new Date(newDate);
        const suggestedTime = getNextTimeSlot(dateObj);
        setTime(suggestedTime);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!studentId) {
            setError('Оберіть студента');
            return;
        }

        if (!date || !time) {
            setError('Вкажіть дату та час');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const dateObj = new Date(date);
            const datetime = createDateTime(dateObj, time);

            // Determine if paid based on student balance
            const student = students.find((s) => s.id === parseInt(studentId));
            const isPaid = student && student.balance > 0;

            await addLesson({
                studentId: parseInt(studentId),
                datetime,
                isPaid,
            });

            // Reset form and close
            setStudentId('');
            setDate('');
            setTime('10:00');
            closeModal('addLesson');
        } catch (err) {
            setError('Помилка при додаванні уроку');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStudentId('');
        setDate('');
        setTime('10:00');
        setError(null);
        closeModal('addLesson');
    };

    // Get selected student
    const selectedStudent = students.find((s) => s.id === parseInt(studentId));

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Додати урок" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Student select */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Студент *
                    </label>
                    <select
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        autoFocus
                    >
                        <option value="">Оберіть студента...</option>
                        {students.map((student) => (
                            <option key={student.id} value={student.id}>
                                {student.name} (Баланс: {student.balance})
                            </option>
                        ))}
                    </select>
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
                            onChange={(e) => handleDateChange(e.target.value)}
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

                {/* Payment info */}
                {selectedStudent && (
                    <div
                        className={`p-4 rounded-lg ${
                            selectedStudent.balance > 0
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
