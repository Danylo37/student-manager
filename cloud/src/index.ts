import type { Env } from './env';
import { requireDevice, requireTelegramUser, sha256Hex, type TelegramUser } from './auth';
import { HttpError, isRecord, json, readJson, throttle } from './http';
import { handleWebhook, sendMessage } from './telegram';
import * as db from './db';
import type { Ack } from './db';

const PULL_LIMIT_DEFAULT = 100;
const PULL_LIMIT_MAX = 500;
const FAILED_VISIBLE_MS = 48 * 60 * 60 * 1000;
const DECIDED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const INTENT_ID = /^[A-Za-z0-9-]{8,64}$/;
const PAIR_CODE = /^\d{6}$/;
const ACK_STATUSES = new Set<Ack['status']>(['applied', 'failed']);

// # DESKTOP

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The code from the bot's /connect becomes the desktop's secret; the cloud keeps only its hash. */
async function pairDevice(request: Request, env: Env): Promise<Response> {
  const body = await readJson<unknown>(request);
  const code = isRecord(body) && typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!PAIR_CODE.test(code)) throw new HttpError(400, 'code must be six digits');
  const secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const paired = await db.pairDevice(
    env.DB,
    code,
    await sha256Hex(secret),
    new Date().toISOString(),
  );
  // Wrong and expired look the same: a guess learns nothing.
  if (!paired) throw new HttpError(403, 'Forbidden');
  return json({ secret });
}

async function pushSnapshot(request: Request, env: Env, accountId: number): Promise<Response> {
  const body = await readJson<unknown>(request);
  if (!isRecord(body) || !Number.isInteger(body.revision) || (body.revision as number) < 1) {
    throw new HttpError(400, 'revision must be a positive integer');
  }
  const revision = body.revision as number;
  const stored = await db.writeSnapshot(
    env.DB,
    accountId,
    revision,
    JSON.stringify(body),
    new Date().toISOString(),
  );
  if (stored) return json({ revision });
  // Stale: the desktop learns the cloud's revision and continues from above it.
  return json(
    { error: 'Stale revision', revision: await db.readSnapshotRevision(env.DB, accountId) },
    409,
  );
}

async function pullIntents(url: URL, env: Env, accountId: number): Promise<Response> {
  const requested = Number(url.searchParams.get('limit') ?? PULL_LIMIT_DEFAULT);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, PULL_LIMIT_MAX)
      : PULL_LIMIT_DEFAULT;
  // A pull is the desktop's heartbeat: it happens every minute while it runs.
  const [intents, members] = await Promise.all([
    db.pendingIntents(env.DB, accountId, limit),
    db.memberCount(env.DB, accountId),
    db.touchDevice(env.DB, accountId, new Date().toISOString()),
  ]);
  // With several phones on the account the desktop names the author in its history.
  return json({ intents: intents.map((intent) => ({ ...intent, members })) });
}

function parseAcks(body: unknown): Ack[] {
  if (!isRecord(body) || !Array.isArray(body.results))
    throw new HttpError(400, 'results must be an array');
  return body.results.map((item): Ack => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !ACK_STATUSES.has(item.status as Ack['status'])
    ) {
      throw new HttpError(400, 'each result needs id and status applied|failed');
    }
    if (item.reason != null && typeof item.reason !== 'string')
      throw new HttpError(400, 'reason must be a string');
    return {
      id: item.id,
      status: item.status as Ack['status'],
      reason: (item.reason as string | undefined) ?? null,
    };
  });
}

async function ackIntents(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  accountId: number,
): Promise<Response> {
  const acks = parseAcks(await readJson<unknown>(request));
  const changed = await db.ackIntents(env.DB, accountId, acks, new Date().toISOString());
  // The phone that recorded a refused intent hears why, from the desktop's own words.
  for (const row of changed) {
    if (row.status !== 'failed') continue;
    const text = `⚠️ Дію не застосовано: ${row.reason ?? 'невідома причина'}`;
    ctx.waitUntil(
      sendMessage(env, row.tg_user_id, text).catch((error: Error) =>
        console.error('notify failed', { id: row.id, error: error.message }),
      ),
    );
  }
  return json({ acked: changed.length });
}

