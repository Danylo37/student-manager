import { useState, useEffect } from 'react';
import { Calendar, DollarSign, Tag } from 'lucide-react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import { useNotification } from '../common/NotificationProvider';
import { formatUAH, parseInputToKopiyky, kopiykyToInput } from '@/utils/financials';
import Modal from './Modal';
import type { Discount } from '@/types';

type EditMode = 'balance' | 'price' | null;

function StudentsListModal() {
  const isOpen = useAppStore((s) => s.modals.studentsList);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);
  const selectStudentForSchedule = useAppStore((s) => s.selectStudentForSchedule);
  const selectStudentForDiscounts = useAppStore((s) => s.selectStudentForDiscounts);
  const { students, searchStudents, deleteStudent, updateBalance } = useStudents();
  const { showToast, showConfirm } = useNotification();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [balanceStr, setBalanceStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [discountHint, setDiscountHint] = useState<Discount | null>(null);

  // Check for applicable discount when balance amount changes
  useEffect(() => {
    const amount = parseInt(balanceStr);
    if (!editingStudentId || editMode !== 'balance' || !amount || amount <= 0) {
      setDiscountHint(null);
      return;
    }
    window.electron.findApplicableDiscount(editingStudentId, amount)
      .then(setDiscountHint)
      .catch(() => setDiscountHint(null));
  }, [balanceStr, editingStudentId, editMode]);

  const stopEditing = () => {
    setEditingStudentId(null);
    setEditMode(null);
    setBalanceStr('');
    setPriceStr('');
    setDiscountHint(null);
  };

  const handleDelete = async (studentId: number, studentName: string) => {
    const confirmed = await showConfirm({
      title: 'Видалити учня?',
      message: `Учень "${studentName}" буде видалений. Проведені уроки залишаться в статистиці.`,
      confirmLabel: 'Видалити',
      cancelLabel: 'Скасувати',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteStudent(studentId);
      showToast(`Учня "${studentName}" видалено!`, 'success');
    } catch {
      showToast('Помилка при видаленні!', 'error');
    }
  };

  const handleBalanceSubmit = async (studentId: number) => {
    const amount = parseInt(balanceStr);
    if (!balanceStr || isNaN(amount)) { showToast('Введіть кількість уроків', 'error'); return; }
    try {
      await updateBalance(studentId, amount);
      const msg = amount >= 0 ? 'Уроків додано:' : 'Уроків знято:';
      showToast(`${msg} ${Math.abs(amount)}`, 'success');
      stopEditing();
    } catch {
      showToast('Помилка при оновленні балансу!', 'error');
    }
  };

  const handlePriceSubmit = async (studentId: number) => {
    const kopiyky = parseInputToKopiyky(priceStr);
    if (kopiyky === null || kopiyky <= 0) { showToast('Введіть коректну ціну', 'error'); return; }
    try {
      await window.electron.setStudentPrice(studentId, kopiyky);
      await useAppStore.getState().loadStudents();
      showToast(`Ціну оновлено: ${formatUAH(kopiyky)}`, 'success');
      stopEditing();
    } catch {
      showToast('Помилка при оновленні ціни!', 'error');
    }
  };

  const filteredStudents = searchStudents(searchQuery);

  const handleClose = () => {
    setSearchQuery('');
    stopEditing();
    closeModal('studentsList');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Список учнів" size="lg">
      <div className="space-y-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Пошук учня..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />

        <div className="bg-blue-50 p-3 rounded-lg">
          <span className="text-lg font-bold text-blue-700">Всього учнів: {students.length}</span>
        </div>

        <div className="space-y-2 overflow-y-auto p-1">
          {filteredStudents.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              {searchQuery ? 'Нічого не знайдено' : 'Немає учнів'}
            </div>
          ) : (
            filteredStudents.map((student) => (
              <div key={student.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-800 truncate">{student.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                      <span>
                        Баланс:{' '}
                        <span className={`font-bold ${student.balance < 0 ? 'text-red-600' : student.balance < 3 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {student.balance}
                        </span>
                      </span>
                      <span>Проведено: {student.completed_lessons_count ?? 0}</span>
                      {student.current_price != null ? (
                        <span className="text-green-700 font-medium">
                          💰 {formatUAH(student.current_price)}/урок
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Ціна не вказана</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingStudentId === student.id && editMode === 'balance' ? (
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={balanceStr}
                            onChange={(e) => setBalanceStr(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="±0"
                            autoFocus
                          />
                          <button onClick={() => handleBalanceSubmit(student.id)} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm">✓</button>
                          <button onClick={stopEditing} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm">✕</button>
                        </div>
                        {discountHint && (
                          <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                            🎁 Знижка: {formatUAH(discountHint.total_price)} за {discountHint.lessons_count} уроки
                          </div>
                        )}
                      </div>
                    ) : editingStudentId === student.id && editMode === 'price' ? (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={priceStr}
                            onChange={(e) => setPriceStr(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-28 pl-2 pr-6 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="350.00"
                            autoFocus
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₴</span>
                        </div>
                        <button onClick={() => handlePriceSubmit(student.id)} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm">✓</button>
                        <button onClick={stopEditing} className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm">✕</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { selectStudentForSchedule(student); handleClose(); openModal('schedule'); }}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium flex items-center gap-1"
                        >
                          <Calendar size={14} /> Розклад
                        </button>
                        <button
                          onClick={() => { setEditingStudentId(student.id); setEditMode('balance'); setBalanceStr(''); }}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium"
                        >
                          Баланс ±
                        </button>
                        <button
                          onClick={() => { setEditingStudentId(student.id); setEditMode('price'); setPriceStr(student.current_price ? kopiykyToInput(student.current_price) : ''); }}
                          className="px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-sm font-medium flex items-center gap-1"
                        >
                          <DollarSign size={14} /> Ціна
                        </button>
                        <button
                          onClick={() => selectStudentForDiscounts(student)}
                          className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-sm font-medium flex items-center gap-1"
                        >
                          <Tag size={14} /> Знижки
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
