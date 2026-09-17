// Every D1 statement lives here. The cloud stores and hands over; it never
// computes anything about the data it holds.

export type IntentStatus = 'pending' | 'applied' | 'failed';

interface IntentRow {
  id: string;
  type: string;
  payload: string;
  source: string;
  tg_user_id: number;
  created_at: string;
  status: IntentStatus;
  reason: string | null;
}

/** The envelope main/sync/intents.js applies: { id, type, payload, createdAt, source }. */
export interface Intent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  source: string;
  status: IntentStatus;
  reason: string | null;
}

const toIntent = (row: IntentRow): Intent => ({
  id: row.id,
  type: row.type,
  payload: JSON.parse(row.payload),
  createdAt: row.created_at,
  source: row.source,
  status: row.status,
  reason: row.reason,
});

// # SNAPSHOT

export async function readSnapshot(db: D1Database): Promise<unknown | null> {
  const row = await db.prepare('SELECT body FROM snapshot WHERE id = 1').first<{ body: string }>();
  return row ? JSON.parse(row.body) : null;
}

export async function readSnapshotRevision(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT revision FROM snapshot WHERE id = 1')
    .first<{ revision: number }>();
  return row?.revision ?? 0;
}

/** Stores the snapshot only when its revision is newer; returns whether it was stored. */
export async function writeSnapshot(
  db: D1Database,
  revision: number,
  body: string,
  receivedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO snapshot (id, revision, body, received_at) VALUES (1, ?1, ?2, ?3)
       ON CONFLICT (id) DO UPDATE
         SET revision = excluded.revision, body = excluded.body, received_at = excluded.received_at
         WHERE excluded.revision > snapshot.revision`,
    )
    .bind(revision, body, receivedAt)
    .run();
  return result.meta.changes > 0;
}

// # DEVICE

export async function touchDevice(db: D1Database, seenAt: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO device (id, seen_at) VALUES (1, ?1)
       ON CONFLICT (id) DO UPDATE SET seen_at = excluded.seen_at`,
    )
    .bind(seenAt)
    .run();
}

export async function readDeviceSeenAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT seen_at FROM device WHERE id = 1')
    .first<{ seen_at: string }>();
  return row?.seen_at ?? null;
}

// # INTENTS

export async function pendingIntents(db: D1Database, limit: number): Promise<Intent[]> {
  const { results } = await db
    .prepare(`SELECT * FROM intents WHERE status = 'pending' ORDER BY created_at, id LIMIT ?1`)
    .bind(limit)
    .all<IntentRow>();
  return results.map(toIntent);
}

/**
 * What the Mini App shows on top of the snapshot: everything pending, plus the
 * failures decided since a moment. Decided, not recorded: an intent recorded
 * while the desktop was off for days is refused only when it comes back.
 */
export async function openIntents(db: D1Database, failedSince: string): Promise<Intent[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM intents
       WHERE status = 'pending' OR (status = 'failed' AND acked_at >= ?1)
       ORDER BY created_at, id`,
    )
    .bind(failedSince)
    .all<IntentRow>();
  return results.map(toIntent);
}

/** Idempotent by id: a repeat returns the row recorded the first time. */
export async function insertIntent(
  db: D1Database,
  intent: { id: string; type: string; payload: unknown; source: string; tgUserId: number },
  createdAt: string,
): Promise<Intent> {
  const row = await db
    .prepare(
      `INSERT INTO intents (id, type, payload, source, tg_user_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
    )
    .bind(
      intent.id,
      intent.type,
      JSON.stringify(intent.payload),
      intent.source,
      intent.tgUserId,
      createdAt,
    )
    .first<IntentRow>();
  const stored =
    row ??
    (await db.prepare('SELECT * FROM intents WHERE id = ?1').bind(intent.id).first<IntentRow>());
  if (!stored) throw new Error(`Intent ${intent.id} vanished after insert`);
  return toIntent(stored);
}

/** Drops applied and failed intents decided before the cutoff; returns how many. */
export async function deleteDecidedIntentsBefore(db: D1Database, cutoff: string): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM intents WHERE status != 'pending' AND acked_at < ?1`)
    .bind(cutoff)
    .run();
  return result.meta.changes;
}

export interface Ack {
  id: string;
  status: Exclude<IntentStatus, 'pending'>;
  reason?: string | null;
}

/** Marks pending intents by the desktop's verdict; returns the rows that changed. */
export async function ackIntents(
  db: D1Database,
  acks: Ack[],
  ackedAt: string,
): Promise<Array<Pick<IntentRow, 'id' | 'type' | 'tg_user_id' | 'status' | 'reason'>>> {
  if (acks.length === 0) return [];
  const statement = db.prepare(
    `UPDATE intents SET status = ?2, reason = ?3, acked_at = ?4
     WHERE id = ?1 AND status = 'pending'
     RETURNING id, type, tg_user_id, status, reason`,
  );
  const results = await db.batch<
    Pick<IntentRow, 'id' | 'type' | 'tg_user_id' | 'status' | 'reason'>
  >(acks.map((ack) => statement.bind(ack.id, ack.status, ack.reason ?? null, ackedAt)));
  return results.flatMap((r) => r.results);
}
