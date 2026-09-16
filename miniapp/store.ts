import { create } from 'zustand';
import type { AppSnapshotResponse, Intent, IntentPayloads, IntentType } from '@shared/types';
import { ApiError, fetchSnapshot, isNetworkError, postIntent } from './api';
import { haptic } from './telegram';

// The phone has no database: the store keeps the last answer of /app/snapshot,
// the intents sent from here that the cloud has not listed back yet, and where
// the user is on screen.

export type Tab = 'today' | 'week' | 'students';

export type Screen =
  | { name: 'student'; studentId: number }
  | { name: 'topUp'; studentId: number }
  | { name: 'newLesson'; studentId?: number; date?: string }
  | { name: 'moveLesson'; lessonId: number }
  | { name: 'newStudent' };

/** Sent from here, with the snapshot revision the phone had at the time. */
type LocalIntent = Intent & { sentAtRevision: number };

/** Why the last fetch failed; the status tells a refused initData from a lost connection. */
export interface Failure {
  status: number | null;
  message: string;
}

interface State {
  data: AppSnapshotResponse | null;
  fetchedAt: number | null;
  error: Failure | null;
  loading: boolean;
  local: LocalIntent[];
  dismissed: string[];
  tab: Tab;
  stack: Screen[];
  sheetLessonId: number | null;
  toast: string | null;

  refresh: () => Promise<void>;
  send: <T extends IntentType>(type: T, payload: IntentPayloads[T]) => Promise<boolean>;
  dismiss: (id: string) => void;
  setTab: (tab: Tab) => void;
  push: (screen: Screen) => void;
  pop: () => void;
  openSheet: (lessonId: number | null) => void;
  showToast: (text: string) => void;
}

const CACHE_KEY = 'sm.snapshot';
const DISMISSED_KEY = 'sm.dismissed';

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable; the app works from memory.
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const useStore = create<State>((set, get) => ({
  data: readCache<AppSnapshotResponse>(CACHE_KEY),
  fetchedAt: null,
  error: null,
  loading: false,
  local: [],
  dismissed: readCache<string[]>(DISMISSED_KEY) ?? [],
  tab: 'today',
  stack: [],
  sheetLessonId: null,
  toast: null,

  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const data = await fetchSnapshot();
      const revision = data.snapshot?.revision ?? 0;
      const listed = new Set(data.intents.map((i) => i.id));
      // The cloud's list is the truth once it names the intent; a grown revision
      // means the desktop pushed after applying, so the snapshot already has it.
      const local = get().local.filter((i) => !listed.has(i.id) && i.sentAtRevision >= revision);
      // Failed intents the user hid stay hidden until the cloud stops listing them.
      const dismissed = get().dismissed.filter((id) => listed.has(id));
      writeCache(CACHE_KEY, data);
      writeCache(DISMISSED_KEY, dismissed);
      set({ data, local, dismissed, fetchedAt: Date.now(), error: null, loading: false });
    } catch (error) {
      set({
        error: {
          status: error instanceof ApiError ? error.status : null,
          message: error instanceof Error ? error.message : String(error),
        },
        loading: false,
      });
    }
  },

  send: async (type, payload) => {
    const id = crypto.randomUUID();
    const sentAtRevision = get().data?.snapshot?.revision ?? 0;
    const optimistic = {
      id,
      type,
      payload,
      createdAt: new Date().toISOString(),
      source: 'miniapp',
      status: 'pending',
      reason: null,
      sentAtRevision,
    } as LocalIntent;
    set((s) => ({ local: [...s.local, optimistic] }));
    try {
      const stored = {
        ...(await postIntent({ id, type, payload })),
        sentAtRevision,
      } as LocalIntent;
      // A refresh that landed meanwhile may have dropped the optimistic entry: put the real one back.
      set((s) => ({
        local: s.local.some((i) => i.id === id)
          ? s.local.map((i) => (i.id === id ? stored : i))
          : [...s.local, stored],
      }));
      haptic.success();
      return true;
    } catch (error) {
      set((s) => ({ local: s.local.filter((i) => i.id !== id) }));
      haptic.error();
      const reason = isNetworkError(error)
        ? 'немає зв’язку з хмарою'
        : error instanceof Error
          ? error.message
          : String(error);
      get().showToast(`Не вдалося надіслати: ${reason}`);
      return false;
    }
  },

  dismiss: (id) => {
    const dismissed = [...get().dismissed, id];
    writeCache(DISMISSED_KEY, dismissed);
    set({ dismissed });
  },

  setTab: (tab) => set({ tab, stack: [], sheetLessonId: null }),
  push: (screen) => set((s) => ({ stack: [...s.stack, screen], sheetLessonId: null })),
  pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  openSheet: (lessonId) => set({ sheetLessonId: lessonId }),

  showToast: (text) => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2500);
    set({ toast: text });
  },
}));

export default useStore;
