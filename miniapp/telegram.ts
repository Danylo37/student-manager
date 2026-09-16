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

/** Telegram tells when the Mini App comes back to the front (Bot API 8.0+). */
export function onActivated(handler: () => void): () => void {
  if (!webApp?.isVersionAtLeast('8.0')) return () => {};
  webApp.onEvent('activated', handler);
  return () => webApp.offEvent('activated', handler);
}
