import React, { useState } from 'react';
import useAppStore from '../../store/appStore';
import useStudents from '../../hooks/useStudents';
import Modal from './Modal';

/**
 * Modal for viewing and managing students
 */
function StudentsListModal() {
    const isOpen = useAppStore((state) => state.modals.studentsList);
    const closeModal = useAppStore((state) => state.closeModal);
    const { students, searchStudents, deleteStudent, updateBalance } = useStudents();

    const [searchQuery, setSearchQuery] = useState('');
    const [editingBalance, setEditingBalance] = useState(null);
    const [balanceAmount, setBalanceAmount] = useState(0);

    const filteredStudents = searchStudents(searchQuery);

    const handleDelete = async (studentId, studentName) => {
        if (!confirm(`Видалити студента "${studentName}"? Всі його уроки також будуть видалені.`)) {
            return;
        }

        try {
            await deleteStudent(studentId);
        } catch (err) {
            alert('Помилка при видаленні студента');
            console.error(err);
        }
    };

    const handleBalanceEdit = (studentId, currentBalance) => {
        setEditingBalance(studentId);
        setBalanceAmount(0);
    };

    const handleBalanceSubmit = async (studentId) => {
        try {
            await updateBalance(studentId, balanceAmount);
            setEditingBalance(null);
            setBalanceAmount(0);
        } catch (err) {
            alert('Помилка при оновленні балансу');
            console.error(err);
        }
    };

    const handleClose = () => {
        setSearchQuery('');
        setEditingBalance(null);
        setBalanceAmount(0);
        closeModal('studentsList');
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Список студентів" size="lg">
            <div className="space-y-4">
                {/* Search */}
                <div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Пошук студента..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        autoFocus
                    />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-700">{students.length}</div>
                        <div className="text-sm text-blue-600">Всього студентів</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-700">
                            {students.reduce((sum, s) => sum + s.balance, 0)}
                        </div>
                        <div className="text-sm text-green-600">Всього уроків</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-purple-700">
                            {students.reduce((sum, s) => sum + (s.completed_lessons_count || 0), 0)}
                        </div>
                        <div className="text-sm text-purple-600">Проведено уроків</div>
                    </div>
                </div>

                {/* Students list */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredStudents.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                            {searchQuery ? 'Нічого не знайдено' : 'Немає студентів'}
                        </div>
                    ) : (
                        filteredStudents.map((student) => (
                            <div
                                key={student.id}
                                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-center justify-between">
                                    {/* Student info */}
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-gray-800">{student.name}</h3>
                                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      <span>
                        Баланс:{' '}
                          <span
                              className={`font-bold ${
                                  student.balance < 0
                                      ? 'text-red-600'
                                      : student.balance < 3
                                          ? 'text-yellow-600'
                                          : 'text-green-600'
                              }`}
                          >
                          {student.balance}
                        </span>
                      </span>
                                            <span>Проведено: {student.completed_lessons_count || 0}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {editingBalance === student.id ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={balanceAmount}
                                                    onChange={(e) => setBalanceAmount(parseInt(e.target.value) || 0)}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                                                    placeholder="±0"
                                                />
                                                <button
                                                    onClick={() => handleBalanceSubmit(student.id)}
                                                    className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    onClick={() => setEditingBalance(null)}
                                                    className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleBalanceEdit(student.id, student.balance)}
                                                    className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium"
                                                >
                                                    Баланс
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(student.id, student.name)}
                                                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm font-medium"
                                                >
                                                    Видалити
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Modal>
    );
}

export default StudentsListModal;
