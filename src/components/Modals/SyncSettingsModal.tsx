import React, { useEffect, useState } from 'react';
import useAppStore from '@/store/appStore';
import { useNotification } from '../common/NotificationProvider';
import { describeSyncStatus } from '@/utils/syncStatus';
import Modal from './Modal';

/**
 * Where the desktop talks to the cloud from: the Worker address and the device
 * secret. The secret is never shown back; an empty field keeps the stored one.
 */
function SyncSettingsModal() {
  const isOpen = useAppStore((s) => s.modals.syncSettings);
  const closeModal = useAppStore((s) => s.closeModal);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const { showToast, showConfirm } = useNotification();

  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSecret('');
    void window.electron.getSyncSettings().then((settings) => {
      setUrl(settings.url);
      setHasSecret(settings.hasSecret);
    });
  }, [isOpen]);

  const enabled = syncStatus != null && syncStatus.state !== 'off';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!url.trim()) {
      showToast('Вкажіть адресу сервера', 'error');
      return;
    }
    if (!secret.trim() && !hasSecret) {
      showToast('Вкажіть секрет пристрою', 'error');
      return;
    }
    setSaving(true);
    try {
      await window.electron.saveSyncSettings({ url, secret: secret.trim() || null });
      showToast('Налаштування збережено, синхронізація запущена', 'success');
      closeModal('syncSettings');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message.replace(/^.*Error: /, ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const status = await window.electron.syncNow();
      showToast(describeSyncStatus(status), status.state === 'error' ? 'error' : 'success');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    const confirmed = await showConfirm({
      title: 'Вимкнути синхронізацію?',
      message: 'Адресу і секрет буде видалено. Дані на телефоні перестануть оновлюватися.',
      confirmLabel: 'Вимкнути',
      cancelLabel: 'Скасувати',
      danger: true,
    });
    if (!confirmed) return;
    await window.electron.saveSyncSettings({ url: '', secret: null });
    showToast('Синхронізацію вимкнено', 'info');
    closeModal('syncSettings');
  };

  const inputClass =
    'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => closeModal('syncSettings')}
      title="Синхронізація з телефоном"
      size="sm"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Адреса сервера</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
            placeholder="https://….workers.dev"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Секрет пристрою</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={inputClass}
            placeholder={hasSecret ? '•••••••• (збережено, залиште порожнім)' : 'DEVICE_SECRET'}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">
            Зберігається зашифрованим і більше не показується.
          </p>
        </div>

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

        <div className="flex gap-3 pt-1">
          {enabled && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Синхронізувати зараз
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => closeModal('syncSettings')}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Скасувати
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>

        {enabled && (
          <button
            type="button"
            onClick={handleDisable}
            disabled={saving}
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
