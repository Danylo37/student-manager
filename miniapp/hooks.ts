import { useEffect, useMemo, useState } from 'react';
import type { Intent, Snapshot } from '@shared/types';
import { overlay, type View } from './overlay';
import useStore from './store';
import { onActivated } from './telegram';
import { nowIn } from './time';

export interface Data extends View {
  snapshot: Snapshot;
  tz: string;
  /** Pending and failed: the cloud's list plus what was sent from here and not listed yet. */
  intents: Intent[];
  deviceSeenAt: string | null;
}

/** The snapshot with pending intents laid over it, or null before the first answer. */
export function useData(): Data | null {
  const data = useStore((s) => s.data);
  const local = useStore((s) => s.local);
  return useMemo(() => {
    if (!data?.snapshot) return null;
    // The cloud's copy wins: a local one it already lists would count twice.
    const listed = new Set(data.intents.map((i) => i.id));
    const intents = [...data.intents, ...local.filter((i) => !listed.has(i.id))];
    return {
      snapshot: data.snapshot,
      tz: data.snapshot.timezone,
      intents,
      deviceSeenAt: data.deviceSeenAt,
      ...overlay(data.snapshot, intents),
    };
  }, [data, local]);
}

const POLL_MS = 20_000;

/** Fetch on open, when the app comes back to the front, and every 20 seconds while visible. */
export function usePolling(): void {
  const refresh = useStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
    let timer = setInterval(() => void refresh(), POLL_MS);
    const onVisibility = () => {
      clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    document.addEventListener('visibilitychange', onVisibility);
    const offActivated = onActivated(() => void refresh());
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      offActivated();
    };
  }, [refresh]);
}

/** "Now" in the tutor's zone, ticking once a minute so "мав відбутися" flips on time. */
export function useNow(tz: string): Date {
  const [now, setNow] = useState(() => nowIn(tz));
  useEffect(() => {
    setNow(nowIn(tz));
    const timer = setInterval(() => setNow(nowIn(tz)), 60_000);
    return () => clearInterval(timer);
  }, [tz]);
  return now;
}
