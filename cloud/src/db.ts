// Every D1 statement lives here. The cloud stores and hands over; it never
// computes anything about the data it holds. Everything a desktop or a phone
// sees is scoped to its account.

export type IntentStatus = 'pending' | 'applied' | 'failed';

interface IntentRow {
  id: string;
  account_id: number;
  type: string;
  payload: string;
  source: string;
  tg_user_id: number;
  first_name: string | null;
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
  /** First name of the Telegram user who recorded it. */
  author: string | null;
}

const toIntent = (row: IntentRow): Intent => ({
  id: row.id,
  type: row.type,
  payload: JSON.parse(row.payload),
  createdAt: row.created_at,
  source: row.source,
  status: row.status,
  reason: row.reason,
  author: row.first_name,
});

// # ACCOUNTS

export type Role = 'owner' | 'member';

export interface Membership {
  account_id: number;
  role: Role;
}

export async function accountBySecretHash(db: D1Database, hash: string): Promise<number | null> {
  const row = await db
    .prepare('SELECT id FROM accounts WHERE secret_hash = ?1')
    .bind(hash)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function memberOf(db: D1Database, tgUserId: number): Promise<Membership | null> {
  return db
    .prepare('SELECT account_id, role FROM account_members WHERE tg_user_id = ?1')
    .bind(tgUserId)
    .first<Membership>();
}

export async function ownerName(db: D1Database, accountId: number): Promise<string | null> {
  const row = await db
    .prepare(`SELECT first_name FROM account_members WHERE account_id = ?1 AND role = 'owner'`)
    .bind(accountId)
    .first<{ first_name: string | null }>();
  return row?.first_name ?? null;
}

export async function memberCount(db: D1Database, accountId: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM account_members WHERE account_id = ?1')
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function removeMember(db: D1Database, tgUserId: number): Promise<void> {
  await db.prepare('DELETE FROM account_members WHERE tg_user_id = ?1').bind(tgUserId).run();
}

/** Snapshot, device, intents, members and codes go with it (ON DELETE CASCADE). */
export async function deleteAccount(db: D1Database, accountId: number): Promise<void> {
  await db.prepare('DELETE FROM accounts WHERE id = ?1').bind(accountId).run();
}

// # CODES

export type CodeKind = 'pair' | 'invite';

interface CodeRow {
  tg_user_id: number;
  account_id: number | null;
  first_name: string | null;
}

/** A new code replaces the user's live one of that kind; expired codes are swept on the way. */
export async function issueCode(
  db: D1Database,
  code: {
    code: string;
    kind: CodeKind;
    tgUserId: number;
    accountId: number | null;
    firstName: string;
  },
  expiresAt: string,
  now: string,
): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM codes WHERE expires_at <= ?1').bind(now),
    db
      .prepare('DELETE FROM codes WHERE tg_user_id = ?1 AND kind = ?2')
      .bind(code.tgUserId, code.kind),
    db
      .prepare(
        `INSERT INTO codes (code, kind, tg_user_id, account_id, first_name, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(code.code, code.kind, code.tgUserId, code.accountId, code.firstName, expiresAt),
  ]);
}

/**
 * Turns a live pair code into the desktop's secret: the owner's account gets
 * the new hash, a user without an account gets a new one. Returns false when
 * the code is unknown, expired, or its user meanwhile joined someone else.
 */
export async function pairDevice(
  db: D1Database,
  code: string,
  secretHash: string,
  now: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT tg_user_id, account_id, first_name FROM codes
       WHERE code = ?1 AND kind = 'pair' AND expires_at > ?2`,
    )
    .bind(code, now)
    .first<CodeRow>();
  if (!row) return false;
  const consume = db.prepare('DELETE FROM codes WHERE code = ?1').bind(code);
  if (row.account_id != null) {
    await db.batch([
      db
        .prepare('UPDATE accounts SET secret_hash = ?1, paired_at = ?2 WHERE id = ?3')
        .bind(secretHash, now, row.account_id),
      consume,
    ]);
    return true;
  }
  if (await memberOf(db, row.tg_user_id)) return false;
  // The new account's id is reached through its unique hash: one transaction, no round trip.
  await db.batch([
    db
      .prepare('INSERT INTO accounts (secret_hash, paired_at) VALUES (?1, ?2)')
      .bind(secretHash, now),
    db
      .prepare(
        `INSERT INTO account_members (tg_user_id, account_id, role, first_name, joined_at)
         SELECT ?1, id, 'owner', ?2, ?3 FROM accounts WHERE secret_hash = ?4`,
      )
      .bind(row.tg_user_id, row.first_name, now, secretHash),
    consume,
  ]);
  return true;
}

/** Joins the invite's account as a member and spends the code; the account id, or null for a dead code. */
export async function joinByInvite(
  db: D1Database,
  code: string,
  user: { tgUserId: number; firstName: string },
  now: string,
): Promise<number | null> {
  const [joined] = await db.batch<{ account_id: number }>([
    db
      .prepare(
        `INSERT INTO account_members (tg_user_id, account_id, role, first_name, joined_at)
         SELECT ?1, account_id, 'member', ?2, ?3 FROM codes
         WHERE code = ?4 AND kind = 'invite' AND expires_at > ?5
         RETURNING account_id`,
      )
      .bind(user.tgUserId, user.firstName, now, code, now),
    db.prepare(`DELETE FROM codes WHERE code = ?1 AND kind = 'invite'`).bind(code),
  ]);
  return joined.results[0]?.account_id ?? null;
}

// # SNAPSHOT

export async function readSnapshot(db: D1Database, accountId: number): Promise<unknown | null> {
  const row = await db
    .prepare('SELECT body FROM snapshot WHERE account_id = ?1')
    .bind(accountId)
    .first<{ body: string }>();
  return row ? JSON.parse(row.body) : null;
}

export async function readSnapshotRevision(db: D1Database, accountId: number): Promise<number> {
  const row = await db
    .prepare('SELECT revision FROM snapshot WHERE account_id = ?1')
    .bind(accountId)
    .first<{ revision: number }>();
  return row?.revision ?? 0;
}

/** Stores the snapshot only when its revision is newer; returns whether it was stored. */
export async function writeSnapshot(
  db: D1Database,
  accountId: number,
  revision: number,
  body: string,
  receivedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO snapshot (account_id, revision, body, received_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (account_id) DO UPDATE
         SET revision = excluded.revision, body = excluded.body, received_at = excluded.received_at
         WHERE excluded.revision > snapshot.revision`,
    )
    .bind(accountId, revision, body, receivedAt)
    .run();
  return result.meta.changes > 0;
}

// # DEVICE

export async function touchDevice(
  db: D1Database,
  accountId: number,
  seenAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO device (account_id, seen_at) VALUES (?1, ?2)
       ON CONFLICT (account_id) DO UPDATE SET seen_at = excluded.seen_at`,
    )
    .bind(accountId, seenAt)
    .run();
}

export async function readDeviceSeenAt(db: D1Database, accountId: number): Promise<string | null> {
  const row = await db
    .prepare('SELECT seen_at FROM device WHERE account_id = ?1')
    .bind(accountId)
    .first<{ seen_at: string }>();
  return row?.seen_at ?? null;
}

// # INTENTS

export async function pendingIntents(
  db: D1Database,
  accountId: number,
  limit: number,
): Promise<Intent[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM intents WHERE account_id = ?1 AND status = 'pending'
       ORDER BY created_at, id LIMIT ?2`,
    )
    .bind(accountId, limit)
    .all<IntentRow>();
  return results.map(toIntent);
}

/**
 * What the Mini App shows on top of the snapshot: everything pending, plus the
 * failures decided since a moment. Decided, not recorded: an intent recorded
 * while the desktop was off for days is refused only when it comes back.
 */
export async function openIntents(
  db: D1Database,
  accountId: number,
  failedSince: string,
): Promise<Intent[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM intents
       WHERE account_id = ?1 AND (status = 'pending' OR (status = 'failed' AND acked_at >= ?2))
       ORDER BY created_at, id`,
    )
    .bind(accountId, failedSince)
    .all<IntentRow>();
  return results.map(toIntent);
}

