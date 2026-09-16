import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import useAppStore from '@/store/appStore';
import useStudents from '@/hooks/useStudents';
import { useNotification } from '../common/NotificationProvider';
import { formatUAH, hasAnyTax, parseInputToKopiyky } from '@/utils/financials';
import { lessonsWordUA } from '@/utils/plural';
import { rejectionReason } from '@/utils/ipc';
import Modal from './Modal';
import type { Discount, DiscountInput, Student } from '@/types';

function AddStudentModal() {
  const isOpen = useAppStore((s) => s.modals.addStudent);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);
  const selectStudentForSchedule = useAppStore((s) => s.selectStudentForSchedule);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const { addStudent } = useStudents();
  const { showToast } = useNotification();

  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [balanceStr, setBalanceStr] = useState('');
  const [packageCountStr, setPackageCountStr] = useState('');
  const [packageTotalStr, setPackageTotalStr] = useState('');
  const [taxExempt, setTaxExempt] = useState(false);
  const [globalDiscounts, setGlobalDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A global package prices the starting balance too, so it has to be known here
  useEffect(() => {
    if (!isOpen) return;
    window.electron
      .getGlobalDiscounts()
      .then(setGlobalDiscounts)
      .catch(() => setGlobalDiscounts([]));
  }, [isOpen]);

  const taxesOn = hasAnyTax(taxSettings);
  // Without a price there is nothing to price a payment or a package with
  const hasPrice = priceStr.trim() !== '';
  const priceKopiyky = hasPrice ? parseInputToKopiyky(priceStr) : null;
  const balance = balanceStr.trim() === '' ? 0 : Number(balanceStr);
  const packageCount = packageCountStr.trim() === '' ? null : Number(packageCountStr);
  const packageTotal = packageTotalStr.trim() === '' ? null : parseInputToKopiyky(packageTotalStr);
  const hasPackage = packageCountStr.trim() !== '' || packageTotalStr.trim() !== '';

  // What the starting balance is recorded as: the package from this form when the
  // count matches it, else a global one, else price × lessons — the same rule
  // the ledger applies to any payment.
  const packageFromForm =
    packageCount !== null && packageCount === balance && packageTotal !== null
      ? packageTotal
      : null;
  const packageFromGlobal =
    globalDiscounts.find((d) => d.is_active && d.lessons_count === balance)?.total_price ?? null;
  const paymentTotal =
    balance > 0 && priceKopiyky !== null
      ? (packageFromForm ?? packageFromGlobal ?? priceKopiyky * balance)
      : null;

  const validate = (): { balance: number; discount: DiscountInput | null } | null => {
    if (!name.trim()) return fail("Введіть ім'я учня");
    if (hasPrice && priceKopiyky === null) return fail('Введіть коректну ціну');
    if (!Number.isInteger(balance) || balance < 0) {
      return fail('Початковий баланс: ціле число уроків, не менше 0');
    }
    if (balance > 0 && priceKopiyky === null) {
      return fail('Вкажіть ціну уроку: початковий баланс запишеться як оплата');
    }
    let discount: DiscountInput | null = null;
    if (hasPackage) {
      if (priceKopiyky === null) return fail('Вкажіть ціну уроку, щоб додати пакет');
      if (packageCount === null || !Number.isInteger(packageCount) || packageCount < 2) {
        return fail('Мінімум 2 уроки в пакеті');
      }
      if (packageTotal === null || packageTotal <= 0) return fail('Вкажіть коректну суму пакета');
      if (packageTotal >= priceKopiyky * packageCount) {
        return fail(`Пакет має бути дешевшим за ${formatUAH(priceKopiyky * packageCount)}`);
      }
      discount = { lessonsCount: packageCount, totalPriceKopiyky: packageTotal };
    }
    return { balance, discount };
  };

  const fail = (message: string) => {
    setError(message);
    return null;
  };

  const createStudent = async (): Promise<Student | null> => {
    const input = validate();
    if (!input) return null;

    setLoading(true);
    setError(null);
    try {
      const student = await addStudent(
        name.trim(),
        input.balance,
        priceKopiyky,
        taxesOn && taxExempt,
        input.discount,
      );
      showToast(`Учня "${name.trim()}" додано!`, 'success');
      return student;
    } catch (err) {
      const reason = rejectionReason(err);
      if (reason) setError(reason);
      else showToast('Помилка при додаванні учня!', 'error');
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

  const handlePriceChange = (value: string) => {
    setPriceStr(value);
    // The balance and the package hang on the price, so they go with it
    if (value.trim() === '') {
      setBalanceStr('');
      setPackageCountStr('');
      setPackageTotalStr('');
    }
  };

  const handleClose = () => {
    setName('');
    setPriceStr('');
    setBalanceStr('');
    setPackageCountStr('');
    setPackageTotalStr('');
    setTaxExempt(false);
    setError(null);
    closeModal('addStudent');
  };

  const inputClass =
    'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Додати учня" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я учня *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
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
            onChange={(e) => handlePriceChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            className={inputClass}
            placeholder="350.00"
          />
          <p className="text-xs text-gray-500 mt-1">
            Можна змінити пізніше. 0 — якщо уроки вже оплачені до початку обліку.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Початковий баланс (уроків)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={balanceStr}
            onChange={(e) => setBalanceStr(e.target.value)}
            onFocus={(e) => e.target.select()}
            className={inputClass}
            placeholder="0"
            disabled={!hasPrice}
          />
          <p className="text-xs text-gray-500 mt-1">
            {paymentTotal !== null
              ? `Запишеться як оплата сьогодні: ${balance} ${lessonsWordUA(balance)} на ${formatUAH(paymentTotal)}`
              : 'Вже оплачені уроки. Запишуться як оплата сьогодні за ціною уроку.'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Пакет зі знижкою (необов'язково)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={packageCountStr}
              onChange={(e) => setPackageCountStr(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={`${inputClass} w-24`}
              placeholder="10"
              disabled={!hasPrice}
            />
            <span className="text-sm text-gray-500 whitespace-nowrap">уроків за</span>
            <input
              type="text"
              inputMode="decimal"
              value={packageTotalStr}
              onChange={(e) => setPackageTotalStr(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={inputClass}
              placeholder="3000.00"
              disabled={!hasPrice}
            />
            <span className="text-sm text-gray-500">₴</span>
          </div>
        </div>

        {taxesOn && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={taxExempt}
              onChange={(e) => setTaxExempt(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">Не враховувати податки</span>
          </label>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreateWithSchedule}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Calendar size={16} /> Додати й створити розклад
        </button>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Додавання...' : 'Додати'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AddStudentModal;
