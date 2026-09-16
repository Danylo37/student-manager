import { useState } from 'react';
import {
  BottomButton,
  Banner,
  Card,
  Empty,
  Field,
  GroupLabel,
  Hint,
  inputClass,
} from '../components/ui';
import type { Data } from '../hooks';
import { lessonTitle } from '../lessonView';
import type { Screen } from '../store';
import useStore from '../store';
import {
  dayKey,
  findBusy,
  nextFullHour,
  snapshotWindow,
  timeKey,
  timeOf,
  toUtcIso,
  zoned,
} from '../time';

type Mode = Extract<Screen, { name: 'newLesson' | 'moveLesson' }>;

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** New lesson or a new time for an existing one; the date is entered in the tutor's zone. */
export default function LessonForm({ data, now, mode }: { data: Data; now: Date; mode: Mode }) {
  const pop = useStore((s) => s.pop);
  const send = useStore((s) => s.send);
  const showToast = useStore((s) => s.showToast);
  const { tz } = data;

  const moving =
    mode.name === 'moveLesson' ? data.lessons.find((l) => l.id === mode.lessonId) : null;
  const [isTrial, setIsTrial] = useState(false);
  const [studentId, setStudentId] = useState<number | ''>(
    mode.name === 'newLesson' && mode.studentId ? mode.studentId : '',
  );
  const [studentName, setStudentName] = useState('');
  const [date, setDate] = useState(() => {
    if (moving) return dayKey(zoned(moving.datetime, tz));
    return mode.name === 'newLesson' && mode.date ? mode.date : dayKey(nextFullHour(now));
  });
  const [time, setTime] = useState(() =>
    moving ? timeOf(moving.datetime, tz) : timeKey(nextFullHour(now)),
  );
  const [busy, setBusy] = useState(false);

  const trial = moving ? moving.isTrial : isTrial;
  const datetime = DATE.test(date) && TIME.test(time) ? toUtcIso(date, time, tz) : null;
  const taken = datetime
    ? findBusy(
        data.lessons.filter((l) => l.pending !== 'delete'),
        datetime,
        trial,
        moving?.id ?? null,
      )
    : null;
  // Moving a lesson onto its own time would be applied without changing anything,
  // so the phone would never learn it is done.
  const unchanged = !!moving && !!datetime && Date.parse(datetime) === Date.parse(moving.datetime);
  const { first, last } = snapshotWindow(data.snapshot.generatedAt, tz);
  const outside = DATE.test(date) && (date < dayKey(first) || date > dayKey(last));
  const students = data.students
    .filter((s) => s.id > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const valid = !!datetime && !taken && !unchanged && (moving || trial || studentId !== '');

  const submit = async () => {
    if (!datetime || !valid || busy) return;
    setBusy(true);
    const ok = moving
      ? await send('lesson.move', { lessonId: moving.id, datetime })
      : isTrial
        ? await send('lesson.add', {
            isTrial: true,
            datetime,
            ...(studentName.trim() ? { studentName: studentName.trim() } : {}),
          })
        : await send('lesson.add', { studentId: studentId as number, datetime });
    setBusy(false);
    if (ok) {
      pop();
      showToast('Надіслано на ПК');
    }
  };

  if (mode.name === 'moveLesson' && !moving) return <Empty>Урок не знайдено</Empty>;

  return (
    <>
      <GroupLabel>{moving ? `Перенести: ${lessonTitle(moving)}` : 'Новий урок'}</GroupLabel>
      <Card>
        {!moving && (
          <label className="flex items-center justify-between border-b border-tg-separator px-3.5 py-3">
            <span>Пробний урок</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-tg-button"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
            />
          </label>
        )}
        {!moving && !isTrial && (
          <Field label="Учень">
            <select
              className={inputClass}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Оберіть учня</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!moving && isTrial && (
          <Field label="Ім’я (необов’язково)">
            <input
              type="text"
              className={inputClass}
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Хто прийде"
            />
          </Field>
        )}
        <Field label="Дата">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Час">
          <input
            type="time"
            className={inputClass}
            step={300}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </Card>
      {taken ? (
        <Banner tone="error">
          О {timeOf(taken.datetime, tz)} вже стоїть {lessonTitle(taken)}. ПК відхилить цей час.
        </Banner>
      ) : unchanged ? (
        <Hint>Час не змінився.</Hint>
      ) : (
        <Hint>
          {trial ? 'Пробний урок триває 30 хвилин. ' : ''}
          {outside
            ? 'Цей день поза вікном синхронізації: ПК застосує урок, але на телефоні його не буде видно.'
            : 'Урок з’явиться в розкладі, коли ПК його застосує.'}
        </Hint>
      )}
      <BottomButton
        text={moving ? 'Перенести' : 'Поставити урок'}
        onClick={submit}
        disabled={!valid}
        loading={busy}
      />
    </>
  );
}
