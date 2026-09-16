import type { Intent, Snapshot, SnapshotLesson, SnapshotStudent } from '@shared/types';

// What the screens draw: the snapshot with every pending intent laid over it,
// so a lesson booked from the phone is on the list right away, marked as
// waiting for the desktop. Nothing here is money logic; a balance moves by the
// lessons asked for, and the desktop's answer replaces all of it.

export type Pending = 'add' | 'move' | 'delete' | 'pay' | 'complete';

export interface ViewLesson extends SnapshotLesson {
  pending?: Pending;
}

export interface ViewStudent extends SnapshotStudent {
  pending?: Pending;
}

export interface View {
  students: ViewStudent[];
  lessons: ViewLesson[];
}

/** Ids below zero never collide with the desktop's autoincrement. */
const ghostId = (index: number) => -(index + 1);

export function overlay(snapshot: Snapshot, intents: Intent[]): View {
  const students: ViewStudent[] = snapshot.students.map((s) => ({ ...s }));
  const lessons: ViewLesson[] = snapshot.lessons.map((l) => ({ ...l }));
  const student = (id: number | null | undefined) => students.find((s) => s.id === id);
  const lesson = (id: number) => lessons.find((l) => l.id === id);

  intents
    .filter((i) => i.status === 'pending')
    .forEach((intent, index) => {
      switch (intent.type) {
        case 'balance.pay':
        case 'balance.adjust': {
          const s = student(intent.payload.studentId);
          if (s) {
            s.balance += intent.payload.lessons;
            s.pending = 'pay';
          }
          break;
        }
        case 'lesson.add': {
          const p = intent.payload;
          lessons.push({
            id: ghostId(index),
            studentId: p.studentId ?? null,
            studentName: p.isTrial ? (p.studentName ?? null) : (student(p.studentId)?.name ?? null),
            datetime: p.datetime,
            isCompleted: false,
            isPaid: false,
            isTrial: !!p.isTrial,
            pending: 'add',
          });
          break;
        }
        case 'lesson.move': {
          const l = lesson(intent.payload.lessonId);
          if (l) {
            l.datetime = intent.payload.datetime;
            l.pending = 'move';
          }
          break;
        }
        case 'lesson.complete': {
          const l = lesson(intent.payload.lessonId);
          if (l) {
            l.isCompleted = intent.payload.isCompleted;
            l.pending = 'complete';
          }
          break;
        }
        case 'lesson.delete': {
          const l = lesson(intent.payload.lessonId);
          if (l) l.pending = 'delete';
          break;
        }
        case 'lesson.togglePayment': {
          const l = lesson(intent.payload.lessonId);
          if (l) {
            l.isPaid = true;
            l.pending = 'pay';
          }
          break;
        }
        case 'student.add': {
          const p = intent.payload;
          students.push({
            id: ghostId(index),
            name: p.name,
            balance: p.balance ?? 0,
            priceKopiyky: p.priceKopiyky ?? null,
            pending: 'add',
          });
          break;
        }
      }
    });

  return { students, lessons };
}
