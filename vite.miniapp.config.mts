import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { writeFileSync } from 'fs';
import path from 'path';

// The Telegram Mini App: built from miniapp/ into cloud/public, which the
// Worker serves as static assets next to the API.
const outDir = path.resolve(import.meta.dirname, 'cloud/public');

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'miniapp'),
  plugins: [
    react(),
    // emptyOutDir wipes the tracked placeholder; put it back so a fresh clone can run wrangler.
    { name: 'gitkeep', closeBundle: () => writeFileSync(path.join(outDir, '.gitkeep'), '') },
  ],
  base: '/',
  server: {
    port: 5174,
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(import.meta.dirname, 'tailwind.miniapp.config.mjs') }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
});
