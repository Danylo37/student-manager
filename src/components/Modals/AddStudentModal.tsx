import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import { useNotification } from '../common/NotificationProvider';
import { parseInputToKopiyky } from '@/utils/financials';
import Modal from './Modal';
import type { Student } from '@/types';

function AddStudentModal() {
  const isOpen = useAppStore((s) => s.modals.addStudent);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);
  const selectStudentForSchedule = useAppStore((s) => s.selectStudentForSchedule);
  const { addStudent } = useStudents();
  const { showToast } = useNotification();

  const [name, setName] = useState('');
  const [balanceStr, setBalanceStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createStudent = async (): Promise<Student | null> => {
    if (!name.trim()) { setError("Введіть ім'я учня"); return null; }

    const priceKopiyky = priceStr !== '' ? parseInputToKopiyky(priceStr) : null;
    if (priceStr !== '' && priceKopiyky === null) {
      setError('Введіть коректну ціну');
      return null;
    }

    const balance = parseInt(balanceStr) || 0;

    setLoading(true);
    setError(null);
    try {
      const student = await addStudent(name.trim(), balance, priceKopiyky);
      showToast(`Учня "${name.trim()}" додано!`, 'success');
      return student;
    } catch {
      showToast('Помилка при додаванні учня!', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await createStudent()) handleClose();
  };

  const handleCreateWithSchedule = async () => {
    const student = await createStudent();
    if (!student) return;
    handleClose();
    selectStudentForSchedule(student);
    openModal('schedule');
  };

  const handleClose = () => {
    setName('');
    setBalanceStr('');
    setPriceStr('');
    setError(null);
    closeModal('addStudent');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Додати учня" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я учня *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ім'я учня"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ціна за урок (₴)</label>
          <input
            type="text"
            inputMode="decimal"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="350.00"
          />
          <p className="text-xs text-gray-500 mt-1">Можна вказати з копійками. Можна змінити пізніше.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Початковий баланс (уроків)</label>
          <input
            type="text"
            inputMode="numeric"
            value={balanceStr}
            onChange={(e) => setBalanceStr(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0"
          />
          <p className="text-xs text-gray-500 mt-1">Кількість вже оплачених уроків</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        <button type="button" onClick={handleCreateWithSchedule} disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
          <Calendar size={16} /> Додати й створити розклад
        </button>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={handleClose} disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            Скасувати
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {loading ? 'Додавання...' : 'Додати'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AddStudentModal;
