import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import LessonRow from '../components/LessonRow';
import { Card, Chevron, Empty, GroupLabel, Hint, Row } from '../components/ui';
import type { Data } from '../hooks';
import useStore from '../store';
import { byDatetime, dayKey, zoned } from '../time';

export default function Today({ data, now }: { data: Data; now: Date }) {
  const push = useStore((s) => s.push);
  const setTab = useStore((s) => s.setTab);
  const today = dayKey(now);
  const lessons = data.lessons
    .filter((l) => dayKey(zoned(l.datetime, data.tz)) === today)
    .sort(byDatetime);
  const held = lessons.filter((l) => l.isCompleted).length;

  return (
    <>
      <GroupLabel>{format(now, 'd MMMM, EEEE', { locale: uk })}</GroupLabel>
      {lessons.length === 0 ? (
        <Empty>Сьогодні уроків немає</Empty>
      ) : (
        <>
          <Card>
            {lessons.map((l) => (
              <LessonRow key={l.id} lesson={l} tz={data.tz} now={now} />
            ))}
          </Card>
          <Hint>
            {held} з {lessons.length} проведено
          </Hint>
        </>
      )}
      <GroupLabel>Швидкі дії</GroupLabel>
      <Card>
        <Row
          lead="➕"
          title="Поставити урок"
          trail={<Chevron />}
          onClick={() => push({ name: 'newLesson', date: today })}
        />
        <Row
          lead="💳"
          title="Поповнити баланс"
          trail={<Chevron />}
          onClick={() => setTab('students')}
        />
      </Card>
    </>
  );
}
