import { formatUAH } from '@shared/financials';
import { lessonsWordUA } from '@shared/plural';
import type { Intent, Snapshot } from '@shared/types';
import { dateOf, timeOf } from './time';

// One line per intent for the failure banner: what was asked, in the tutor's words.

export function describeIntent(intent: Intent, snapshot: Snapshot): string {
  const tz = snapshot.timezone;
  const studentName = (id: number | null | undefined) =>
    snapshot.students.find((s) => s.id === id)?.name ?? 'учень';
  const lessonName = (id: number) => {
    const l = snapshot.lessons.find((x) => x.id === id);
    if (!l) return 'урок';
    const who = l.isTrial ? (l.studentName ?? 'пробний') : studentName(l.studentId);
    return `${who}, ${dateOf(l.datetime, tz)} ${timeOf(l.datetime, tz)}`;
  };
  const when = (iso: string) => `${dateOf(iso, tz)} ${timeOf(iso, tz)}`;

  switch (intent.type) {
    case 'balance.pay': {
      const { studentId, lessons } = intent.payload;
      return `Поповнення: ${studentName(studentId)}, ${lessons} ${lessonsWordUA(lessons)}`;
    }
    case 'balance.adjust': {
      const { studentId, lessons } = intent.payload;
      const n = Math.abs(lessons);
      return `${lessons < 0 ? 'Зняття уроків' : 'Поповнення'}: ${studentName(studentId)}, ${n} ${lessonsWordUA(n)}`;
    }
    case 'lesson.add': {
      const p = intent.payload;
      const who = p.isTrial
        ? `пробний${p.studentName ? `, ${p.studentName}` : ''}`
        : studentName(p.studentId);
      return `Новий урок: ${who}, ${when(p.datetime)}`;
    }
    case 'lesson.move':
      return `Перенесення: ${lessonName(intent.payload.lessonId)} → ${when(intent.payload.datetime)}`;
    case 'lesson.complete':
      return `Урок проведено: ${lessonName(intent.payload.lessonId)}`;
    case 'lesson.delete':
      return `Видалення уроку: ${lessonName(intent.payload.lessonId)}`;
    case 'lesson.togglePayment':
      return `Оплата уроку: ${lessonName(intent.payload.lessonId)}`;
    case 'student.add': {
      const p = intent.payload;
      const price = p.priceKopiyky != null ? `, ${formatUAH(p.priceKopiyky)}` : '';
      return `Новий учень: ${p.name}${price}`;
    }
    default:
      return (intent as Intent).type;
  }
}
