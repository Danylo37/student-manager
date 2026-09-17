import { useEffect } from 'react';
import useAppStore from '@/store/appStore';
import { useNotification } from '@/components/common/NotificationProvider';
import type { SyncChange } from '@/types';

const MAX_TOAST_LINES = 5;
const TOAST_MS = 8000;

function lines(changes: SyncChange[], text: (c: SyncChange) => string): string {
  const shown = changes.slice(0, MAX_TOAST_LINES).map(text);
  if (changes.length > MAX_TOAST_LINES) shown.push(`…та ще ${changes.length - MAX_TOAST_LINES}`);
  return shown.join('\n');
}

/**
 * Follows the cloud sync in main: the indicator's status, a reload of students
 * and lessons whenever the phone's intents land in the database, and a toast
 * saying what they were, so a quiet sync never leaves the tutor guessing.
 * Rendered inside NotificationProvider through CloudSync.
 */
function useCloudSync(): void {
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const loadLessons = useAppStore((state) => state.loadLessons);
  const { showToast } = useNotification();

  useEffect(() => {
    const announce = async () => {
      const changes = await window.electron.takeSyncChanges();
      const applied = changes.filter((c) => c.status === 'applied');
      const rejected = changes.filter((c) => c.status === 'rejected');
      if (applied.length > 0) {
        showToast(`З телефону:\n${lines(applied, (c) => c.summary)}`, 'info', TOAST_MS);
      }
      if (rejected.length > 0) {
        const text = lines(rejected, (c) => `${c.summary} — ${c.reason ?? 'відмовлено'}`);
        showToast(`Відхилено з телефону:\n${text}`, 'error', TOAST_MS);
      }
    };

    void window.electron.getSyncStatus().then(setSyncStatus);
    // Intents applied while the window was still loading are waiting in main.
    void announce();
    const offStatus = window.electron.onSyncStatus(setSyncStatus);
    const offChanged = window.electron.onSyncChanged(() => {
      void loadStudents();
      void loadLessons();
      void announce();
    });
    return () => {
      offStatus();
      offChanged();
    };
  }, [setSyncStatus, loadStudents, loadLessons, showToast]);
}

export default useCloudSync;
