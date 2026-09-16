import { useState } from 'react';
import { formatUAH } from '@shared/financials';
import { pluralUA } from '@shared/plural';
import { Card, Chevron, Dot, Empty, GroupLabel, Pill, Row } from '../components/ui';
import type { Data } from '../hooks';
import { balanceStatus, balanceText } from '../lessonView';
import useStore from '../store';

export default function Students({ data }: { data: Data }) {
  const push = useStore((s) => s.push);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const students = data.students
    .filter((s) => !q || s.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  return (
    <>
      <div className="px-3 pt-2.5">
        <input
          type="search"
          className="w-full rounded-xl bg-tg-section px-3 py-2 text-[14.5px] outline-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-link"
          placeholder="Пошук учня"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <GroupLabel>
        {students.length} {pluralUA(students.length, 'учень', 'учні', 'учнів')}
      </GroupLabel>
      <Card>
        <Row
          lead="➕"
          title="Новий учень"
          trail={<Chevron />}
          onClick={() => push({ name: 'newStudent' })}
        />
      </Card>
      {students.length === 0 ? (
        <Empty>Нікого не знайдено</Empty>
      ) : (
        <div className="mt-2.5">
          <Card>
            {students.map((s) => (
              <Row
                key={s.id}
                lead={<Dot status={balanceStatus(s)} />}
                title={s.name}
                meta={
                  s.priceKopiyky != null ? `${formatUAH(s.priceKopiyky)}/урок` : 'Ціну не вказано'
                }
                trail={
                  <span className="flex flex-col items-end gap-0.5">
                    <span className={`font-semibold tabular-nums ${balanceClass(s.balance)}`}>
                      {balanceText(s.balance)}
                    </span>
                    {s.pending && <Pill>очікує ПК</Pill>}
                  </span>
                }
                onClick={
                  s.pending === 'add' ? undefined : () => push({ name: 'student', studentId: s.id })
                }
              />
            ))}
          </Card>
        </div>
      )}
    </>
  );
}

export const balanceClass = (balance: number) =>
  balance < 0 ? 'text-red-600 dark:text-red-400' : balance === 0 ? 'text-tg-hint' : '';
