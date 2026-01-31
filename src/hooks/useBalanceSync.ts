import { useEffect, useRef } from 'react';
import useAppStore from '@/store/appStore';

/**
 * Backup sync mechanism
 * Only runs when app starts or user returns
 * Main sync is now handled by useLessonTimers
 */
function useBalanceSync(): void {
    const syncLessons = useAppStore((state) => state.syncLessons);
    const loadStudents = useAppStore((state) => state.loadStudents);
    const loadLessons = useAppStore((state) => state.loadLessons);

    const lastSyncTime = useRef<number>(0);

    const performSync = async (): Promise<void> => {
        try {
            const now = Date.now();
            if (now - lastSyncTime.current < 60 * 1000) {
                return;
            }

            lastSyncTime.current = now;

            await syncLessons();
            await loadStudents();
            await loadLessons();
        } catch (error) {
            console.error('Sync error:', error);
        }
    };

    useEffect(() => {
        // On app start
        void performSync();

        // When user returns to the app
        const handleFocus = (): void => {
            void performSync();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, [syncLessons, loadStudents, loadLessons]);
}

export default useBalanceSync;
