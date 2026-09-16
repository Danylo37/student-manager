import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { formatUAH } from '@shared/financials';
import { lessonsWordUA } from '@shared/plural';
import LessonRow from '../components/LessonRow';
import { Card, Chevron, Dot, Empty, GroupLabel, Pill, Row } from '../components/ui';
import type { Data } from '../hooks';
import { balanceStatus } from '../lessonView';
import useStore from '../store';
import { byDatetime, zoned } from '../time';

export default function Student({
  data,
  now,
  studentId,
}: {
  data: Data;
  now: Date;
  studentId: number;
}) {
  const push = useStore((s) => s.push);
  const student = data.students.find((s) => s.id === studentId);
  if (!student) return <Empty>Учня не знайдено</Empty>;

  const n = Math.abs(student.balance);
  const balance =
    student.balance < 0 ? `Борг ${n} ${lessonsWordUA(n)}` : `${n} ${lessonsWordUA(n)} наперед`;
  const lessons = data.lessons.filter((l) => l.studentId === student.id).sort(byDatetime);
  const hasPrice = student.priceKopiyky != null;

  return (
    <>
      <GroupLabel>Баланс</GroupLabel>
      <Card>
        <Row
          lead={<Dot status={balanceStatus(student)} />}
          title={balance}
          meta={hasPrice ? `Ціна ${formatUAH(student.priceKopiyky!)} за урок` : 'Ціну не вказано'}
          trail={student.pending && <Pill>очікує ПК</Pill>}
        />
      </Card>
      <GroupLabel>Дії</GroupLabel>
      <Card>
        <Row
          lead="💳"
          title="Поповнити або зняти уроки"
          trail={<Chevron />}
          onClick={() => push({ name: 'topUp', studentId: student.id })}
        />
        <Row
          lead="📅"
          title="Поставити урок"
          trail={<Chevron />}
          onClick={() => push({ name: 'newLesson', studentId: student.id })}
        />
      </Card>
      <GroupLabel>Уроки</GroupLabel>
      {lessons.length === 0 ? (
        <Empty>Уроків у найближчі тижні немає</Empty>
      ) : (
        <Card>
          {lessons.map((l) => (
            <LessonRow
              key={l.id}
              lesson={l}
              tz={data.tz}
              now={now}
              title={format(zoned(l.datetime, data.tz), 'EEEEEE, d MMMM', { locale: uk })}
            />
          ))}
        </Card>
      )}
    </>
  );
}
