import { useState, useEffect } from 'react';
import {
  Calendar,
  CalendarPlus,
  DollarSign,
  Tag,
  Percent,
  Wallet,
  Trash2,
  Gift,
  Pencil,
} from 'lucide-react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import { useNotification } from '../common/NotificationProvider';
import { formatUAH, parseInputToKopiyky, kopiykyToInput, hasAnyTax } from '@/utils/financials';
import { submitOnEnter } from '@/utils/keyboard';
import { rejectionReason } from '@/utils/ipc';
import { lessonsWordUA } from '@shared/plural';
import Modal from './Modal';
import ActionMenu, { type ActionMenuItem } from '../common/ActionMenu';
import type { Discount, Student } from '@/types';

type EditMode = 'balance' | 'price' | 'name' | null;

function StudentsListModal() {
  const isOpen = useAppStore((s) => s.modals.studentsList);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);
  const openAddLessonModal = useAppStore((s) => s.openAddLessonModal);
  const setReturnToStudentsList = useAppStore((s) => s.setReturnToStudentsList);
  const selectStudentForSchedule = useAppStore((s) => s.selectStudentForSchedule);
  const selectStudentForDiscounts = useAppStore((s) => s.selectStudentForDiscounts);
  const { students, searchStudents, deleteStudent, updateBalance } = useStudents();
  const updateStudentName = useAppStore((s) => s.updateStudentName);
  const setStudentTaxExempt = useAppStore((s) => s.setStudentTaxExempt);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const { showToast, showConfirm, showChoice } = useNotification();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [balanceStr, setBalanceStr] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [nameStr, setNameStr] = useState('');
  const [discountHint, setDiscountHint] = useState<Discount | null>(null);

  // Check for applicable discount when balance amount changes
  useEffect(() => {
    const amount = parseInt(balanceStr);
    if (!editingStudentId || editMode !== 'balance' || !amount || amount <= 0) {
      setDiscountHint(null);
      return;
    }
    window.electron
      .findApplicableDiscount(editingStudentId, amount)
      .then(setDiscountHint)
      .catch(() => setDiscountHint(null));
  }, [balanceStr, editingStudentId, editMode]);

  const stopEditing = () => {
    setEditingStudentId(null);
    setEditMode(null);
    setBalanceStr('');
    setPriceStr('');
    setNameStr('');
    setDiscountHint(null);
  };

  /**
   * A student who paid ahead leaves with a choice: the money goes back as a
   * refund, or stays as the income it already is. Either way the lessons given
   * stay in the statistics.
   */
  const handleDelete = async (studentId: number, studentName: string) => {
    let advance = { lessons: 0, amount: 0 };
    try {
      advance = await window.electron.getStudentAdvance(studentId);
    } catch {
      showToast('Помилка при видаленні!', 'error');
      return;
    }

    let refund = false;
    if (advance.lessons > 0) {
      const choice = await showChoice({
        title: 'Видалити учня?',
        message: `У "${studentName}" є аванс: ${advance.lessons} ${lessonsWordUA(advance.lessons)} на ${formatUAH(advance.amount)}. Повернути гроші чи залишити як дохід? Проведені уроки залишаться в статистиці.`,
        choices: [
          { value: 'refund', label: `Повернути ${formatUAH(advance.amount)}`, danger: true },
          { value: 'keep', label: 'Залишити як дохід', danger: true },
        ],
      });
      if (!choice) return;
      refund = choice === 'refund';
    } else {
      const confirmed = await showConfirm({
        title: 'Видалити учня?',
        message: `Учень "${studentName}" буде видалений. Проведені уроки залишаться в статистиці.`,
        confirmLabel: 'Видалити',
        cancelLabel: 'Скасувати',
        danger: true,
      });
      if (!confirmed) return;
    }

    try {
      await deleteStudent(studentId, refund);
      showToast(
        refund
          ? `Учня "${studentName}" видалено, повернено ${formatUAH(advance.amount)}`
          : `Учня "${studentName}" видалено!`,
        'success',
      );
    } catch (err) {
      showToast(rejectionReason(err) ?? 'Помилка при видаленні!', 'error');
    }
  };

  const handleBalanceSubmit = async (studentId: number) => {
    const amount = parseInt(balanceStr);
    if (!balanceStr || isNaN(amount)) {
      showToast('Введіть кількість уроків', 'error');
      return;
    }
    try {
      const applied = await updateBalance(studentId, amount);
      const msg = amount >= 0 ? 'Уроків додано:' : 'Уроків знято:';
      const shortfall = applied < Math.abs(amount) ? ` із ${Math.abs(amount)}` : '';
      showToast(`${msg} ${applied}${shortfall}`, 'success');
      stopEditing();
    } catch (err) {
      showToast(rejectionReason(err) ?? 'Помилка при оновленні балансу!', 'error');
    }
  };

  const handlePriceSubmit = async (studentId: number) => {
    const kopiyky = parseInputToKopiyky(priceStr);
    if (kopiyky === null) {
      showToast('Введіть коректну ціну', 'error');
      return;
    }
    try {
      await window.electron.setStudentPrice(studentId, kopiyky);
      await useAppStore.getState().loadStudents();
      showToast(`Ціну оновлено: ${formatUAH(kopiyky)}`, 'success');
      stopEditing();
    } catch {
      showToast('Помилка при оновленні ціни!', 'error');
    }
  };

  const handleNameSubmit = async (studentId: number) => {
    const name = nameStr.trim();
    if (!name) {
      showToast("Введіть ім'я", 'error');
      return;
    }
    try {
      await updateStudentName(studentId, name);
      showToast(`Ім'я змінено: ${name}`, 'success');
      stopEditing();
    } catch {
      showToast('Помилка при зміні імені!', 'error');
    }
  };

  /** Only new payments follow the flag: each one snapshots it when it is recorded. */
  const handleToggleTaxExempt = async (student: Student) => {
    const exempt = !student.is_tax_exempt;
    try {
      await setStudentTaxExempt(student.id, exempt);
      showToast(
        exempt
          ? `Нові оплати "${student.name}" не оподатковуються`
          : `Нові оплати "${student.name}" знову оподатковуються`,
        'success',
      );
    } catch {
      showToast('Помилка при зміні податків!', 'error');
    }
  };

  const filteredStudents = searchStudents(searchQuery);
  const taxesOn = hasAnyTax(taxSettings);

  const buildActions = (student: Student): ActionMenuItem[] => [
    {
      icon: <Pencil size={14} />,
      label: 'Перейменувати',
      onClick: () => {
        setEditingStudentId(student.id);
        setEditMode('name');
        setNameStr(student.name);
      },
    },
    {
      icon: <Calendar size={14} />,
      label: 'Розклад',
      onClick: () => {
        setReturnToStudentsList(true);
        selectStudentForSchedule(student);
        handleClose();
        openModal('schedule');
      },
    },
    {
      icon: <CalendarPlus size={14} />,
      label: 'Створити урок',
      onClick: () => {
        setReturnToStudentsList(true);
        handleClose();
        openAddLessonModal(null, student.id);
      },
    },
    {
      icon: <DollarSign size={14} />,
      label: 'Ціна',
      onClick: () => {
        setEditingStudentId(student.id);
        setEditMode('price');
        setPriceStr(student.current_price != null ? kopiykyToInput(student.current_price) : '');
      },
    },
    {
      icon: <Tag size={14} />,
      label: 'Знижки',
      onClick: () => {
        setReturnToStudentsList(true);
        selectStudentForDiscounts(student);
      },
    },
    // Pointless while every tax is off, so it stays out of the menu until one is on.
    ...(taxesOn
      ? [
          {
            icon: <Percent size={14} />,
            label: 'Не оподатковувати',
            onClick: () => void handleToggleTaxExempt(student),
            active: !!student.is_tax_exempt,
          },
        ]
      : []),
    {
      icon: <Trash2 size={14} />,
      label: 'Видалити',
      onClick: () => void handleDelete(student.id, student.name),
      danger: true,
      separatorBefore: true,
    },
  ];

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
              <div
                key={student.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-800 truncate">{student.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-600">
                      <span>
                        Баланс:{' '}
                        <span
                          className={`font-bold ${student.balance < 0 ? 'text-red-600' : student.balance < 3 ? 'text-yellow-600' : 'text-green-600'}`}
                        >
                          {student.balance}
                        </span>
                      </span>
                      <span>Проведено: {student.completed_lessons_count ?? 0}</span>
                      {student.current_price != null ? (
                        <span className="text-green-700 font-medium">
                          {formatUAH(student.current_price)}/урок
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Ціна не вказана</span>
                      )}
                      {taxesOn && !!student.is_tax_exempt && (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1">
                          <Percent size={12} /> без податків
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingStudentId === student.id && editMode === 'name' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={nameStr}
                          onChange={(e) => setNameStr(e.target.value)}
                          onKeyDown={submitOnEnter(() => void handleNameSubmit(student.id))}
                          onFocus={(e) => e.target.select()}
                          className="w-56 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="Ім'я учня"
                          autoFocus
                        />
                        <button
                          onClick={() => handleNameSubmit(student.id)}
                          className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                        >
                          ✓
                        </button>
                        <button
                          onClick={stopEditing}
                          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : editingStudentId === student.id && editMode === 'balance' ? (
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={balanceStr}
                            onChange={(e) => setBalanceStr(e.target.value)}
                            onKeyDown={submitOnEnter(() => void handleBalanceSubmit(student.id))}
                            onFocus={(e) => e.target.select()}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="±0"
                            autoFocus
                          />
                          <button
                            onClick={() => handleBalanceSubmit(student.id)}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                          >
                            ✓
                          </button>
                          <button
                            onClick={stopEditing}
                            className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm"
                          >
                            ✕
                          </button>
                        </div>
                        {discountHint && (
                          <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded flex items-center gap-1">
                            <Gift size={12} /> Знижка: {formatUAH(discountHint.total_price)} за{' '}
                            {discountHint.lessons_count} уроки
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
                            onKeyDown={submitOnEnter(() => void handlePriceSubmit(student.id))}
                            onFocus={(e) => e.target.select()}
                            className="w-28 pl-2 pr-6 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="350.00"
                            autoFocus
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                            ₴
                          </span>
                        </div>
                        <button
                          onClick={() => handlePriceSubmit(student.id)}
                          className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                        >
                          ✓
                        </button>
                        <button
                          onClick={stopEditing}
                          className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingStudentId(student.id);
                            setEditMode('balance');
                            setBalanceStr('');
                          }}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium flex items-center gap-1"
                        >
                          <Wallet size={14} /> Баланс ±
                        </button>
                        <ActionMenu items={buildActions(student)} />
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
