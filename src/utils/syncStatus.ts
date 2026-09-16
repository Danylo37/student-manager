import { formatDate, formatTime, isSameDayAs } from './dateHelpers';
import type { SyncStatus } from '@/types';

/** One line for the header tooltip and the settings modal. */
export function describeSyncStatus(status: SyncStatus | null): string {
  if (!status || status.state === 'off') return 'Синхронізацію з телефоном вимкнено';
  if (status.state === 'syncing') return 'Синхронізація…';
  if (status.state === 'error') return `Помилка синхронізації: ${status.error ?? 'невідома'}`;
  if (!status.lastSyncAt) return 'Очікує першої синхронізації';
  const at = new Date(status.lastSyncAt);
  const when = isSameDayAs(at, new Date())
    ? formatTime(at)
    : `${formatDate(at, 'dd.MM')} ${formatTime(at)}`;
  return `Синхронізовано о ${when}`;
}
