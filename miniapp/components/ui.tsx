import type { ReactNode } from 'react';
import { LessonStatus } from '@shared/lessonStatus';

// The building blocks of every screen: Telegram-style grouped lists.

export const GroupLabel = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) => (
  <div
    className={`px-4 pb-1.5 pt-4 text-[11.5px] font-medium uppercase tracking-wider text-tg-hint ${onClick ? 'active:opacity-60' : ''}`}
    onClick={onClick}
  >
    {children}
  </div>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <div className="mx-3 overflow-hidden rounded-xl bg-tg-section">{children}</div>
);

interface RowProps {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  faded?: boolean;
}

/** One list line: lead | title + meta | trail. A button when it has onClick. */
export function Row({ lead, title, meta, trail, onClick, disabled, faded }: RowProps) {
  const className = `grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-tg-separator px-3.5 py-2.5 text-left last:border-b-0 ${
    onClick && !disabled ? 'active:bg-tg-bg-2' : ''
  } ${faded ? 'opacity-50' : ''}`;
  const body = (
    <>
      <span className="min-w-0 empty:hidden">{lead}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium leading-tight">{title}</span>
        {meta && (
          <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-tg-hint">
            {meta}
          </span>
        )}
      </span>
      <span className="empty:hidden">{trail}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

const DOT: Record<LessonStatus, string> = {
  [LessonStatus.PAID]: 'bg-green-500',
  [LessonStatus.PENDING]: 'bg-yellow-500',
  [LessonStatus.OVERDUE]: 'bg-red-500',
  [LessonStatus.TRIAL]: 'bg-blue-500',
};

export const Dot = ({ status }: { status: LessonStatus | 'gray' }) => (
  <span
    className={`block h-2.5 w-2.5 rounded-full ${status === 'gray' ? 'bg-gray-400' : DOT[status]}`}
  />
);

export const Pill = ({
  children,
  tone = 'hint',
}: {
  children: ReactNode;
  tone?: 'hint' | 'red';
}) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
      tone === 'red' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-tg-bg-2 text-tg-hint'
    }`}
  >
    {children}
  </span>
);

export const Chevron = () => <span className="text-lg text-tg-hint">›</span>;

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="px-6 py-8 text-center text-[13.5px] text-tg-hint">{children}</div>
);

export const Hint = ({ children }: { children: ReactNode }) => (
  <div className="px-4 pt-2 text-xs text-tg-hint">{children}</div>
);

interface FieldProps {
  label: string;
  children: ReactNode;
  /** For a control with its own buttons: a label would send a tap on the caption to the first of them. */
  group?: boolean;
}

export const Field = ({ label, children, group }: FieldProps) => {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block border-b border-tg-separator px-3.5 py-3 last:border-b-0">
      <span className="mb-1 block text-[11.5px] uppercase tracking-wider text-tg-hint">
        {label}
      </span>
      {children}
    </Tag>
  );
};

export const inputClass = 'w-full bg-transparent p-0 text-base tabular-nums outline-none';

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  unit: string;
  disabled?: boolean;
}

export function Stepper({ value, min, max, onChange, unit, disabled }: StepperProps) {
  const button = (delta: number, label: string) => (
    <button
      type="button"
      className="grid h-9 w-9 place-content-center rounded-full bg-tg-bg-2 text-xl leading-none text-tg-link disabled:opacity-40"
      disabled={disabled || value + delta < min || value + delta > max}
      onClick={() => onChange(value + delta)}
    >
      {label}
    </button>
  );
  return (
    <div className={`flex items-center gap-3.5 ${disabled ? 'opacity-50' : ''}`}>
      {button(-1, '−')}
      <span className="min-w-[2.2rem] text-center text-2xl font-semibold tabular-nums">
        {value}
      </span>
      {button(1, '+')}
      <span className="text-[13px] text-tg-hint">{unit}</span>
    </div>
  );
}

export const Banner = ({
  children,
  tone = 'warn',
  onClose,
}: {
  children: ReactNode;
  tone?: 'warn' | 'error';
  onClose?: () => void;
}) => (
  <div
    className={`mx-3 mt-2.5 flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] ${
      tone === 'error' ? 'bg-red-500/15' : 'bg-yellow-500/15'
    }`}
  >
    <span>{tone === 'error' ? '⚠️' : '⏱'}</span>
    <span className="flex-1">{children}</span>
    {onClose && (
      <button type="button" className="px-1 text-tg-hint" onClick={onClose} aria-label="Сховати">
        ✕
      </button>
    )}
  </div>
);

interface BottomButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/** The form's one action, fixed above the safe area; drawn by React, so it never lags the form. */
export const BottomButton = ({ text, onClick, disabled, loading }: BottomButtonProps) => (
  <div
    className="fixed inset-x-0 bottom-0 z-10 bg-tg-section px-3 pt-2"
    style={{
      paddingBottom:
        'calc(var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 10px)',
    }}
  >
    <button
      type="button"
      className="w-full rounded-xl bg-tg-button py-3.5 text-[15.5px] font-semibold text-tg-button-text active:opacity-80 disabled:opacity-50"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? 'Надсилаю…' : text}
    </button>
  </div>
);