/** Idempotent by id: a repeat returns the row recorded the first time. */
export async function insertIntent(
  db: D1Database,
  intent: {
    id: string;
    accountId: number;
    type: string;
    payload: unknown;
    source: string;
    tgUserId: number;
    firstName: string;
  },
  createdAt: string,
): Promise<Intent | null> {
  const row = await db
    .prepare(
      `INSERT INTO intents (id, account_id, type, payload, source, tg_user_id, first_name, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
    )
    .bind(
      intent.id,
      intent.accountId,
      intent.type,
      JSON.stringify(intent.payload),
      intent.source,
      intent.tgUserId,
      intent.firstName,
      createdAt,
    )
    .first<IntentRow>();
  const stored =
    row ??
    (await db
      .prepare('SELECT * FROM intents WHERE id = ?1 AND account_id = ?2')
      .bind(intent.id, intent.accountId)
      .first<IntentRow>());
  return stored ? toIntent(stored) : null;
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

/** Marks the account's pending intents by the desktop's verdict; returns the rows that changed. */
export async function ackIntents(
  db: D1Database,
  accountId: number,
  acks: Ack[],
  ackedAt: string,
): Promise<Array<Pick<IntentRow, 'id' | 'type' | 'tg_user_id' | 'status' | 'reason'>>> {
  if (acks.length === 0) return [];
  const statement = db.prepare(
    `UPDATE intents SET status = ?2, reason = ?3, acked_at = ?4
     WHERE id = ?1 AND account_id = ?5 AND status = 'pending'
     RETURNING id, type, tg_user_id, status, reason`,
  );
  const results = await db.batch<
    Pick<IntentRow, 'id' | 'type' | 'tg_user_id' | 'status' | 'reason'>
  >(acks.map((ack) => statement.bind(ack.id, ack.status, ack.reason ?? null, ackedAt, accountId)));
  return results.flatMap((r) => r.results);
}
