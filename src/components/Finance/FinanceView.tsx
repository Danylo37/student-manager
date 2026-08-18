import { useState, useEffect, useCallback } from 'react';
import { Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import useAppStore from '@/store/appStore';
import {
  calculateNetEarnings,
  getFixedTaxMonths,
  formatUAH,
  formatChange,
  getDateRangeForPeriod,
  getDayRange,
  toInputDate,
  fromInputDate,
  parseInputToKopiyky,
  WEEKS_PER_MONTH,
  type EarningsPeriod,
  type DateRange,
} from '@/utils/financials';
import type {
  EarningsStats,
  EarningsByDay,
  EarningsByStudent,
  BalanceHistoryEntry,
  CashStats,
} from '@/types';

/** Ukrainian plural: pluralUA(2, 'урок', 'уроки', 'уроків') → 'уроки'. */
function pluralUA(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const monthsWordUA = (n: number) => pluralUA(n, 'місяць', 'місяці', 'місяців');
const lessonsWordUA = (n: number) => pluralUA(n, 'урок', 'уроки', 'уроків');

// # Bar chart
function MiniBarChart({ data }: { data: EarningsByDay[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => (
          <div
            key={d.day}
            className="flex-1 min-w-0 bg-blue-400 hover:bg-blue-500 rounded-t transition-colors cursor-default"
            style={{ height: `${Math.max((d.total / max) * 100, 2)}%` }}
            title={`${d.day}: ${formatUAH(d.total)} (${d.count} уроків)`}
          />
        ))}
      </div>
      {data.length <= 20 && (
        <div className="flex gap-1 mt-1">
          {data.map((d) => (
            <div key={d.day} className="flex-1 min-w-0 text-center overflow-hidden">
              <span className="text-gray-400" style={{ fontSize: '9px' }}>
                {d.day.slice(5)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// # Stat card
function StatCard({
  label,
  value,
  sub,
  accent = false,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  change?: { text: string; positive: boolean; neutral: boolean };
}) {
  return (
    <div
      className={`rounded-xl p-5 border ${accent ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
    >
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      {change && !change.neutral && (
        <div
          className={`text-xs font-semibold mt-1 ${change.positive ? 'text-green-600' : 'text-red-500'}`}
        >
          {change.text} vs попередній
        </div>
      )}
    </div>
  );
}

// # Balance history
function BalanceHistory({ entries }: { entries: BalanceHistoryEntry[] }) {
  const totalLessons = entries.reduce((sum, e) => sum + e.lessons, 0);
  const totalAmount = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-600">Історія оплат</h2>
        {entries.length > 0 && (
          <span className="text-xs text-gray-400">
            {totalLessons} {lessonsWordUA(Math.abs(totalLessons))} на {formatUAH(totalAmount)}
          </span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
        {entries.map((e) => {
          const isPayment = e.lessons > 0;
          return (
            <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="w-28 text-xs text-gray-400 flex-shrink-0">
                {new Date(e.created_at).toLocaleString('uk-UA', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="flex-1 min-w-0 font-medium text-gray-800 truncate">
                {e.student_name}
              </div>
              <div className={`w-28 text-right ${isPayment ? 'text-gray-600' : 'text-red-500'}`}>
                {isPayment ? '+' : '−'}
                {Math.abs(e.lessons)} {lessonsWordUA(Math.abs(e.lessons))}
              </div>
              <div className="w-28 text-right font-semibold text-gray-700">
                {e.amount != null ? (
                  formatUAH(e.amount)
                ) : (
                  <span className="text-xs font-normal text-gray-400">без ціни</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// # Day navigator
function DayNavigator({
  selectedDate,
  onChange,
}: {
  selectedDate: Date;
  onChange: (d: Date) => void;
}) {
  const shift = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    onChange(d);
  };
  const isToday = toInputDate(selectedDate) === toInputDate(new Date());
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
      <button onClick={() => shift(-1)} className="p-1 hover:bg-gray-100 rounded-lg">
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <input
        type="date"
        value={toInputDate(selectedDate)}
        max={toInputDate(new Date())}
        onChange={(e) => e.target.value && onChange(fromInputDate(e.target.value))}
        className="text-sm font-medium text-gray-700 border-none outline-none bg-transparent cursor-pointer"
      />
      <button
        onClick={() => shift(1)}
        disabled={isToday}
        className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-30"
      >
        <ChevronRight size={18} className="text-gray-600" />
      </button>
      {!isToday && (
        <button
          onClick={() => onChange(new Date())}
          className="ml-1 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md"
        >
          Сьогодні
        </button>
      )}
    </div>
  );
}

// # Period navigator (week / month / quarter / year)
function PeriodNavigator({
  offset,
  onOffset,
  label,
}: {
  offset: number;
  onOffset: (o: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
      <button onClick={() => onOffset(offset - 1)} className="p-1 hover:bg-gray-100 rounded-lg">
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-32 text-center">{label}</span>
      <button
        onClick={() => onOffset(offset + 1)}
        disabled={offset >= 0}
        className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-30"
      >
        <ChevronRight size={18} className="text-gray-600" />
      </button>
      {offset < 0 && (
        <button
          onClick={() => onOffset(0)}
          className="ml-1 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md"
        >
          Поточний
        </button>
      )}
    </div>
  );
}

// # Income simulator
function IncomeSimulator() {
  const students = useAppStore((s) => s.students);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const [weeklyLessons, setWeeklyLessons] = useState<Record<number, number>>({});
  const [simulatedPrices, setSimulatedPrices] = useState<Record<number, string>>({});
  const [open, setOpen] = useState(false);

  /**
   * The projection is based on the weekly schedule — the lessons actually
   * booked for each student — not on how many lessons happened in the past.
   */
  const loadWeekly = useCallback(async () => {
    try {
      const data = await window.electron.getWeeklyScheduleCounts();
      const map: Record<number, number> = {};
      data.forEach((s) => {
        map[s.student_id] = s.per_week;
      });
      setWeeklyLessons(map);
      // Keep prices the user has already typed; fill in the rest from current ones.
      setSimulatedPrices((prev) => {
        const next = { ...prev };
        students.forEach((s) => {
          if (next[s.id] === undefined) {
            next[s.id] = s.current_price ? (s.current_price / 100).toFixed(2) : '';
          }
        });
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }, [students]);

  const handleToggle = () => {
    if (!open) void loadWeekly();
    setOpen((v) => !v);
  };

  /** Lessons per month implied by the weekly schedule. */
  const monthlyLessons = (studentId: number) => (weeklyLessons[studentId] ?? 0) * WEEKS_PER_MONTH;

  // Monthly lesson counts are fractional, so round the money back to whole kopiyky.
  const currentMonthly = Math.round(
    students.reduce((sum, s) => sum + (s.current_price ?? 0) * monthlyLessons(s.id), 0),
  );
  const simulatedMonthly = Math.round(
    students.reduce((sum, s) => {
      const simK = parseInputToKopiyky(simulatedPrices[s.id] ?? '') ?? s.current_price ?? 0;
      return sum + simK * monthlyLessons(s.id);
    }, 0),
  );
  const diff = simulatedMonthly - currentMonthly;
  const { net: currentNet } = calculateNetEarnings(currentMonthly, taxSettings, 'month');
  const { net: simulatedNet } = calculateNetEarnings(simulatedMonthly, taxSettings, 'month');
  const netDiff = simulatedNet - currentNet;
  const studentsWithData = students.filter((s) => s.current_price || weeklyLessons[s.id]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div>
          <span className="font-semibold text-gray-800">🧮 Калькулятор доходу</span>
          <span className="text-sm text-gray-500 ml-2">Що буде, якщо змінити ціни?</span>
        </div>
        {open ? (
          <ChevronUp size={18} className="text-gray-400" />
        ) : (
          <ChevronDown size={18} className="text-gray-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          <p className="text-xs text-gray-400">
            Розрахунок за активним розкладом на тиждень (1 тиждень ≈ {WEEKS_PER_MONTH.toFixed(2)}{' '}
            разів на місяць).
          </p>
          {studentsWithData.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              Немає даних. Додайте учням розклад і ціну.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Учень</th>
                      <th className="text-right pb-2 font-medium">Уроків/тиж</th>
                      <th className="text-right pb-2 font-medium">Поточна</th>
                      <th className="text-right pb-2 font-medium">Нова ціна</th>
                      <th className="text-right pb-2 font-medium">Поточно</th>
                      <th className="text-right pb-2 font-medium">Прогноз</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {studentsWithData.map((s) => {
                      const perWeek = weeklyLessons[s.id] ?? 0;
                      const lessons = monthlyLessons(s.id);
                      const curK = s.current_price ?? 0;
                      const simK = parseInputToKopiyky(simulatedPrices[s.id] ?? '') ?? curK;
                      const changed = simK !== curK;
                      return (
                        <tr key={s.id} className={changed ? 'bg-yellow-50' : ''}>
                          <td className="py-2 font-medium text-gray-800">{s.name}</td>
                          <td className="py-2 text-right text-gray-600">{perWeek || '—'}</td>
                          <td className="py-2 text-right text-gray-500">
                            {curK ? formatUAH(curK) : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={simulatedPrices[s.id] ?? ''}
                                onChange={(e) =>
                                  setSimulatedPrices((p) => ({ ...p, [s.id]: e.target.value }))
                                }
                                onFocus={(e) => e.target.select()}
                                className="w-24 px-2 py-1 border border-gray-200 rounded text-right text-sm focus:ring-1 focus:ring-blue-400"
                                placeholder={curK ? (curK / 100).toFixed(2) : '—'}
                              />
                              <span className="text-gray-400 text-xs">₴</span>
                            </div>
                          </td>
                          <td className="py-2 text-right text-gray-600">
                            {curK && lessons ? formatUAH(Math.round(curK * lessons)) : '—'}
                          </td>
                          <td
                            className={`py-2 text-right font-medium ${simK > curK ? 'text-green-600' : simK < curK ? 'text-red-500' : 'text-gray-600'}`}
                          >
                            {simK && lessons ? formatUAH(Math.round(simK * lessons)) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Поточний дохід/місяць</div>
                  <div className="text-xl font-bold text-gray-800">{formatUAH(currentMonthly)}</div>
                  {taxSettings && (
                    <div className="text-xs text-gray-400">нетто ≈ {formatUAH(currentNet)}</div>
                  )}
                </div>
                <div
                  className={`rounded-lg p-3 ${diff > 0 ? 'bg-green-50' : diff < 0 ? 'bg-red-50' : 'bg-gray-50'}`}
                >
                  <div className="text-xs text-gray-500 mb-1">Прогноз/місяць</div>
                  <div
                    className={`text-xl font-bold ${diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-600' : 'text-gray-800'}`}
                  >
                    {formatUAH(simulatedMonthly)}
                    {diff !== 0 && (
                      <span className="text-sm ml-1">
                        ({diff > 0 ? '+' : ''}
                        {formatUAH(Math.abs(diff))})
                      </span>
                    )}
                  </div>
                  {taxSettings && (
                    <div className="text-xs text-gray-400">
                      нетто ≈ {formatUAH(simulatedNet)}
                      {netDiff !== 0 && (
                        <span className={netDiff > 0 ? 'text-green-600' : 'text-red-500'}>
                          {' '}
                          ({netDiff > 0 ? '+' : ''}
                          {formatUAH(Math.abs(netDiff))})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// # FinanceView

/**
 * Which money the view shows.
 *  - cash    — what was received in the period. Taxes are due on this: a ФОП
 *              declares income by payment date, so lessons paid a month ahead
 *              belong to the quarter of the payment, not of the lesson.
 *  - accrual — what was worked off in the period. Real load, no tax meaning.
 */
type IncomeBasis = 'cash' | 'accrual';

const BASES: { key: IncomeBasis; label: string; hint: string }[] = [
  { key: 'cash', label: 'Каса', hint: 'гроші, отримані в періоді — база для податків' },
  { key: 'accrual', label: 'Зароблено', hint: 'вартість проведених уроків періоду' },
];

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

const PERIODS: { key: EarningsPeriod; label: string }[] = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Тиждень' },
  { key: 'month', label: 'Місяць' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'year', label: 'Рік' },
  { key: 'all', label: 'Весь час' },
];

function FinanceView() {
  const openModal = useAppStore((s) => s.openModal);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const taxStart = useAppStore((s) => s.taxStart);
  const dataVersion = useAppStore((s) => s.dataVersion);

  const [period, setPeriod] = useState<EarningsPeriod>('month');
  const [offset, setOffset] = useState(0); // 0 = current, -1 = previous, etc.
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [basis, setBasis] = useState<IncomeBasis>('cash');

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [prevStats, setPrevStats] = useState<EarningsStats | null>(null);
  const [byDay, setByDay] = useState<EarningsByDay[]>([]);
  const [byStudent, setByStudent] = useState<EarningsByStudent[]>([]);
  const [history, setHistory] = useState<BalanceHistoryEntry[]>([]);
  const [cash, setCash] = useState<CashStats | null>(null);
  const [prevCash, setPrevCash] = useState<CashStats | null>(null);
  const [cashByDay, setCashByDay] = useState<EarningsByDay[]>([]);
  const [cashByStudent, setCashByStudent] = useState<EarningsByStudent[]>([]);
  const [unearned, setUnearned] = useState(0);

  // Reset offset when switching periods
  useEffect(() => {
    setOffset(0);
  }, [period]);

  const getActiveRange = useCallback((): DateRange => {
    if (period === 'day') return getDayRange(selectedDay);
    return getDateRangeForPeriod(period, offset);
  }, [period, offset, selectedDay]);

  const getPrevRange = useCallback((): DateRange | null => {
    if (period === 'all') return null;
    if (period === 'day') {
      const p = new Date(selectedDay);
      p.setDate(p.getDate() - 1);
      return getDayRange(p);
    }
    return getDateRangeForPeriod(period, offset - 1);
  }, [period, offset, selectedDay]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const range = getActiveRange();
      const prevRange = getPrevRange();
      const [s, byday, bystudent, ps, hist, c, cbyday, cbystudent, pc, unearnedTotal] =
        await Promise.all([
          window.electron.getEarningsStats(range.start, range.end),
          window.electron.getEarningsByDay(range.start, range.end),
          window.electron.getEarningsByStudent(range.start, range.end),
          prevRange
            ? window.electron.getEarningsStats(prevRange.start, prevRange.end)
            : Promise.resolve(null),
          window.electron.getBalanceHistory(range.start, range.end),
          window.electron.getCashStats(range.start, range.end),
          window.electron.getCashByDay(range.start, range.end),
          window.electron.getCashByStudent(range.start, range.end),
          prevRange
            ? window.electron.getCashStats(prevRange.start, prevRange.end)
            : Promise.resolve(null),
          window.electron.getUnearnedTotal(range.end),
        ]);
      setStats(s);
      setByDay(byday);
      setByStudent(bystudent);
      setPrevStats(ps);
      setHistory(hist);
      setCash(c);
      setCashByDay(cbyday);
      setCashByStudent(cbystudent);
      setPrevCash(pc);
      setUnearned(unearnedTotal);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // dataVersion refetches after a sync, a payment or any lesson change
  }, [getActiveRange, getPrevRange, dataVersion]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeRange = getActiveRange();

  // ЄСВ is due for every month since the first paid lesson with a price,
  // including months without lessons, but never before it or in the future.
  const taxMonths = getFixedTaxMonths(period, taxStart, activeRange.start, activeRange.end);

  const isCash = basis === 'cash';
  const gross = (isCash ? cash?.total : stats?.total) ?? 0;
  const prevGross = (isCash ? prevCash?.total : prevStats?.total) ?? 0;
  const activeByDay = isCash ? cashByDay : byDay;
  const activeByStudent = isCash ? cashByStudent : byStudent;

  // Taxes always follow the cash, whichever view is on screen.
  const taxBase = cash?.total ?? 0;
  const { net, taxTotal, fixedTaxAmount, singleTaxAmount, militaryTaxAmount } =
    calculateNetEarnings(taxBase, taxSettings, period, taxMonths);

  // Breakdown line under the tax card: only the taxes that actually charged something
  const taxParts = [
    singleTaxAmount > 0 ? `ЄП: ${formatUAH(singleTaxAmount)}` : null,
    militaryTaxAmount > 0 ? `ВЗ: ${formatUAH(militaryTaxAmount)}` : null,
    fixedTaxAmount > 0 ? `ЄСВ: ${formatUAH(fixedTaxAmount)}` : null,
  ].filter(Boolean);
  const change = formatChange(gross, prevGross);

  // Net of the period: removed lessons cancel out paid ones, and nothing left
  // over means there is no payment worth naming.
  const cashLessons = cash?.lessons ?? 0;
  const cashSub = cashLessons
    ? `${cashLessons > 0 ? '' : '−'}${Math.abs(cashLessons)} ${lessonsWordUA(Math.abs(cashLessons))} оплачено · база для податків`
    : 'база для податків';

  const hasTax =
    taxSettings &&
    (taxSettings.esv_type !== 'none' ||
      !!taxSettings.single_tax_enabled ||
      !!taxSettings.military_tax_enabled);

  const noPrice = (stats?.lessons_total ?? 0) > 0 && (stats?.lessons_with_price ?? 0) === 0;

  // Whole-month periods explain how many months of ЄСВ are included
  const showEsvNote =
    taxMonths >= 1 &&
    period !== 'day' &&
    period !== 'week' &&
    taxSettings?.esv_type === 'fixed' &&
    taxSettings.esv_fixed > 0;

  // No prices anywhere yet → finances are not in use, so nothing is taxed
  const financesNotStarted = !taxStart;

  // The two views differ by the advances that moved in or out of the period
  const basisGap = (cash?.total ?? 0) - (stats?.total ?? 0);
  const showUnearned = isCash && unearned !== 0;
  const cardCount = 1 + (hasTax ? 2 : 0) + 1 + (showUnearned ? 1 : 0);

  // The advances card is a balance at a moment, not a sum over the period:
  // positive means paid ahead, negative means lessons given before the money came.
  const asOfLabel = new Date(new Date(activeRange.end).getTime() - 1).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  });

  return (
    <div className="finance-view flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Фінанси</h1>
            <p className="text-sm text-gray-500 mt-0.5">{activeRange.label}</p>
          </div>
          <button
            onClick={() => openModal('taxSettings')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <Settings size={16} /> Податки
          </button>
        </div>

        {/* Period tabs + navigator */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === key
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {period === 'day' && (
            <DayNavigator selectedDate={selectedDay} onChange={setSelectedDay} />
          )}
          {period !== 'day' && period !== 'all' && (
            <PeriodNavigator offset={offset} onOffset={setOffset} label={activeRange.label} />
          )}

          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {BASES.map(({ key, label, hint }) => (
              <button
                key={key}
                onClick={() => setBasis(key)}
                title={hint}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  basis === key
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* No price warning */}
        {noPrice && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
            ⚠️ Уроки є, але ціна не встановлена.{' '}
            <button
              className="underline font-medium"
              onClick={() => useAppStore.getState().openModal('studentsList')}
            >
              Відкрити список учнів
            </button>
          </div>
        )}

        {/* Only the first load blanks the page; a refresh updates in place */}
        {loading && !stats ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mr-3" />
            Завантаження...
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className={`grid gap-4 ${GRID_COLS[cardCount] ?? 'grid-cols-4'}`}>
              <StatCard
                label={isCash ? 'Отримано (каса)' : 'Зароблено (брутто)'}
                value={formatUAH(gross)}
                sub={isCash ? cashSub : 'вартість проведених уроків'}
                accent={gross > 0}
                change={period !== 'all' ? change : undefined}
              />
              {hasTax && (
                <StatCard
                  label="Податки"
                  value={formatUAH(taxTotal)}
                  sub={taxParts.length > 0 ? taxParts.join(' + ') : undefined}
                />
              )}
              {hasTax && <StatCard label="Нетто" value={formatUAH(net)} accent={net > 0} />}
              {showUnearned && (
                <StatCard
                  label={unearned > 0 ? `Аванси на ${asOfLabel}` : `Уроки в борг на ${asOfLabel}`}
                  value={formatUAH(Math.abs(unearned))}
                  sub={
                    unearned > 0
                      ? 'оплачено наперед, ще не відпрацьовано'
                      : 'проведено, але оплачено пізніше'
                  }
                />
              )}
              <StatCard
                label="Уроків проведено"
                value={String(stats?.lessons_total ?? 0)}
                sub={
                  // Only paid lessons carry a price, so say how many that is
                  stats && stats.lessons_paid < stats.lessons_total
                    ? `${stats.lessons_paid} оплачено — лише вони у «зароблено»`
                    : undefined
                }
              />
            </div>

            {/* Why the two views disagree */}
            {basisGap !== 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-500 text-sm">
                ℹ️ Каса {formatUAH(cash?.total ?? 0)}, зароблено {formatUAH(stats?.total ?? 0)}.
                Різниця {formatUAH(Math.abs(basisGap))} — це{' '}
                {basisGap > 0
                  ? 'оплати наперед: уроки будуть у наступних періодах'
                  : 'уроки, оплачені раніше: гроші зайшли в попередніх періодах'}
                . Податки рахуються з каси, бо ФОП декларує дохід за датою отримання грошей.
              </div>
            )}

            {/* Finances not in use yet — nothing is taxed until a price and a lesson exist */}
            {financesNotStarted && hasTax && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-500 text-sm">
                ℹ️ Податки поки не нараховуються. Вони почнуть рахуватися з місяця, коли ви
                встановите ціну учню та проведете й позначите оплаченим перший урок.
              </div>
            )}

            {/* ESV basis note — ЄСВ is due every month since finances started */}
            {showEsvNote && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-500 text-sm">
                ℹ️ ЄСВ за {taxMonths} {monthsWordUA(taxMonths)}: {formatUAH(taxSettings!.esv_fixed)}{' '}
                × {taxMonths}. ЄСВ платиться щомісяця, навіть без уроків, — з місяця першого
                оплаченого уроку з ціною і до поточного.
                {period === 'quarter' && ' Сплатити до 20 числа після кварталу.'}
              </div>
            )}

            {/* Chart */}
            {activeByDay.length > 0 && period !== 'day' && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-600 mb-4">
                  {isCash ? 'Оплати по днях' : 'Зароблено по днях'}
                </h2>
                <MiniBarChart data={activeByDay} />
              </div>
            )}

            {/* By student */}
            {activeByStudent.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-600 mb-4">По учнях</h2>
                <div className="space-y-3">
                  {activeByStudent.map((s) => {
                    const pct =
                      gross > 0
                        ? Math.min(100, Math.max(0, Math.round((s.total / gross) * 100)))
                        : 0;
                    return (
                      <div key={s.student_id} className="flex items-center gap-3">
                        <div className="w-36 text-sm font-medium text-gray-800 truncate">
                          {s.student_name}
                        </div>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-sm font-semibold text-gray-700 w-28 text-right">
                          {formatUAH(s.total)}
                        </div>
                        <div className="text-xs text-gray-400 w-16 text-right">
                          {s.count} {lessonsWordUA(Math.abs(s.count))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Balance history — who paid, for how many lessons, for how much */}
            {history.length > 0 && <BalanceHistory entries={history} />}

            {gross === 0 && !noPrice && history.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">📊</div>
                <div className="font-medium">Немає даних за цей період</div>
              </div>
            )}

            <IncomeSimulator />
          </>
        )}
      </div>
    </div>
  );
}

export default FinanceView;
