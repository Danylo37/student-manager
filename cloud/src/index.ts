import type { Env } from './env';
import { allowedIds } from './env';
import { requireDevice, requireTelegramUser } from './auth';
import { HttpError, isRecord, json, readJson } from './http';
import { handleWebhook, sendMessage } from './telegram';
import * as db from './db';
import type { Ack } from './db';

const PULL_LIMIT_DEFAULT = 100;
const PULL_LIMIT_MAX = 500;
const FAILED_VISIBLE_MS = 48 * 60 * 60 * 1000;
const INTENT_ID = /^[A-Za-z0-9-]{8,64}$/;
const ACK_STATUSES = new Set<Ack['status']>(['applied', 'failed']);

// # DESKTOP

async function pushSnapshot(request: Request, env: Env): Promise<Response> {
  const body = await readJson<unknown>(request);
  if (!isRecord(body) || !Number.isInteger(body.revision) || (body.revision as number) < 1) {
    throw new HttpError(400, 'revision must be a positive integer');
  }
  const revision = body.revision as number;
  const stored = await db.writeSnapshot(
    env.DB,
    revision,
    JSON.stringify(body),
    new Date().toISOString(),
  );
  if (stored) return json({ revision });
  // Stale: the desktop learns the cloud's revision and continues from above it.
  return json({ error: 'Stale revision', revision: await db.readSnapshotRevision(env.DB) }, 409);
}

async function pullIntents(url: URL, env: Env): Promise<Response> {
  const requested = Number(url.searchParams.get('limit') ?? PULL_LIMIT_DEFAULT);
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, PULL_LIMIT_MAX)
      : PULL_LIMIT_DEFAULT;
  // A pull is the desktop's heartbeat: it happens every minute while it runs.
  await db.touchDevice(env.DB, new Date().toISOString());
  return json({ intents: await db.pendingIntents(env.DB, limit) });
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

async function ackIntents(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const acks = parseAcks(await readJson<unknown>(request));
  const changed = await db.ackIntents(env.DB, acks, new Date().toISOString());
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

async function notify(request: Request, env: Env): Promise<Response> {
  const body = await readJson<unknown>(request);
  if (!isRecord(body) || typeof body.text !== 'string' || !body.text.trim()) {
    throw new HttpError(400, 'text is required');
  }
  const text = body.text;
  await Promise.all(allowedIds(env).map((id) => sendMessage(env, id, text)));
  return json({ sent: allowedIds(env).length });
}

// # MINI APP

async function appSnapshot(env: Env): Promise<Response> {
  const failedSince = new Date(Date.now() - FAILED_VISIBLE_MS).toISOString();
  const [snapshot, intents, deviceSeenAt] = await Promise.all([
    db.readSnapshot(env.DB),
    db.openIntents(env.DB, failedSince),
    db.readDeviceSeenAt(env.DB),
  ]);
  return json({ snapshot, intents, deviceSeenAt });
}

async function recordIntent(request: Request, env: Env, tgUserId: number): Promise<Response> {
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
    { id: body.id, type: body.type, payload: body.payload, source: 'miniapp', tgUserId },
    new Date().toISOString(),
  );
  return json(intent, 202);
}

// # ROUTER

const API_PREFIXES = ['/device/', '/app/', '/webhook/'];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  switch (`${request.method} ${url.pathname}`) {
    case 'POST /device/snapshot':
      requireDevice(request, env);
      return pushSnapshot(request, env);
    case 'GET /device/intents':
      requireDevice(request, env);
      return pullIntents(url, env);
    case 'POST /device/intents/ack':
      requireDevice(request, env);
      return ackIntents(request, env, ctx);
    case 'POST /device/notify':
      requireDevice(request, env);
      return notify(request, env);
    case 'GET /app/snapshot':
      await requireTelegramUser(request, env);
      return appSnapshot(env);
    case 'POST /app/intent': {
      const user = await requireTelegramUser(request, env);
      return recordIntent(request, env, user.id);
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
} satisfies ExportedHandler<Env>;
