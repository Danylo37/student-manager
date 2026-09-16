import { useState } from 'react';
import {
  RefreshCw,
  Users,
  Palette,
  BarChart2,
  CalendarDays,
  Cloud,
  CloudOff,
  CloudAlert,
} from 'lucide-react';
import { formatDateWithMonth } from '@/utils/dateHelpers';
import { calculateNetEarnings, getFixedTaxMonths, formatUAH, hasAnyTax } from '@/utils/financials';
import { describeSyncStatus } from '@/utils/syncStatus';
import useLessons from '@/hooks/useLessons';
import useAppStore from '@/store/appStore';

function Header() {
  const { nextWeek, prevWeek, goToToday, lessonsLoading, lessons } = useLessons();
  const openModal = useAppStore((s) => s.openModal);
  const syncLessons = useAppStore((s) => s.syncLessons);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const taxSettings = useAppStore((s) => s.taxSettings);
  const currentWeek = useAppStore((s) => s.currentWeek);
  const students = useAppStore((s) => s.students);
  const syncStatus = useAppStore((s) => s.syncStatus);

  const [syncing, setSyncing] = useState(false);

  const weekStart = new Date(currentWeek);
  const weekEnd = new Date(currentWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Weekly earnings in kopiyky (only paid, completed lessons with price set)
  const weekPaidLessons = lessons.filter((l) => l.is_completed && l.is_paid && l.price != null);
  const weekGrossKopiyky = weekPaidLessons.reduce((sum, l) => sum + (l.price ?? 0), 0);

  // Students excluded from taxes stay out of the ЄП/ВЗ base. This badge counts lessons,
  // not payments, so it follows the student's flag today rather than a payment snapshot.
  const exemptStudentIds = new Set(students.filter((s) => s.is_tax_exempt).map((s) => s.id));
  const weekTaxableKopiyky = weekPaidLessons
    .filter((l) => l.student_id == null || !exemptStudentIds.has(l.student_id))
    .reduce((sum, l) => sum + (l.price ?? 0), 0);

  // Week end is exclusive for the tax helper
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);

  const { net: weekNetKopiyky } = calculateNetEarnings(
    weekGrossKopiyky,
    taxSettings,
    'week',
    getFixedTaxMonths(
      'week',
      taxSettings?.esv_since ?? null,
      weekStart.toISOString(),
      weekEndExclusive.toISOString(),
    ),
    weekTaxableKopiyky,
  );

  const hasTax = hasAnyTax(taxSettings);

  // syncLessons already reloads lessons and students, and the reload bumps
  // dataVersion, which is what makes the finance view refetch.
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncLessons();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const accent =
    theme === 'purple'
      ? 'bg-purple-100 hover:bg-purple-200 text-purple-700'
      : 'bg-blue-100 hover:bg-blue-200 text-blue-700';

  const syncState = syncStatus?.state ?? 'off';
  const SyncIcon = syncState === 'error' ? CloudAlert : syncState === 'off' ? CloudOff : Cloud;
  const syncClass = {
    off: 'bg-gray-100 hover:bg-gray-200 text-gray-400',
    idle: 'bg-green-100 hover:bg-green-200 text-green-700',
    syncing: `${accent} animate-pulse`,
    error: 'bg-red-100 hover:bg-red-200 text-red-700',
  }[syncState];

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => openModal('addStudent')}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              + Додати учня
            </button>
            <button
              onClick={() => openModal('addLesson')}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              + Додати урок
            </button>
            <button
              onClick={() => openModal('studentsList')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Users size={18} /> Учні
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${accent}`}
              title="Оновити дані"
            >
              <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${accent}`}
              title={theme === 'purple' ? 'Стандартна тема' : 'Фіолетова тема'}
            >
              <Palette size={20} />
            </button>
            <button
              onClick={() => openModal('syncSettings')}
              className={`p-2 rounded-lg transition-colors ${syncClass}`}
              title={describeSyncStatus(syncStatus)}
            >
              <SyncIcon size={20} />
            </button>

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  currentView === 'calendar'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarDays size={15} /> Календар
              </button>
              <button
                onClick={() => setView('finance')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  currentView === 'finance'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <BarChart2 size={15} /> Фінанси
              </button>
            </div>
          </div>

          {/* Center: week + earnings */}
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold text-gray-800">
              {formatDateWithMonth(weekStart)} — {formatDateWithMonth(weekEnd)}
            </div>
            <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
              {lessons.length} {lessons.length === 1 ? 'урок' : 'уроків'}
            </div>
            {weekGrossKopiyky > 0 && (
              <div className="flex items-center gap-2">
                <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                  💰 {formatUAH(weekGrossKopiyky)}
                </div>
                {hasTax && weekNetKopiyky !== weekGrossKopiyky && (
                  <div
                    className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium"
                    title="Нетто (після податків)"
                  >
                    ≈ {formatUAH(weekNetKopiyky)} нетто
                  </div>
                )}
              </div>
            )}
            {lessonsLoading && (
              <div className="flex items-center gap-2 text-blue-600 text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                Завантаження...
              </div>
            )}
          </div>

          {/* Right: navigation (calendar only) */}
          {currentView === 'calendar' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={prevWeek}
                disabled={lessonsLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                ← Попередній
              </button>
              <button
                onClick={goToToday}
                disabled={lessonsLoading}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Сьогодні
              </button>
              <button
                onClick={nextWeek}
                disabled={lessonsLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Наступний →
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
