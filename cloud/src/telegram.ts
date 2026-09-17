import type { Env } from './env';
import { isAllowed } from './env';
import { safeEqual } from './auth';
import * as db from './db';

interface TelegramUser {
  id: number;
  first_name: string;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: TelegramUser;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramUser;
    message?: { message_id: number; chat: { id: number } };
  };
}

async function call<T = unknown>(env: Env, method: string, body: unknown): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} failed: HTTP ${response.status}`);
  return ((await response.json()) as { result: T }).result;
}

export async function sendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await call(env, 'sendMessage', { chat_id: chatId, text, ...extra });
}

let botUsername: string | null = null;

/** The bot's own username for invite links; asked once per isolate. */
async function usernameOf(env: Env): Promise<string> {
  botUsername ??= (await call<{ username: string }>(env, 'getMe', {})).username;
  return botUsername;
}

// # CODES

const CODE_TTL_MS = 10 * 60 * 1000;

function newCode(): string {
  // Six digits from a uniform 32-bit draw; the modulo bias is 1 in 4 295.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const digits = (text: string) => text.replace(/\D/g, '');

async function issue(
  env: Env,
  kind: db.CodeKind,
  user: TelegramUser,
  accountId: number | null,
): Promise<string> {
  const code = newCode();
  const now = Date.now();
  await db.issueCode(
    env.DB,
    { code, kind, tgUserId: user.id, accountId, firstName: user.first_name },
    new Date(now + CODE_TTL_MS).toISOString(),
    new Date(now).toISOString(),
  );
  return code;
}

// # COMMANDS
//
// Every command is from a whitelisted user in a private chat; anyone else is
// told their id, which is what the developer needs to let them in.

const LEAVE_CALLBACK = 'leave';

const openButton = (origin: string) => ({
  reply_markup: { inline_keyboard: [[{ text: 'Відкрити', web_app: { url: origin } }]] },
});

async function start(env: Env, chat: number, user: TelegramUser, origin: string): Promise<void> {
  const member = await db.memberOf(env.DB, user.id);
  const hint = member ? '' : '\n\nЩоб підключити свій комп’ютер, надішліть /connect.';
  await sendMessage(env, chat, `Відкрийте застосунок кнопкою нижче.${hint}`, openButton(origin));
}

async function connect(env: Env, chat: number, user: TelegramUser): Promise<void> {
  const member = await db.memberOf(env.DB, user.id);
  if (member?.role === 'member') {
    const owner = (await db.ownerName(env.DB, member.account_id)) ?? 'власника';
    await sendMessage(
      env,
      chat,
      `Ви приєднані до ПК ${owner}. Щоб підключити свій, спочатку /leave.`,
    );
    return;
  }
  const code = await issue(env, 'pair', user, member?.account_id ?? null);
  await sendMessage(
    env,
    chat,
    `Код підключення: ${spaced(code)}\nДійсний 10 хвилин.\n\n` +
      'На комп’ютері: іконка хмари у шапці → введіть код → «Підключити».',
  );
}

async function invite(env: Env, chat: number, user: TelegramUser): Promise<void> {
  const member = await db.memberOf(env.DB, user.id);
  if (!member) {
    await sendMessage(env, chat, 'Спочатку підключіть комп’ютер: /connect.');
    return;
  }
  if (member.role !== 'owner') {
    await sendMessage(env, chat, 'Запрошувати може лише власник ПК.');
    return;
  }
  const code = await issue(env, 'invite', user, member.account_id);
  const link = `https://t.me/${await usernameOf(env)}?start=join_${code}`;
  await sendMessage(
    env,
    chat,
    `Перешліть це посилання тому, кого хочете підключити. Дійсне 10 хвилин.\n${link}\n\n` +
      `Або нехай надішле боту: /join ${code}`,
  );
}

