/** @type {import('tailwindcss').Config} */
export default {
  content: ['./miniapp/index.html', './miniapp/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-scheme="dark"]'],
  theme: {
    extend: {
      // Telegram writes its theme into these variables; the fallbacks are its light theme.
      colors: {
        tg: {
          bg: 'var(--tg-theme-bg-color, #ffffff)',
          'bg-2': 'var(--tg-theme-secondary-bg-color, #efeff4)',
          section: 'var(--tg-theme-section-bg-color, #ffffff)',
          separator: 'var(--tg-theme-section-separator-color, #d8d8dc)',
          text: 'var(--tg-theme-text-color, #000000)',
          hint: 'var(--tg-theme-hint-color, #8e8e93)',
          link: 'var(--tg-theme-link-color, #3390ec)',
          button: 'var(--tg-theme-button-color, #3390ec)',
          'button-text': 'var(--tg-theme-button-text-color, #ffffff)',
          destructive: 'var(--tg-theme-destructive-text-color, #ff3b30)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
