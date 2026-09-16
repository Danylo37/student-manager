import { useEffect } from 'react';

// The script from telegram.org defines window.Telegram.WebApp, also outside
// Telegram (then initData is empty). Everything the app needs from it is here.

const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export const initData = (): string => webApp?.initData ?? '';

function applyScheme(): void {
  document.documentElement.dataset.scheme = webApp?.colorScheme ?? 'light';
}

export function initTelegram(): void {
  applyScheme();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  webApp.onEvent('themeChanged', applyScheme);
  if (webApp.isVersionAtLeast('7.7')) webApp.disableVerticalSwipes();
}

/** Telegram's native confirm; the browser's when opened outside Telegram. */
export function confirm(text: string): Promise<boolean> {
  if (!webApp?.isVersionAtLeast('6.2')) return Promise.resolve(window.confirm(text));
  return new Promise((resolve) => webApp.showConfirm(text, resolve));
}

export const haptic = {
  tap: () => webApp?.HapticFeedback.impactOccurred('light'),
  success: () => webApp?.HapticFeedback.notificationOccurred('success'),
  error: () => webApp?.HapticFeedback.notificationOccurred('error'),
};

export function useBackButton(visible: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!webApp) return;
    const button = webApp.BackButton;
    if (!visible) {
      button.hide();
      return;
    }
    button.onClick(onBack);
    button.show();
    return () => {
      button.offClick(onBack);
    };
  }, [visible, onBack]);
}

export interface MainButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/** The Telegram bottom button for the screen that mounts this; hidden again when it goes. */
export function useMainButton({
  text,
  onClick,
  disabled = false,
  loading = false,
}: MainButtonProps) {
  useEffect(
    () => () => {
      webApp?.MainButton.hide();
    },
    [],
  );
  useEffect(() => {
    if (!webApp) return;
    const button = webApp.MainButton;
    // hideProgress() re-enables the button, so the active flag goes after it.
    if (loading) {
      button.setParams({ text, is_visible: true });
      button.showProgress(false);
    } else {
      button.hideProgress();
      button.setParams({ text, is_active: !disabled, is_visible: true });
    }
    button.onClick(onClick);
    return () => {
      button.offClick(onClick);
    };
  }, [text, onClick, disabled, loading]);
}
