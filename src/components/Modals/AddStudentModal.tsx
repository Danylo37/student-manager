import React, { useState } from 'react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import Modal from './Modal';

/**
 * Modal for adding new student
 */
function AddStudentModal() {
    const isOpen = useAppStore((state) => state.modals.addStudent);
    const closeModal = useAppStore((state) => state.closeModal);
    const { addStudent } = useStudents();

    const [name, setName] = useState<string>('');
    const [balance, setBalance] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();

        if (!name.trim()) {
            setError("Введіть ім'я учня");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await addStudent(name.trim(), balance);
            setName('');
            setBalance(0);
            closeModal('addStudent');
        } catch (err) {
            setError('Помилка при додаванні учня');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = (): void => {
        setName('');
        setBalance(0);
        setError(null);
        closeModal('addStudent');
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Додати учня" size="sm">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ім'я учня *
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Ім'я учня"
                        autoFocus
                    />
                </div>

                {/* Balance input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Початковий баланс
                    </label>
                    <input
                        type="number"
                        value={balance}
                        onChange={(e) => setBalance(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">Кількість оплачених уроків</p>
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
                        onClick={handleClose}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={loading}
                    >
                        Скасувати
                    </button>
                    <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? 'Додавання...' : 'Додати'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default AddStudentModal;
