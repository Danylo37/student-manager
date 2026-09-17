// The cloud contract between the desktop and the Mini App. The desktop builds
// the snapshot in main/sync/snapshot.js and applies intents in
// main/sync/intents.js; the shapes here mirror those two files.

// # SNAPSHOT

export interface SnapshotStudent {
  id: number;
  name: string;
  /** Lessons: positive means prepaid, negative means debt. */
  balance: number;
  priceKopiyky: number | null;
}

export interface SnapshotLesson {
  id: number;
  studentId: number | null;
  studentName: string | null;
  /** UTC ISO; shown in the snapshot's timezone, never the phone's. */
  datetime: string;
  isCompleted: boolean;
  isPaid: boolean;
  isTrial: boolean;
}

export interface Snapshot {
  revision: number;
  generatedAt: string;
  /** IANA zone of the desktop, e.g. "Europe/Kyiv". */
  timezone: string;
  students: SnapshotStudent[];
  lessons: SnapshotLesson[];
}

// # INTENTS (registry v1)

/** The lesson as the phone saw it, so the desktop can still name it once it is gone. */
export interface LessonHint {
  studentName: string | null;
  datetime: string;
  isTrial: boolean;
}

export interface IntentPayloads {
  'balance.pay': { studentId: number; lessons: number; totalPriceKopiyky?: number };
  'balance.adjust': { studentId: number; lessons: number };
  'lesson.add': {
    studentId?: number;
    datetime: string;
    isTrial?: boolean;
    studentName?: string;
  };
  'lesson.move': { lessonId: number; datetime: string; was?: LessonHint };
  'lesson.complete': { lessonId: number; isCompleted: boolean; was?: LessonHint };
  'lesson.delete': { lessonId: number; was?: LessonHint };
  'lesson.togglePayment': { lessonId: number; was?: LessonHint };
  'student.add': { name: string; balance?: number; priceKopiyky?: number };
}

export type IntentType = keyof IntentPayloads;

export type IntentStatus = 'pending' | 'applied' | 'failed';

/** An intent as the cloud stores and returns it. */
export interface IntentOf<T extends IntentType> {
  id: string;
  type: T;
  payload: IntentPayloads[T];
  createdAt: string;
  source: string;
  status: IntentStatus;
  reason: string | null;
}

/** Discriminated by `type`, so a switch narrows the payload. */
export type Intent = { [T in IntentType]: IntentOf<T> }[IntentType];

/** GET /app/snapshot */
export interface AppSnapshotResponse {
  snapshot: Snapshot | null;
  /** Pending intents plus the ones the desktop refused in the last 48 hours. */
  intents: Intent[];
  /** When the desktop last pulled intents; null until it ever did. */
  deviceSeenAt: string | null;
}
