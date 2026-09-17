import React, { useEffect, useState } from 'react';
import useAppStore from '@/store/appStore';
import { useNotification } from '../common/NotificationProvider';
import { describeSyncStatus } from '@/utils/syncStatus';
import { rejectionReason } from '@/utils/ipc';
import Modal from './Modal';

/**
 * Where the desktop is connected to the phone. Not yet connected, or the cloud
 * no longer accepts our secret: the three steps and the code from the bot.
 * Connected: the status and the actions.
 */
function SyncSettingsModal() {
  const isOpen = useAppStore((s) => s.modals.syncSettings);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const { showToast, showConfirm } = useNotification();

  const [code, setCode] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    void window.electron.getSyncSettings().then((settings) => setHasSecret(settings.hasSecret));
  }, [isOpen]);

  const enabled = syncStatus != null && syncStatus.state !== 'off';
  const pairing = !hasSecret || syncStatus?.needsPairing === true;

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (code.replace(/\D/g, '').length !== 6) {
      showToast('Введіть шість цифр коду з Telegram', 'error');
      return;
    }
    setBusy(true);
    try {
      await window.electron.pairSync(code);
      showToast('Комп’ютер підключено, синхронізація запущена', 'success');
      closeModal('syncSettings');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(rejectionReason(err) ?? message.replace(/^.*Error: /, ''), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const status = await window.electron.syncNow();
      showToast(describeSyncStatus(status), status.state === 'error' ? 'error' : 'success');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    const confirmed = await showConfirm({
      title: 'Вимкнути синхронізацію?',
      message:
        'Комп’ютер від’єднається від хмари, дані на телефоні перестануть оновлюватися. Щоб підключити знову, знадобиться новий код від бота.',
      confirmLabel: 'Вимкнути',
      cancelLabel: 'Скасувати',
      danger: true,
    });
    if (!confirmed) return;
    await window.electron.disableSync();
    showToast('Синхронізацію вимкнено', 'info');
    closeModal('syncSettings');
  };

  const secondaryClass =
    'px-4 py-2 whitespace-nowrap border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => closeModal('syncSettings')}
      title="Синхронізація з телефоном"
      size="auto"
    >
      <form onSubmit={handlePair} className="space-y-4">
        {pairing ? (
          <>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
              <li>У Telegram відкрийте бота і надішліть йому /connect.</li>
              <li>Бот відповість шестизначним кодом.</li>
              <li>Введіть код нижче і натисніть «Підключити».</li>
            </ol>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Код підключення
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-widest"
                placeholder="482 913"
                autoFocus
              />
            </div>
          </>
        ) : null}

        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            syncStatus?.state === 'error'
              ? 'bg-red-50 text-red-700'
              : enabled
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-50 text-gray-600'
          }`}
        >
          {describeSyncStatus(syncStatus)}
        </div>

        <div className="grid grid-flow-col auto-cols-fr gap-3 pt-1">
          {enabled && !pairing && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={busy}
              className={secondaryClass}
            >
              Синхронізувати зараз
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              closeModal('syncSettings');
              openModal('syncHistory');
            }}
            disabled={busy}
            className={secondaryClass}
          >
            Зміни з телефону
          </button>
          <button
            type="button"
            onClick={() => closeModal('syncSettings')}
            disabled={busy}
            className={secondaryClass}
          >
            {pairing ? 'Скасувати' : 'Закрити'}
          </button>
        </div>
        {pairing && (
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {busy ? 'Підключення...' : 'Підключити'}
          </button>
        )}

        {enabled && (
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="w-full text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Вимкнути синхронізацію
          </button>
        )}
      </form>
    </Modal>
  );
}

export default SyncSettingsModal;
