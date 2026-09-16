import { useCallback, useState } from 'react';
import { formatUAH } from '@shared/financials';
import { lessonsWordUA } from '@shared/plural';
import { Card, Dot, Empty, Field, GroupLabel, Hint, Row, Stepper } from '../components/ui';
import type { Data } from '../hooks';
import { balanceStatus, balanceText } from '../lessonView';
import useStore from '../store';
import { useMainButton } from '../telegram';

// Only the number of lessons goes up, as on the desktop: the price and any
// package discount are the desktop's to apply.

export default function TopUp({ data, studentId }: { data: Data; studentId: number }) {
  const pop = useStore((s) => s.pop);
  const send = useStore((s) => s.send);
  const showToast = useStore((s) => s.showToast);
  const [lessons, setLessons] = useState(4);
  const [busy, setBusy] = useState(false);
  const student = data.students.find((s) => s.id === studentId);

  const submit = useCallback(async () => {
    if (!student) return;
    setBusy(true);
    const ok = await send('balance.pay', { studentId, lessons });
    setBusy(false);
    if (ok) {
      pop();
      showToast('Надіслано на ПК');
    }
  }, [send, pop, showToast, student, studentId, lessons]);

  useMainButton({
    text: `Поповнити на ${lessons} ${lessonsWordUA(lessons)}`,
    onClick: submit,
    loading: busy,
    disabled: !student,
  });

  if (!student) return <Empty>Учня не знайдено</Empty>;

  return (
    <>
      <GroupLabel>Учень</GroupLabel>
      <Card>
        <Row
          lead={<Dot status={balanceStatus(student)} />}
          title={student.name}
          meta={`Зараз ${balanceText(student.balance)}`}
        />
      </Card>
      <GroupLabel>Скільки уроків</GroupLabel>
      <Card>
        <Field label="Кількість">
          <Stepper
            value={lessons}
            min={1}
            max={99}
            onChange={setLessons}
            unit={lessonsWordUA(lessons)}
          />
        </Field>
      </Card>
      <Hint>
        {student.priceKopiyky != null
          ? `За ціною ${formatUAH(student.priceKopiyky)} за урок це ${formatUAH(student.priceKopiyky * lessons)}. `
          : ''}
        Якщо для учня є пакет зі знижкою, ПК порахує суму за ним.
      </Hint>
    </>
  );
}
