import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Check } from 'lucide-react';

export interface ActionMenuItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** Renders in red — for destructive actions. */
  danger?: boolean;
  /** Draws a divider above the item. */
  separatorBefore?: boolean;
  /** Toggle state: highlights the item and shows a check mark. */
  active?: boolean;
}

const MENU_MIN_WIDTH = 200;
const VIEWPORT_MARGIN = 8;

/**
 * Kebab menu for row actions. Rendered in a portal with fixed positioning: the
 * lists it sits in scroll with `overflow-y-auto`, which would clip an absolutely
 * positioned menu.
 */
function ActionMenu({ items, title = 'Дії' }: { items: ActionMenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    // Width comes from the widest label — labels never wrap.
    const width = menuRef.current?.offsetWidth ?? MENU_MIN_WIDTH;
    const height = menuRef.current?.offsetHeight ?? 0;
    const below = trigger.bottom + 4;
    const flipUp = below + height > window.innerHeight - VIEWPORT_MARGIN;
    setPos({
      top: flipUp ? Math.max(VIEWPORT_MARGIN, trigger.top - 4 - height) : below,
      left: Math.max(VIEWPORT_MARGIN, trigger.right - width),
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Capture phase, so the Escape that closes the menu never reaches the modal
    // behind it (Modal listens on document while bubbling).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    const handleReposition = () => setOpen(false);

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`px-2 py-1 rounded text-sm ${open ? 'bg-gray-200 text-gray-700' : 'hover:bg-gray-200 text-gray-500'}`}
      >
        <MoreVertical size={16} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left, minWidth: MENU_MIN_WIDTH }}
            className="fixed z-[60] bg-white rounded-lg shadow-xl border border-gray-200 py-1 animate-fade-in"
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left whitespace-nowrap ${
                  item.separatorBefore ? 'border-t border-gray-200 mt-1 pt-2' : ''
                } ${
                  item.danger
                    ? 'text-red-600 hover:bg-red-50'
                    : item.active
                      ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                      : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.active && <Check size={14} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export default ActionMenu;
