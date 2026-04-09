import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  exiting?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface NotificationContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

// ─── Toast icons ────────────────────────────────────────────────────────────

const icons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

const toastStyles: Record<ToastType, { wrapper: string; icon: string; bar: string }> = {
  success: {
    wrapper: 'bg-white border border-green-200 shadow-lg shadow-green-100/50',
    icon: 'text-green-500 bg-green-50',
    bar: 'bg-green-400',
  },
  error: {
    wrapper: 'bg-white border border-red-200 shadow-lg shadow-red-100/50',
    icon: 'text-red-500 bg-red-50',
    bar: 'bg-red-400',
  },
  warning: {
    wrapper: 'bg-white border border-amber-200 shadow-lg shadow-amber-100/50',
    icon: 'text-amber-500 bg-amber-50',
    bar: 'bg-amber-400',
  },
  info: {
    wrapper: 'bg-white border border-blue-200 shadow-lg shadow-blue-100/50',
    icon: 'text-blue-500 bg-blue-50',
    bar: 'bg-blue-400',
  },
};

// ─── Single Toast ────────────────────────────────────────────────────────────

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const style = toastStyles[toast.type];
  const duration = toast.duration ?? 3800;

  return (
    <div
      className={`
        relative flex items-start gap-3 w-80 rounded-xl p-4 overflow-hidden
        ${style.wrapper}
        ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}
      `}
    >
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-[3px] ${style.bar} animate-progress-bar`}
        style={{ animationDuration: `${duration}ms` }}
      />

      {/* Icon */}
      <div className={`flex-shrink-0 rounded-lg p-1.5 ${style.icon}`}>{icons[toast.type]}</div>

      {/* Message */}
      <p className="flex-1 text-sm font-medium text-gray-700 pt-0.5 leading-snug">
        {toast.message}
      </p>

      {/* Close button */}
      <button
        onClick={() => onClose(toast.id)}
        className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
        aria-label="Закрити"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
        </svg>
      </button>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  state,
  onAnswer,
}: {
  state: ConfirmState;
  onAnswer: (value: boolean) => void;
}) {
  const {
    title,
    message,
    confirmLabel = 'Підтвердити',
    cancelLabel = 'Скасувати',
    danger = false,
  } = state;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnswer(false);
      if (e.key === 'Enter') onAnswer(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onAnswer]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] animate-fade-in"
        onClick={() => onAnswer(false)}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-dialog-in overflow-hidden">
        {/* Top accent */}
        <div
          className={`h-1 w-full ${danger ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-blue-400 to-violet-500'}`}
        />

        <div className="p-6">
          {/* Icon */}
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? 'bg-red-50' : 'bg-blue-50'}`}
          >
            {danger ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-6 h-6 text-red-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-6 h-6 text-blue-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                />
              </svg>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>

          {/* Message */}
          <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => onAnswer(false)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => onAnswer(true)}
              className={`
                flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all active:scale-95
                ${
                  danger
                    ? 'bg-red-500 hover:bg-red-600 shadow-md shadow-red-200'
                    : 'bg-blue-500 hover:bg-blue-600 shadow-md shadow-blue-200'
                }
              `}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3800) => {
      counterRef.current += 1;
      const id = `toast-${counterRef.current}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast],
  );

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirmAnswer = useCallback(
    (value: boolean) => {
      confirmState?.resolve(value);
      setConfirmState(null);
    },
    [confirmState],
  );

  return (
    <NotificationContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onClose={removeToast} />
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && <ConfirmDialog state={confirmState} onAnswer={handleConfirmAnswer} />}
    </NotificationContext.Provider>
  );
}
