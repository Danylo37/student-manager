import type { Env } from './env';
import { isAllowed } from './env';
import { HttpError } from './http';

const encoder = new TextEncoder();

async function hmacSha256(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time comparison; a length mismatch is answered without comparing. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

// # DESKTOP

export function requireDevice(request: Request, env: Env): void {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token || !safeEqual(token, env.DEVICE_SECRET)) throw new HttpError(401, 'Unauthorized');
}

// # MINI APP
//
// The only authorization: Telegram signs initData with HMAC(key = HMAC("WebAppData",
// BOT_TOKEN)); the signature, its age and the user id whitelist are all checked here.

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export async function requireTelegramUser(request: Request, env: Env): Promise<TelegramUser> {
  const header = request.headers.get('authorization') ?? '';
  const initData = header.startsWith('tma ') ? header.slice('tma '.length) : '';
  if (!initData) throw new HttpError(401, 'Unauthorized');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new HttpError(401, 'Unauthorized');
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = await hmacSha256(encoder.encode('WebAppData'), env.BOT_TOKEN);
  const expected = hex(await hmacSha256(secret, checkString));
  if (!safeEqual(expected, hash)) throw new HttpError(401, 'Unauthorized');

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new HttpError(401, 'initData expired');
  }

  let user: TelegramUser | null = null;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    user = null;
  }
  if (!user || !Number.isInteger(user.id)) throw new HttpError(401, 'Unauthorized');
  if (!isAllowed(env, user.id)) throw new HttpError(403, 'Forbidden');
  return user;
}
