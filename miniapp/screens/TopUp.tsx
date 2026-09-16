import { useState } from 'react';
import { formatUAH } from '@shared/financials';
import { lessonsWordUA } from '@shared/plural';
import {
  BottomButton,
  Card,
  Dot,
  Empty,
  Field,
  GroupLabel,
  Hint,
  Row,
  Stepper,
} from '../components/ui';
import type { Data } from '../hooks';
import { balanceStatus, balanceText } from '../lessonView';
import useStore from '../store';

// Lessons only, as on the desktop: a positive count is a payment at the price
// or package the desktop applies, a negative one takes prepaid lessons back
// and records the refund. Money is never entered here.

export default function TopUp({ data, studentId }: { data: Data; studentId: number }) {
  const pop = useStore((s) => s.pop);
  const send = useStore((s) => s.send);
  const showToast = useStore((s) => s.showToast);
  const [lessons, setLessons] = useState(1);
  const [busy, setBusy] = useState(false);
  const student = data.students.find((s) => s.id === studentId);

  if (!student) return <Empty>Учня не знайдено</Empty>;

  const n = Math.abs(lessons);
  const words = `${n} ${lessonsWordUA(n)}`;
  const hasPrice = student.priceKopiyky != null;
  const valid = lessons < 0 || (lessons > 0 && hasPrice);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok =
      lessons > 0
        ? await send('balance.pay', { studentId, lessons })
        : await send('balance.adjust', { studentId, lessons });
    setBusy(false);
    if (ok) {
      pop();
      showToast('Надіслано на ПК');
    }
  };

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
        <Field label="Плюс поповнює, мінус знімає" group>
          <Stepper
            value={lessons}
            min={-99}
            max={99}
            onChange={setLessons}
            unit={lessonsWordUA(n)}
          />
        </Field>
      </Card>
      <Hint>
        {lessons > 0 && hasPrice && (
          <>
            За ціною {formatUAH(student.priceKopiyky!)} за урок це{' '}
            {formatUAH(student.priceKopiyky! * lessons)}. Якщо для учня є пакет зі знижкою, ПК
            порахує суму за ним.
          </>
        )}
        {lessons > 0 &&
          !hasPrice &&
          'Без ціни поповнити не можна: спочатку вкажіть ціну уроку на ПК.'}
        {lessons < 0 &&
          'ПК зніме оплачені наперед уроки і запише повернення грошей. Знімається не більше, ніж було оплачено.'}
        {lessons === 0 && 'Оберіть кількість.'}
      </Hint>
      <BottomButton
        text={lessons < 0 ? `Зняти ${words}` : `Поповнити на ${words}`}
        onClick={submit}
        disabled={!valid}
        loading={busy}
      />
    </>
  );
}
