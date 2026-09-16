import { useCallback } from 'react';
import Banners from './components/Banners';
import LessonSheet from './components/LessonSheet';
import TabBar from './components/TabBar';
import { Empty } from './components/ui';
import { useData, useNow, usePolling } from './hooks';
import LessonForm from './screens/LessonForm';
import NewStudent from './screens/NewStudent';
import Student from './screens/Student';
import Students from './screens/Students';
import Today from './screens/Today';
import TopUp from './screens/TopUp';
import Week from './screens/Week';
import useStore from './store';
import { initData, useBackButton } from './telegram';

function Shell({ children, tabs = false }: { children: React.ReactNode; tabs?: boolean }) {
  const toast = useStore((s) => s.toast);
  return (
    <div
      className="font-sans text-[15px] leading-snug"
      style={{ paddingBottom: 'calc(6rem + var(--tg-safe-area-inset-bottom, 0px))' }}
    >
      {children}
      {tabs && <TabBar />}
      {toast && (
        <div className="fixed inset-x-3 bottom-20 z-30 rounded-xl bg-black/90 px-3.5 py-2.5 text-center text-[13px] text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  usePolling();
  const data = useData();
  const error = useStore((s) => s.error);
  const refresh = useStore((s) => s.refresh);
  const tab = useStore((s) => s.tab);
  const stack = useStore((s) => s.stack);
  const pop = useStore((s) => s.pop);
  const sheetOpen = useStore((s) => s.sheetLessonId !== null);
  const openSheet = useStore((s) => s.openSheet);
  const now = useNow(data?.tz ?? 'UTC');

  const screen = stack[stack.length - 1] ?? null;
  const back = useCallback(
    () => (sheetOpen ? openSheet(null) : pop()),
    [sheetOpen, openSheet, pop],
  );
  useBackButton(screen !== null || sheetOpen, back);

  if (!initData()) {
    return (
      <Shell>
        <Empty>Відкрийте застосунок через Telegram.</Empty>
      </Shell>
    );
  }

  if (!data) {
    const denied = error && /^(Unauthorized|Forbidden)$/.test(error);
    return (
      <Shell>
        <Empty>
          {denied
            ? 'Немає доступу. Перевірте, чи ваш Telegram-id у білому списку бота.'
            : error
              ? 'Не вдалося отримати дані з хмари.'
              : 'Завантаження…'}
          {error && !denied && (
            <div className="mt-3">
              <button type="button" className="text-tg-link" onClick={() => void refresh()}>
                Спробувати ще раз
              </button>
            </div>
          )}
          {!error && (
            <div className="mt-3 text-xs">
              Якщо це триває довго, ПК ще не надіслав жодного знімка.
            </div>
          )}
        </Empty>
      </Shell>
    );
  }

  if (screen) {
    return (
      <Shell>
        <Banners data={data} now={now} />
        {screen.name === 'student' && (
          <Student data={data} now={now} studentId={screen.studentId} />
        )}
        {screen.name === 'topUp' && <TopUp data={data} studentId={screen.studentId} />}
        {(screen.name === 'newLesson' || screen.name === 'moveLesson') && (
          <LessonForm key={JSON.stringify(screen)} data={data} now={now} mode={screen} />
        )}
        {screen.name === 'newStudent' && <NewStudent />}
        <LessonSheet data={data} now={now} />
      </Shell>
    );
  }

  return (
    <Shell tabs>
      <Banners data={data} now={now} />
      {tab === 'today' && <Today data={data} now={now} />}
      {tab === 'week' && <Week data={data} now={now} />}
      {tab === 'students' && <Students data={data} />}
      <LessonSheet data={data} now={now} />
    </Shell>
  );
}
