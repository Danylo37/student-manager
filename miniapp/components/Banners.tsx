import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { deniedText } from '../api';
import { describeIntent } from '../describe';
import type { Data } from '../hooks';
import useStore from '../store';
import { zoned } from '../time';
import { Banner } from './ui';

// How honest the screen is: the phone is offline, the desktop has not been
// seen, or the desktop refused something sent from here.

const DEVICE_SILENT_MS = 3 * 60 * 1000;

const when = (iso: string, tz: string, now: Date) => {
  const at = zoned(iso, tz);
  const sameDay = format(at, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
  return format(at, sameDay ? 'HH:mm' : 'd MMM HH:mm', { locale: uk });
};

export default function Banners({ data, now }: { data: Data; now: Date }) {
  const error = useStore((s) => s.error);
  const fetchedAt = useStore((s) => s.fetchedAt);
  const dismissed = useStore((s) => s.dismissed);
  const dismiss = useStore((s) => s.dismiss);
  const { tz, deviceSeenAt, intents, snapshot } = data;

  const deviceSilent = !deviceSeenAt || Date.now() - Date.parse(deviceSeenAt) > DEVICE_SILENT_MS;
  const failed = intents.filter((i) => i.status === 'failed' && !dismissed.includes(i.id));

  return (
    <>
      {error && (
        <Banner>
          {deniedText(error.status) ?? 'Немає зв’язку з хмарою.'}{' '}
          {fetchedAt
            ? `Показано дані від ${when(new Date(fetchedAt).toISOString(), tz, now)}.`
            : 'Показано збережені дані.'}
        </Banner>
      )}
      {!error && deviceSilent && (
        <Banner>
          {deviceSeenAt
            ? `ПК не на зв’язку з ${when(deviceSeenAt, tz, now)}. Зміни застосуються, коли він увімкнеться.`
            : 'ПК ще не синхронізувався. Зміни застосуються, коли він увімкнеться.'}
        </Banner>
      )}
      {failed.map((intent) => (
        <Banner key={intent.id} tone="error" onClose={() => dismiss(intent.id)}>
          {describeIntent(intent, snapshot)}: {intent.reason ?? 'ПК відхилив дію'}
        </Banner>
      ))}
    </>
  );
}
