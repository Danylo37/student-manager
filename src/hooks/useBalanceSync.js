import { useEffect } from 'react';
import useAppStore from '../store/appStore';

/**
 * Hook for automatic lesson synchronization
 * Syncs completed lessons on mount and periodically
 */
function useBalanceSync() {
    const syncLessons = useAppStore((state) => state.syncLessons);
    const loadStudents = useAppStore((state) => state.loadStudents);
    const loadLessons = useAppStore((state) => state.loadLessons);

    useEffect(() => {
        // Sync immediately on mount
        const performSync = async () => {
            try {
                await syncLessons();
                // Reload data after sync
                await loadStudents();
                await loadLessons();
            } catch (error) {
                console.error('Balance sync failed:', error);
            }
        };

        performSync();

        // Sync every 5 minutes
        const interval = setInterval(performSync, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [syncLessons, loadStudents, loadLessons]);
}

export default useBalanceSync;