async function join(
  env: Env,
  chat: number,
  user: TelegramUser,
  rawCode: string,
  origin: string,
): Promise<void> {
  if (await db.memberOf(env.DB, user.id)) {
    await sendMessage(
      env,
      chat,
      'Ви вже приєднані до ПК. Щоб приєднатися до іншого, спочатку /leave.',
    );
    return;
  }
  const code = digits(rawCode);
  const accountId =
    code.length === 6
      ? await db.joinByInvite(
          env.DB,
          code,
          { tgUserId: user.id, firstName: user.first_name },
          new Date().toISOString(),
        )
      : null;
  if (accountId == null) {
    await sendMessage(
      env,
      chat,
      'Запрошення недійсне або прострочене. Попросіть власника надіслати /invite ще раз.',
    );
    return;
  }
  const owner = (await db.ownerName(env.DB, accountId)) ?? 'власника';
  await sendMessage(env, chat, `Підключено до ПК ${owner}.`, openButton(origin));
}

async function leave(env: Env, chat: number, user: TelegramUser): Promise<void> {
  const member = await db.memberOf(env.DB, user.id);
  if (!member) {
    await sendMessage(env, chat, 'Ви не приєднані до жодного ПК.');
    return;
  }
  if (member.role === 'member') {
    await db.removeMember(env.DB, user.id);
    await sendMessage(env, chat, 'Від’єднано.');
    return;
  }
  // The owner takes the account with them: the desktop and every phone lose it.
  await sendMessage(
    env,
    chat,
    'Це від’єднає ваш комп’ютер: телефони перестануть бачити його дані, ' +
      'а комп’ютер доведеться підключити заново через /connect.',
    {
      reply_markup: {
        inline_keyboard: [[{ text: 'Так, від’єднати ПК', callback_data: LEAVE_CALLBACK }]],
      },
    },
  );
}

async function onMessage(
  env: Env,
  origin: string,
  message: { text: string; chat: { id: number }; from: TelegramUser },
): Promise<void> {
  const chat = message.chat.id;
  const user = message.from;
  if (!isAllowed(env, user.id)) {
    await sendMessage(env, chat, `Немає доступу. Ваш id: ${user.id}, надішліть його розробнику.`);
    return;
  }
  // "/join 482 913" is typed as the bot printed it, so the argument is the whole rest.
  const text = message.text.trim();
  const space = text.search(/\s/);
  const command = space < 0 ? text : text.slice(0, space);
  const arg = space < 0 ? '' : text.slice(space + 1).trim();
  switch (command) {
    case '/start':
      return arg.startsWith('join_')
        ? join(env, chat, user, arg.slice('join_'.length), origin)
        : start(env, chat, user, origin);
    case '/join':
      return join(env, chat, user, arg, origin);
    case '/connect':
      return connect(env, chat, user);
    case '/invite':
      return invite(env, chat, user);
    case '/leave':
      return leave(env, chat, user);
  }
}

async function onCallback(
  env: Env,
  query: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  // Stops the spinner on the button; a stale query is answered like any other.
  const answered = call(env, 'answerCallbackQuery', { callback_query_id: query.id }).catch(
    () => undefined,
  );
  let text: string | null = null;
  if (query.data === LEAVE_CALLBACK && isAllowed(env, query.from.id)) {
    const member = await db.memberOf(env.DB, query.from.id);
    text = 'Уже від’єднано.';
    if (member?.role === 'owner') {
      await db.deleteAccount(env.DB, member.account_id);
      text = 'Від’єднано. Комп’ютер більше не синхронізується.';
    }
  }
  await answered;
  if (text === null) return;
  // Replacing the question also removes its button, so a second tap has nothing to press.
  if (query.message) {
    await call(env, 'editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text,
    });
  } else {
    await sendMessage(env, query.from.id, text);
  }
}

// # WEBHOOK

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!safeEqual(token, env.WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });

  const update = await request.json<TelegramUpdate>();
  const message = update.message;
  try {
    if (update.callback_query) {
      await onCallback(env, update.callback_query);
    } else if (message?.from && typeof message.text === 'string') {
      const origin = new URL(request.url).origin;
      await onMessage(env, origin, { text: message.text, chat: message.chat, from: message.from });
    }
  } catch (error) {
    console.error('webhook failed', { error: (error as Error).message });
    if (message) {
      await sendMessage(
        env,
        message.chat.id,
        'Не вдалося виконати команду, спробуйте ще раз.',
      ).catch(() => undefined);
    }
  }
  // Telegram retries anything but 2xx, so a failed reply and an unknown update are both "ok".
  return new Response('ok');
}
