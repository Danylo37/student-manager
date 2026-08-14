import { useState, useEffect } from 'react';
import useAppStore from '@/store/appStore';
import { useNotification } from '../common/NotificationProvider';
import {
  parseInputToKopiyky,
  kopiykyToInput,
  DEFAULT_SINGLE_TAX_RATE,
  DEFAULT_MILITARY_TAX_RATE,
} from '@/utils/financials';
import Modal from './Modal';
import type { TaxSettings } from '@/types';

function TaxSettingsModal() {
  const isOpen = useAppStore((s) => s.modals.taxSettings);
  const closeModal = useAppStore((s) => s.closeModal);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const saveTaxSettings = useAppStore((s) => s.saveTaxSettings);
  const { showToast } = useNotification();

  const [esvType, setEsvType] = useState<'none' | 'fixed'>('none');
  const [esvFixedStr, setEsvFixedStr] = useState('');
  const [singleEnabled, setSingleEnabled] = useState(false);
  const [singleRateStr, setSingleRateStr] = useState(String(DEFAULT_SINGLE_TAX_RATE));
  const [militaryEnabled, setMilitaryEnabled] = useState(false);
  const [militaryRateStr, setMilitaryRateStr] = useState(String(DEFAULT_MILITARY_TAX_RATE));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (taxSettings && isOpen) {
      setEsvType(taxSettings.esv_type as 'none' | 'fixed');
      setEsvFixedStr(taxSettings.esv_fixed > 0 ? kopiykyToInput(taxSettings.esv_fixed) : '');
      setSingleEnabled(!!taxSettings.single_tax_enabled);
      setSingleRateStr(String(taxSettings.single_tax_rate ?? DEFAULT_SINGLE_TAX_RATE));
      setMilitaryEnabled(!!taxSettings.military_tax_enabled);
      setMilitaryRateStr(String(taxSettings.military_tax_rate ?? DEFAULT_MILITARY_TAX_RATE));
    }
  }, [taxSettings, isOpen]);

  const handleSave = async () => {
    const esvFixed = esvType === 'fixed' ? (parseInputToKopiyky(esvFixedStr) ?? 0) : 0;

    const singleRate = parseFloat(singleRateStr.replace(',', '.')) || 0;
    const militaryRate = parseFloat(militaryRateStr.replace(',', '.')) || 0;

    const settings: Omit<TaxSettings, 'id' | 'updated_at'> = {
      esv_type: esvType,
      esv_fixed: esvFixed,
      single_tax_enabled: singleEnabled ? 1 : 0,
      single_tax_rate: singleRate,
      military_tax_enabled: militaryEnabled ? 1 : 0,
      military_tax_rate: militaryRate,
    };

    setSaving(true);
    try {
      await saveTaxSettings(settings);
      showToast('Налаштування збережено!', 'success');
      closeModal('taxSettings');
    } catch {
      showToast('Помилка при збереженні!', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => closeModal('taxSettings')}
      title="Налаштування податків"
      size="sm"
    >
      <div className="space-y-5">
        {/* Single tax (єдиний податок) */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">Єдиний податок</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={singleEnabled}
              onChange={(e) => setSingleEnabled(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700 flex-1">Сплачую єдиний податок</span>
            {singleEnabled && (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={singleRateStr}
                  onChange={(e) => setSingleRateStr(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500 text-sm">%</span>
              </div>
            )}
          </label>
          <p className="text-xs text-gray-400">
            {DEFAULT_SINGLE_TAX_RATE}% від доходу — ставка для ФОП 3 групи без ПДВ.
          </p>
        </div>

        {/* ESV */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">ЄСВ (Єдиний соціальний внесок)</h3>
          <div className="flex gap-2">
            {(['none', 'fixed'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setEsvType(v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  esvType === v
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {v === 'none' ? 'Не сплачую' : 'Фіксована сума'}
              </button>
            ))}
          </div>
          {esvType === 'fixed' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={esvFixedStr}
                onChange={(e) => setEsvFixedStr(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
              <span className="text-gray-600 text-sm">₴/місяць</span>
            </div>
          )}
        </div>

        {/* Military tax */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">Військовий збір</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={militaryEnabled}
              onChange={(e) => setMilitaryEnabled(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700 flex-1">Сплачую військовий збір</span>
            {militaryEnabled && (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={militaryRateStr}
                  onChange={(e) => setMilitaryRateStr(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500 text-sm">%</span>
              </div>
            )}
          </label>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => closeModal('taxSettings')}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Скасувати
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TaxSettingsModal;
