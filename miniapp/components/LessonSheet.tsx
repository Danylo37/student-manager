import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import type { Data } from '../hooks';
import { lessonState, lessonTitle } from '../lessonView';
import useStore from '../store';
import { confirm, haptic } from '../telegram';
import { timeOf, zoned } from '../time';

// Actions on one lesson. "Провів" is not here on purpose: the desktop marks a
// lesson held by itself once its time has passed.

export default function LessonSheet({ data, now }: { data: Data; now: Date }) {
  const lessonId = useStore((s) => s.sheetLessonId);
  const openSheet = useStore((s) => s.openSheet);
  const push = useStore((s) => s.push);
  const send = useStore((s) => s.send);
  const showToast = useStore((s) => s.showToast);

  const lesson = data.lessons.find((l) => l.id === lessonId);
  if (!lesson) return null;

  const close = () => openSheet(null);
  const sent = (ok: boolean) => {
    close();
    if (ok) showToast('Надіслано на ПК');
  };
  const { label } = lessonState(lesson, now);
  const subtitle = `${format(zoned(lesson.datetime, data.tz), 'EEEE, d MMMM', { locale: uk })} о ${timeOf(lesson.datetime, data.tz)} · ${label}`;

  const action = (text: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      className={`w-full border-b border-tg-separator bg-tg-section py-3.5 text-center text-base last:border-b-0 active:bg-tg-bg-2 ${
        danger ? 'text-tg-destructive' : 'text-tg-link'
      }`}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={close}>
      <div
        className="w-full rounded-t-2xl bg-tg-bg-2 p-2"
        style={{ paddingBottom: 'calc(var(--tg-safe-area-inset-bottom, 0px) + 10px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pb-3 pt-2.5 text-center">
          <div className="font-semibold">{lessonTitle(lesson)}</div>
          <div className="mt-0.5 text-[12.5px] text-tg-hint">{subtitle}</div>
        </div>
        <div className="overflow-hidden rounded-xl">
          {lesson.isCompleted &&
            !lesson.isPaid &&
            !lesson.isTrial &&
            action(
              'Позначити оплаченим',
              () => void send('lesson.togglePayment', { lessonId: lesson.id }).then(sent),
            )}
          {!lesson.isCompleted &&
            action('Перенести', () => {
              close();
              push({ name: 'moveLesson', lessonId: lesson.id });
            })}
          {action(
            'Видалити урок',
            () =>
              void confirm(`Видалити урок: ${lessonTitle(lesson)}?`).then((yes) => {
                if (yes) void send('lesson.delete', { lessonId: lesson.id }).then(sent);
              }),
            true,
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full rounded-xl bg-tg-section py-3.5 text-center text-base font-semibold text-tg-link active:bg-tg-bg-2"
          onClick={close}
        >
          Закрити
        </button>
      </div>
    </div>
  );
}
