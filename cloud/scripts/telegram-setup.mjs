// One-time bot setup: webhook, menu button, command list. Reads BOT_TOKEN and
// WEBHOOK_SECRET from .dev.vars so neither goes through a shell history.
//   node scripts/telegram-setup.mjs https://student-manager.<account>.workers.dev
import { readFileSync } from 'node:fs';

const origin = process.argv[2]?.replace(/\/$/, '');
if (!origin?.startsWith('https://')) {
  console.error('usage: node scripts/telegram-setup.mjs https://<worker-host>');
  process.exit(1);
}

const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=').map((s) => s.trim()))
    .map(([key, ...rest]) => [key, rest.join('=')]),
);
const { BOT_TOKEN, WEBHOOK_SECRET } = vars;
if (!BOT_TOKEN || !WEBHOOK_SECRET) {
  console.error('BOT_TOKEN and WEBHOOK_SECRET must be set in .dev.vars');
  process.exit(1);
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  console.log(method, result.ok ? 'ok' : `failed: ${result.description}`);
  if (!result.ok) process.exitCode = 1;
}

await call('setWebhook', {
  url: `${origin}/webhook/telegram`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
await call('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'Відкрити', web_app: { url: origin } },
});
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Відкрити застосунок' },
    { command: 'connect', description: "Підключити комп'ютер: код для програми" },
    { command: 'invite', description: 'Запросити ще один телефон до свого ПК' },
    { command: 'leave', description: "Від'єднатися від ПК" },
  ],
});