// # MINI APP

const UNPAIRED = { snapshot: null, intents: [], deviceSeenAt: null, paired: false };

async function appSnapshot(env: Env, accountId: number | null): Promise<Response> {
  if (accountId == null) return json(UNPAIRED);
  const failedSince = new Date(Date.now() - FAILED_VISIBLE_MS).toISOString();
  const [snapshot, intents, deviceSeenAt] = await Promise.all([
    db.readSnapshot(env.DB, accountId),
    db.openIntents(env.DB, accountId, failedSince),
    db.readDeviceSeenAt(env.DB, accountId),
  ]);
  return json({ snapshot, intents, deviceSeenAt, paired: true });
}

async function recordIntent(
  request: Request,
  env: Env,
  user: TelegramUser,
  accountId: number | null,
): Promise<Response> {
  if (accountId == null) throw new HttpError(409, 'Not paired');
  const body = await readJson<unknown>(request);
  if (!isRecord(body)) throw new HttpError(400, 'intent must be an object');
  if (typeof body.id !== 'string' || !INTENT_ID.test(body.id))
    throw new HttpError(400, 'invalid id');
  if (typeof body.type !== 'string' || !body.type.trim()) throw new HttpError(400, 'invalid type');
  if (!isRecord(body.payload)) throw new HttpError(400, 'payload must be an object');
  // The desktop is the judge of the type and payload; the cloud only keeps the envelope.
  // created_at is the cloud's clock, not the phone's.
  const intent = await db.insertIntent(
    env.DB,
    {
      id: body.id,
      accountId,
      type: body.type,
      payload: body.payload,
      source: 'miniapp',
      tgUserId: user.id,
      firstName: user.first_name,
    },
    new Date().toISOString(),
  );
  if (!intent) throw new HttpError(409, 'Intent id in use');
  return json(intent, 202);
}

// # ROUTER

const API_PREFIXES = ['/device/', '/app/', '/webhook/'];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  switch (`${request.method} ${url.pathname}`) {
    case 'POST /device/pair':
      // No secret yet, so the code is the whole authorization: a guess must stay slow.
      await throttle(env.PAIR_RATE_LIMIT, request.headers.get('cf-connecting-ip') ?? 'unknown');
      return pairDevice(request, env);
    case 'POST /device/snapshot':
      return pushSnapshot(request, env, await requireDevice(request, env));
    case 'GET /device/intents':
      return pullIntents(url, env, await requireDevice(request, env));
    case 'POST /device/intents/ack':
      return ackIntents(request, env, ctx, await requireDevice(request, env));
    case 'GET /app/snapshot': {
      const user = await requireTelegramUser(request, env);
      return appSnapshot(env, (await db.memberOf(env.DB, user.id))?.account_id ?? null);
    }
    case 'POST /app/intent': {
      const user = await requireTelegramUser(request, env);
      await throttle(env.INTENT_RATE_LIMIT, String(user.id));
      return recordIntent(
        request,
        env,
        user,
        (await db.memberOf(env.DB, user.id))?.account_id ?? null,
      );
    }
    case 'POST /webhook/telegram':
      return handleWebhook(request, env);
    default:
      if (API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)))
        throw new HttpError(404, 'Not found');
      return env.ASSETS.fetch(request);
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      // Never the body: it carries names and amounts.
      console.error('unhandled', {
        method: request.method,
        path: new URL(request.url).pathname,
        error: (error as Error).message,
      });
      return json({ error: 'Internal error' }, 500);
    }
  },

  // The desktop remembers every intent it decided on; the cloud only needs the
  // pending ones and the failures the Mini App still shows.
  async scheduled(_controller, env) {
    const cutoff = new Date(Date.now() - DECIDED_KEEP_MS).toISOString();
    const deleted = await db.deleteDecidedIntentsBefore(env.DB, cutoff);
    console.log('decided intents cleaned', { deleted });
  },
} satisfies ExportedHandler<Env>;
