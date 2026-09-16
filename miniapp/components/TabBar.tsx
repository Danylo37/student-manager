import useStore, { type Tab } from '../store';
import { haptic } from '../telegram';

const TABS: Array<{ key: Tab; icon: string; label: string }> = [
  { key: 'today', icon: '📋', label: 'Сьогодні' },
  { key: 'week', icon: '🗓', label: 'Тиждень' },
  { key: 'students', icon: '👥', label: 'Учні' },
];

export default function TabBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t border-tg-separator bg-tg-section"
      style={{ paddingBottom: 'var(--tg-safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ key, icon, label }) => (
        <button
          key={key}
          type="button"
          className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[10.5px] ${
            tab === key ? 'text-tg-link' : 'text-tg-hint'
          }`}
          onClick={() => {
            haptic.tap();
            setTab(key);
          }}
        >
          <span className="text-[19px] leading-none">{icon}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
