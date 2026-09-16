import { addDays, format, isBefore } from 'date-fns';
import { uk } from 'date-fns/locale';
import { useState } from 'react';
import LessonRow from '../components/LessonRow';
import { Card, Empty, GroupLabel } from '../components/ui';
import type { Data } from '../hooks';
import useStore from '../store';
import { haptic } from '../telegram';
import {
  byDatetime,
  dayKey,
  relativeDayName,
  snapshotWindow,
  weekDays,
  weekStart,
  zoned,
} from '../time';

// A list by day, not a grid: a grid is unreadable on a phone. Calendar weeks
// like the desktop, limited to the days the snapshot covers.

export default function Week({ data, now }: { data: Data; now: Date }) {
  const push = useStore((s) => s.push);
  const [offset, setOffset] = useState(0);
  const { tz } = data;

  const { first, last } = snapshotWindow(data.snapshot.generatedAt, tz);
  const start = addDays(weekStart(now), offset * 7);
  const days = weekDays(start);
  const canGoBack = isBefore(first, start);
  const canGoForward = isBefore(addDays(start, 6), last);
  const inWindow = (day: Date) => !isBefore(day, first) && !isBefore(last, day);

  const shift = (delta: number) => {
    haptic.tap();
    setOffset(offset + delta);
  };

  return (
    <>
      <div className="mx-3 mt-2.5 grid grid-cols-[2.5rem_1fr_2.5rem] items-center rounded-xl bg-tg-section">
        <button
          type="button"
          className="py-2 text-xl text-tg-link disabled:opacity-30"
          disabled={!canGoBack}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <span className="text-center text-sm font-medium">
          {format(start, 'd MMM', { locale: uk })} –{' '}
          {format(addDays(start, 6), 'd MMM', { locale: uk })}
        </span>
        <button
          type="button"
          className="py-2 text-xl text-tg-link disabled:opacity-30"
          disabled={!canGoForward}
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>
      {days.map((day) => {
        const key = dayKey(day);
        const lessons = data.lessons
          .filter((l) => dayKey(zoned(l.datetime, tz)) === key)
          .sort(byDatetime);
        const label = `${relativeDayName(day, now)} · ${format(day, 'd MMMM', { locale: uk })}`;
        const covered = inWindow(day);
        return (
          <div key={key}>
            {covered ? (
              <GroupLabel onClick={() => push({ name: 'newLesson', date: key })}>
                {label} ＋
              </GroupLabel>
            ) : (
              <GroupLabel>{label}</GroupLabel>
            )}
            {!covered ? (
              <Empty>Поза вікном синхронізації</Empty>
            ) : lessons.length === 0 ? (
              <Card>
                <div className="px-3.5 py-2.5 text-[13.5px] text-tg-hint">Уроків немає</div>
              </Card>
            ) : (
              <Card>
                {lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} tz={tz} now={now} />
                ))}
              </Card>
            )}
          </div>
        );
      })}
    </>
  );
}
