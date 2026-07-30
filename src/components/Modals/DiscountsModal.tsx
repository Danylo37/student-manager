import { useState, useEffect, useCallback } from 'react';
import useAppStore from '@/store/appStore';
import { useNotification } from '../common/NotificationProvider';
import { formatUAH, parseInputToKopiyky, pricePerLesson } from '@/utils/financials';
import Modal from './Modal';
import type { Discount } from '@/types';

function DiscountsModal() {
  const isOpen = useAppStore((s) => s.modals.discounts);
  const closeModal = useAppStore((s) => s.closeModal);
  const student = useAppStore((s) => s.selectedStudentForDiscounts);
  const { showToast, showConfirm } = useNotification();

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(false);
  const [countStr, setCountStr] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDiscounts = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    try {
      setDiscounts(await window.electron.getDiscounts(student.id));
    } catch {
      showToast('Помилка завантаження знижок', 'error');
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (isOpen && student) void loadDiscounts();
  }, [isOpen, student, loadDiscounts]);

  const handleAdd = async () => {
    setFormError(null);
    const count = parseInt(countStr);
    const totalKopiyky = parseInputToKopiyky(totalStr);

    if (!countStr || isNaN(count) || count < 2) { setFormError('Мінімум 2 уроки в пакеті'); return; }
    if (totalKopiyky === null || totalKopiyky <= 0) { setFormError('Вкажіть коректну суму'); return; }

    const basePrice = student?.current_price;
    if (basePrice && totalKopiyky >= basePrice * count) {
      setFormError(`Знижка має бути менше базової суми (${formatUAH(basePrice * count)})`);
      return;
    }

    setAdding(true);
    try {
      await window.electron.addDiscount(student!.id, count, totalKopiyky, description.trim() || null);
      showToast(`Додано: ${count} уроків → ${formatUAH(totalKopiyky)}`, 'success');
      setCountStr('');
      setTotalStr('');
      setDescription('');
      await loadDiscounts();
    } catch {
      showToast('Помилка при додаванні', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (d: Discount) => {
    const confirmed = await showConfirm({
      title: 'Видалити знижку?',
      message: `Пакет "${d.lessons_count} уроків → ${formatUAH(d.total_price)}" буде видалено.`,
      confirmLabel: 'Видалити', cancelLabel: 'Скасувати', danger: true,
    });
    if (!confirmed) return;
    try {
      await window.electron.deleteDiscount(d.id);
      showToast('Знижку видалено', 'success');
      await loadDiscounts();
    } catch { showToast('Помилка', 'error'); }
  };

  const handleToggle = async (id: number) => {
    try {
      await window.electron.toggleDiscountActive(id);
      await loadDiscounts();
    } catch { showToast('Помилка', 'error'); }
  };

  if (!student) return null;

  const basePrice = student.current_price;
  const active = discounts.filter((d) => d.is_active);
  const inactive = discounts.filter((d) => !d.is_active);

  // Live preview
  const previewCount = parseInt(countStr);
  const previewTotal = parseInputToKopiyky(totalStr);
  const previewValid = !isNaN(previewCount) && previewCount >= 2 && previewTotal !== null && previewTotal > 0;

  const DiscountRow = ({ d }: { d: Discount }) => {
    const perLesson = pricePerLesson(d.total_price, d.lessons_count);
    const saving = basePrice ? (basePrice - perLesson) * d.lessons_count : null;
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${d.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{d.lessons_count} уроків → {formatUAH(d.total_price)}</span>
            <span className="text-sm text-gray-500">({formatUAH(perLesson)}/урок)</span>
            {saving !== null && saving > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                економія {formatUAH(saving)}
              </span>
            )}
          </div>
          {d.description && <div className="text-xs text-gray-400 mt-0.5">{d.description}</div>}
        </div>
        <button onClick={() => handleToggle(d.id)} className="text-lg hover:scale-110 transition-transform" title={d.is_active ? 'Призупинити' : 'Активувати'}>
          {d.is_active ? '⏸' : '▶'}
        </button>
        <button onClick={() => handleDelete(d)} className="text-red-400 hover:text-red-600 font-bold text-xl" title="Видалити">×</button>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={() => closeModal('discounts')} title={`Знижки: ${student.name}`} size="md">
      <div className="space-y-5">
        {basePrice != null ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            Базова ціна: <strong>{formatUAH(basePrice)}/урок</strong>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            ⚠️ Ціна за урок не встановлена. Встановіть її в списку учнів.
          </div>
        )}

        {/* Add form */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Новий пакет</h3>
          <div className="flex gap-2 items-start flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Кількість уроків</label>
              <input type="text" inputMode="numeric" value={countStr}
                onChange={(e) => { setCountStr(e.target.value); setFormError(null); }}
                onFocus={(e) => e.target.select()}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="3" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Сума за пакет (₴)</label>
              <input type="text" inputMode="decimal" value={totalStr}
                onChange={(e) => { setTotalStr(e.target.value); setFormError(null); }}
                onFocus={(e) => e.target.select()}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="1000.00" />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-32">
              <label className="text-xs text-gray-500">Коментар</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="необов'язково" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs invisible">.</label>
              <button onClick={handleAdd} disabled={adding}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {adding ? '...' : '+ Додати'}
              </button>
            </div>
          </div>

          {previewValid && previewTotal !== null && (
            <div className="text-xs text-gray-500">
              → {formatUAH(pricePerLesson(previewTotal, previewCount))}/урок
              {basePrice && previewTotal < basePrice * previewCount && (
                <span className="text-green-600 ml-2">
                  (економія {formatUAH((basePrice - pricePerLesson(previewTotal, previewCount)) * previewCount)})
                </span>
              )}
            </div>
          )}
          {formError && <div className="text-sm text-red-600">{formError}</div>}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Завантаження...</div>
        ) : discounts.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">Знижок ще немає.</div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-700 text-sm">Активні</h3>
                {active.map((d) => <DiscountRow key={d.id} d={d} />)}
              </div>
            )}
            {inactive.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-500 text-sm">Призупинені</h3>
                {inactive.map((d) => <DiscountRow key={d.id} d={d} />)}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default DiscountsModal;
