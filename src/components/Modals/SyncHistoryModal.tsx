import { useEffect, useState } from 'react';
import useAppStore from '@/store/appStore';
import { formatDate, formatTime, isSameDayAs } from '@/utils/dateHelpers';
import type { SyncHistoryEntry } from '@/types';
import Modal from './Modal';

/** "сьогодні 14:05" or "16.09 22:48": when the tutor tapped it on the phone. */
function whenOnPhone(iso: string): string {
  const at = new Date(iso);
  return isSameDayAs(at, new Date())
    ? `сьогодні ${formatTime(at)}`
    : `${formatDate(at, 'dd.MM')} ${formatTime(at)}`;
}

/**
 * Everything the phone asked the desktop to do, newest first: what it was,
 * whether it was applied, and why not. Reached from the sync settings.
 */
function SyncHistoryModal() {
  const isOpen = useAppStore((s) => s.modals.syncHistory);
  const closeModal = useAppStore((s) => s.closeModal);
  const openModal = useAppStore((s) => s.openModal);

  const [entries, setEntries] = useState<SyncHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEntries(null);
    void window.electron.getSyncHistory().then(setEntries);
  }, [isOpen]);

  const back = () => {
    closeModal('syncHistory');
    openModal('syncSettings');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => closeModal('syncHistory')}
      onBack={back}
      backTitle="Назад до налаштувань синхронізації"
      title="Зміни з телефону"
      size="md"
    >
      {entries === null ? (
        <p className="text-sm text-gray-500">Завантаження…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">Змін з телефону ще не було.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => {
            const applied = entry.status === 'applied';
            return (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                <span
                  className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    applied ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {applied ? '✓' : '✕'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{entry.summary ?? entry.type}</p>
                  {!applied && entry.reason && (
                    <p className="text-xs text-red-600 mt-0.5">{entry.reason}</p>
                  )}
                </div>
                <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                  {whenOnPhone(entry.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default SyncHistoryModal;
