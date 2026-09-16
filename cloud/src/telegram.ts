import type { Env } from './env';
import { isAllowed } from './env';
import { safeEqual } from './auth';

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number };
  };
}

export async function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  if (!response.ok) throw new Error(`sendMessage failed: HTTP ${response.status}`);
}

// # WEBHOOK
//
// Only /start is handled: it answers with the button that opens the Mini App,
// served from this same origin. Anyone outside the whitelist gets silence.

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!safeEqual(token, env.WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });

  const update = await request.json<TelegramUpdate>();
  const message = update.message;
  if (message?.from && message.text?.startsWith('/start') && isAllowed(env, message.from.id)) {
    const url = new URL(request.url).origin;
    try {
      await sendMessage(env, message.chat.id, 'Відкрийте застосунок кнопкою нижче.', {
        reply_markup: { inline_keyboard: [[{ text: 'Відкрити', web_app: { url } }]] },
      });
    } catch (error) {
      console.error('start reply failed', { error: (error as Error).message });
    }
  }
  // Telegram retries anything but 2xx, so a failed reply and an unknown update are both "ok".
  return new Response('ok');
}
