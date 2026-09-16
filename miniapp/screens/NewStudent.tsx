import { useState } from 'react';
import { parseInputToKopiyky } from '@shared/financials';
import { lessonsWordUA } from '@shared/plural';
import { BottomButton, Card, Field, GroupLabel, Hint, inputClass, Stepper } from '../components/ui';
import useStore from '../store';

// Name, price and lessons already paid for. The tax flag and a package stay on
// the desktop; the starting balance is a payment the desktop records at its price.

export default function NewStudent() {
  const pop = useStore((s) => s.pop);
  const send = useStore((s) => s.send);
  const showToast = useStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);

  const priceKopiyky = price.trim() ? parseInputToKopiyky(price) : null;
  const priceInvalid = !!price.trim() && priceKopiyky === null;
  const hasPrice = priceKopiyky !== null;
  const valid = !!name.trim() && !priceInvalid;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await send('student.add', {
      name: name.trim(),
      ...(priceKopiyky !== null ? { priceKopiyky } : {}),
      ...(hasPrice && balance > 0 ? { balance } : {}),
    });
    setBusy(false);
    if (ok) {
      pop();
      showToast('Надіслано на ПК');
    }
  };

  return (
    <>
      <GroupLabel>Новий учень</GroupLabel>
      <Card>
        <Field label="Ім’я">
          <input
            type="text"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім’я та прізвище"
            autoFocus
          />
        </Field>
        <Field label="Ціна уроку, ₴">
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0 або порожньо"
          />
        </Field>
        <Field label="Оплачено уроків наперед" group>
          <Stepper
            value={hasPrice ? balance : 0}
            min={0}
            max={99}
            onChange={setBalance}
            unit={lessonsWordUA(hasPrice ? balance : 0)}
            disabled={!hasPrice}
          />
        </Field>
      </Card>
      <Hint>
        {priceInvalid
          ? 'Ціна має бути числом, наприклад 450 або 450,50.'
          : !hasPrice
            ? 'Без ціни баланс ввести не можна: оплата без ціни не потрапляє в касу.'
            : balance > 0
              ? `Запишеться як оплата сьогодні: ${balance} ${lessonsWordUA(balance)}. Суму порахує ПК за ціною або пакетом.`
              : 'Ціну 0 можна вказати, щоб перенести стару передоплату без грошей.'}
      </Hint>
      <BottomButton text="Додати учня" onClick={submit} disabled={!valid} loading={busy} />
    </>
  );
}
