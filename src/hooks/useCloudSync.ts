import { useEffect } from 'react';
import useAppStore from '@/store/appStore';

/**
 * Follows the cloud sync in main: the indicator's status, and a reload of
 * students and lessons whenever an intent from the phone lands in the database.
 */
function useCloudSync(): void {
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);
  const loadStudents = useAppStore((state) => state.loadStudents);
  const loadLessons = useAppStore((state) => state.loadLessons);

  useEffect(() => {
    void window.electron.getSyncStatus().then(setSyncStatus);
    const offStatus = window.electron.onSyncStatus(setSyncStatus);
    const offChanged = window.electron.onSyncChanged(() => {
      void loadStudents();
      void loadLessons();
    });
    return () => {
      offStatus();
      offChanged();
    };
  }, [setSyncStatus, loadStudents, loadLessons]);
}

export default useCloudSync;
