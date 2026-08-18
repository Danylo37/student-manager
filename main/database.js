const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { LESSON_DURATION_MINUTES } = require('./constants');
const logger = require('./logger');

let db = null;

// # INIT & MIGRATION

function initDatabase() {
  logger.info('Initializing database');

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'students.db');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  let schemaPath;
  if (process.env.NODE_ENV === 'development') {
    schemaPath = path.join(__dirname, 'db', 'schema.sql');
  } else {
    schemaPath = path.join(process.resourcesPath, 'main', 'db', 'schema.sql');
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Run migration if this is an existing (pre-v2) database
    if (needsMigrationV2()) {
      runMigrationV2();
    }

    // CREATE TABLE IF NOT EXISTS leaves older tables untouched, so columns
    // added after a table first shipped have to be filled in separately.
    addMissingColumns();
    backfillBalanceHistory();

    logger.info('Database initialized successfully');
    return db;
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }
}

/**
 * Add columns that were introduced after a table already existed in the wild.
 * Each entry is applied only when the column is missing, so this is a no-op
 * on a freshly created database.
 */
function addMissingColumns() {
  const additions = [
    ['tax_settings', 'single_tax_enabled', 'INTEGER DEFAULT 0'],
    ['tax_settings', 'single_tax_rate', 'REAL DEFAULT 5.0'],
    // Payments made before paid_at existed happened when they were recorded.
    ['payment_bundles', 'paid_at', 'DATETIME', 'UPDATE payment_bundles SET paid_at = created_at'],
  ];

  for (const [table, column, definition, backfill] of additions) {
    try {
      const cols = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      if (cols.length === 0 || cols.includes(column)) continue;

      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      if (backfill) db.exec(backfill);
      logger.info(`Added column ${table}.${column}`);
    } catch (error) {
      logger.error(`Failed to add column ${table}.${column}`, { error: error.message });
    }
  }
}

/**
 * Balance history shipped after payment bundles, so an existing install has no
 * rows for payments it already recorded. Bundles hold the same facts (student,
 * lessons, money), so seed the history from them once.
 */
function backfillBalanceHistory() {
  try {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM balance_history').get();
    if (count > 0) return;

    const inserted = db
      .prepare(
        `
      INSERT INTO balance_history (student_id, student_name_cache, lessons, amount, created_at)
      SELECT b.student_id, s.name, b.lessons_count, b.total_price, b.created_at
      FROM payment_bundles b
      LEFT JOIN students s ON s.id = b.student_id
    `,
      )
      .run().changes;

    if (inserted > 0) logger.info('Balance history backfilled from payment bundles', { inserted });
  } catch (error) {
    logger.error('Balance history backfill failed', { error: error.message });
  }
}

/** Detect pre-v2 schema: lessons table lacks student_name_cache column */
function needsMigrationV2() {
  try {
    const cols = db
      .prepare('PRAGMA table_info(lessons)')
      .all()
      .map((c) => c.name);
    return !cols.includes('student_name_cache');
  } catch {
    return false;
  }
}

function runMigrationV2() {
  logger.info('Running database migration to v2');

  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(migrateV2Steps)();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  logger.info('Migration v2 complete');
}

function migrateV2Steps() {
  // Leftovers from an interrupted earlier attempt would collide with the
  // CREATE statements below.
  db.exec(`
    DROP TABLE IF EXISTS lessons_v2;
    DROP TABLE IF EXISTS tax_settings_v2;
  `);

  // 1. Ensure payment_bundles table exists (needed before recreating lessons)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_bundles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    INTEGER,
      total_price   INTEGER NOT NULL,
      lessons_count INTEGER NOT NULL,
      lessons_used  INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bundles_student ON payment_bundles (student_id, created_at);
  `);

  // 2. Recreate lessons table: nullable student_id, student_name_cache, price in kopiyky,
  //    payment_bundle_id. Copy data, convert price hryvnias→kopiyky.
  //    The pre-finance schema had no price column at all, so it is selected only
  //    when it is actually there.
  const lessonCols = db
    .prepare('PRAGMA table_info(lessons)')
    .all()
    .map((c) => c.name);
  const priceExpr = lessonCols.includes('price')
    ? 'CASE WHEN l.price IS NOT NULL THEN CAST(ROUND(l.price * 100) AS INTEGER) ELSE NULL END'
    : 'NULL';

  db.exec(`
    CREATE TABLE lessons_v2 (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id          INTEGER,
      student_name_cache  TEXT,
      datetime            TEXT    NOT NULL,
      previous_datetime   TEXT,
      is_completed        BOOLEAN  DEFAULT 0,
      is_paid             BOOLEAN  DEFAULT 0,
      price               INTEGER  DEFAULT NULL,
      payment_bundle_id   INTEGER,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL,
      FOREIGN KEY (payment_bundle_id) REFERENCES payment_bundles (id) ON DELETE SET NULL
    );

    INSERT INTO lessons_v2
      (id, student_id, student_name_cache, datetime, previous_datetime,
       is_completed, is_paid, price, created_at)
    SELECT
      l.id,
      l.student_id,
      s.name,
      l.datetime,
      l.previous_datetime,
      l.is_completed,
      l.is_paid,
      ${priceExpr},
      l.created_at
    FROM lessons l
    LEFT JOIN students s ON s.id = l.student_id;

    DROP TABLE lessons;
    ALTER TABLE lessons_v2 RENAME TO lessons;
    CREATE INDEX IF NOT EXISTS idx_lessons_datetime ON lessons (datetime);
    CREATE INDEX IF NOT EXISTS idx_lessons_student  ON lessons (student_id);
  `);

  // 3. Convert lesson_prices.price hryvnias→kopiyky
  try {
    db.exec(
      `UPDATE lesson_prices SET price = CAST(ROUND(price * 100) AS INTEGER) WHERE price < 100000`,
    );
  } catch (_) {}

  // 4. Convert discounts.total_price hryvnias→kopiyky
  try {
    db.exec(
      `UPDATE discounts SET total_price = CAST(ROUND(total_price * 100) AS INTEGER) WHERE total_price < 1000000`,
    );
  } catch (_) {}

  // 5. Recreate tax_settings: simplified schema, convert esv_fixed hryvnias→kopiyky
  db.exec(`
    CREATE TABLE tax_settings_v2 (
      id                   INTEGER PRIMARY KEY DEFAULT 1,
      esv_type             TEXT    DEFAULT 'none',
      esv_fixed            INTEGER DEFAULT 0,
      single_tax_enabled   INTEGER DEFAULT 0,
      single_tax_rate      REAL    DEFAULT 5.0,
      military_tax_enabled INTEGER DEFAULT 0,
      military_tax_rate    REAL    DEFAULT 1.0,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const oldTax = db.prepare('SELECT * FROM tax_settings WHERE id = 1').get();
  if (oldTax) {
    db.prepare(
      `
      INSERT OR IGNORE INTO tax_settings_v2
        (id, esv_type, esv_fixed, military_tax_enabled, military_tax_rate)
      VALUES (1, ?, ?, ?, ?)
    `,
    ).run(
      oldTax.esv_type || 'none',
      oldTax.esv_fixed ? Math.round(oldTax.esv_fixed * 100) : 0,
      oldTax.military_tax_enabled || 0,
      oldTax.military_tax_rate != null ? oldTax.military_tax_rate : 1.0,
    );
  } else {
    db.prepare('INSERT OR IGNORE INTO tax_settings_v2 (id) VALUES (1)').run();
  }

  db.exec(`
    DROP TABLE IF EXISTS tax_settings;
    ALTER TABLE tax_settings_v2 RENAME TO tax_settings;
  `);

  // 6. Add deleted_lesson_slots if missing (legacy)
  db.exec(`
    CREATE TABLE IF NOT EXISTS deleted_lesson_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      datetime   TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_deleted_slots_student
      ON deleted_lesson_slots (student_id, datetime);
  `);
}

// # STUDENTS

function getStudents() {
  return db
    .prepare(
      `
    SELECT
      s.*,
      COUNT(CASE WHEN l.is_completed = 1 THEN 1 END) AS completed_lessons_count,
      (SELECT lp.price FROM lesson_prices lp
       WHERE lp.student_id = s.id ORDER BY lp.valid_from DESC LIMIT 1) AS current_price
    FROM students s
    LEFT JOIN lessons l ON s.id = l.student_id
    GROUP BY s.id
    ORDER BY s.name
  `,
    )
    .all();
}

function addStudent(name, balance, priceKopiyky = null) {
  const result = db
    .prepare('INSERT INTO students (name, balance) VALUES (?, ?)')
    .run(name, balance);
  const studentId = result.lastInsertRowid;
  if (priceKopiyky !== null && priceKopiyky > 0) {
    setStudentPrice(studentId, priceKopiyky);
  }
  return { id: studentId, name, balance };
}

/**
 * Delete a student.
 * Completed lessons are preserved (student_id set to NULL, name cached).
 * Incomplete lessons are deleted.
 */
function deleteStudent(studentId) {
  // Preserve completed lessons
  db.prepare(
    `
    UPDATE lessons SET student_id = NULL
    WHERE student_id = ? AND is_completed = 1
  `,
  ).run(studentId);

  // Delete incomplete lessons
  db.prepare(`DELETE FROM lessons WHERE student_id = ? AND is_completed = 0`).run(studentId);

  // Delete student (cascades schedules, lesson_prices, discounts, bundles, deleted_slots)
  db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
  logger.info('Student deleted', { studentId });
}

function updateStudentBalance(studentId, amount) {
  db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?').run(amount, studentId);
}

function getUnpaidCompletedLessons(studentId) {
  return db
    .prepare(
      `
    SELECT id, datetime, price, payment_bundle_id FROM lessons
    WHERE student_id = ? AND is_completed = 1 AND is_paid = 0
    ORDER BY datetime ASC
  `,
    )
    .all(studentId);
}

/**
 * Close the oldest unpaid lessons with a payment that has just been recorded.
 * Each one takes its slot in the bundle it is paid from, so the advance left on
 * that payment stays correct.
 */
function markOldestUnpaidLessonsAsPaid(studentId, count) {
  if (count <= 0) return;
  const lessons = getUnpaidCompletedLessons(studentId).slice(0, count);
  const stmt = db.prepare(
    'UPDATE lessons SET is_paid = 1, price = ?, payment_bundle_id = ? WHERE id = ?',
  );
  for (const l of lessons) {
    if (l.payment_bundle_id) {
      db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?').run(l.id);
      continue;
    }
    const { price, bundleId } = resolveLessonPrice(studentId, l.datetime);
    stmt.run(price ?? l.price, bundleId, l.id);
  }
}

// # LESSON PRICES  (all values in kopiyky)

function setStudentPrice(studentId, priceKopiyky) {
  return db
    .prepare(
      `
    INSERT INTO lesson_prices (student_id, price, valid_from)
    VALUES (?, ?, datetime('now'))
  `,
    )
    .run(studentId, priceKopiyky);
}

function getStudentCurrentPrice(studentId) {
  return (
    db
      .prepare(
        `
    SELECT * FROM lesson_prices WHERE student_id = ?
    ORDER BY valid_from DESC LIMIT 1
  `,
      )
      .get(studentId) || null
  );
}

function getStudentPriceAt(studentId, datetime) {
  const row = db
    .prepare(
      `
    SELECT price FROM lesson_prices
    WHERE student_id = ? AND valid_from <= ?
    ORDER BY valid_from DESC LIMIT 1
  `,
    )
    .get(studentId, datetime);
  return row ? row.price : null;
}

function getStudentPriceHistory(studentId) {
  return db
    .prepare(
      `
    SELECT * FROM lesson_prices WHERE student_id = ?
    ORDER BY valid_from DESC
  `,
    )
    .all(studentId);
}

function deleteStudentPrice(priceId) {
  db.prepare('DELETE FROM lesson_prices WHERE id = ?').run(priceId);
}

// # PAYMENT BUNDLES

/**
 * Create a payment bundle when teacher records a payment.
 * Called automatically from updateBalance / payForLessons.
 *
 * Bundles are the cash ledger, so every payment has to end up here: taxes are
 * calculated on money received, not on lessons given.
 *
 * @param {number} studentId
 * @param {number} count     - lessons purchased; negative for a refund
 * @param {number|null} totalPriceKopiyky - if null, computed from current price
 * @param {string|null} paidAt - when the money arrived (default: now)
 * @returns {{id: number, total: number}|null} the bundle, or null if no price info
 */
function createPaymentBundle(studentId, count, totalPriceKopiyky = null, paidAt = null) {
  if (count === 0) return null;

  const lessons = Math.abs(count);
  let total = totalPriceKopiyky;

  if (total === null) {
    // Try applicable discount first
    const discount = findApplicableDiscount(studentId, lessons);
    if (discount) {
      total = discount.total_price;
    } else {
      // Fall back to current price × count
      const priceRecord = getStudentCurrentPrice(studentId);
      if (priceRecord) {
        total = priceRecord.price * lessons;
      }
    }
  }

  if (total === null) return null; // no price info → no bundle

  // A refund is stored as a negative bundle: it lowers the cash of its period
  // and is never consumed by a lesson.
  const sign = count < 0 ? -1 : 1;

  const result = db
    .prepare(
      `
    INSERT INTO payment_bundles (student_id, total_price, lessons_count, paid_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')))
  `,
    )
    .run(studentId, sign * Math.abs(total), sign * lessons, paidAt);

  logger.info('Payment bundle created', {
    studentId,
    count,
    total: sign * Math.abs(total),
    bundleId: result.lastInsertRowid,
  });
  return { id: result.lastInsertRowid, total: sign * Math.abs(total) };
}

/**
 * Consume one lesson from the oldest active bundle for a student.
 * Returns { price (kopiyky), bundleId } or null if no bundle available.
 * Uses integer arithmetic to distribute total_price exactly:
 *   - each lesson gets floor(total / count)
 *   - the last lesson gets the remainder so sum == total exactly
 */
function consumeFromBundle(studentId) {
  const bundle = db
    .prepare(
      `
    SELECT * FROM payment_bundles
    WHERE student_id = ? AND lessons_count > 0 AND lessons_used < lessons_count
    ORDER BY COALESCE(paid_at, created_at) ASC, id ASC LIMIT 1
  `,
    )
    .get(studentId);

  if (!bundle) return null;

  const base = Math.floor(bundle.total_price / bundle.lessons_count);
  const isLast = bundle.lessons_used + 1 === bundle.lessons_count;
  const price = isLast
    ? bundle.total_price - base * bundle.lessons_used // remainder for exact total
    : base;

  db.prepare('UPDATE payment_bundles SET lessons_used = lessons_used + 1 WHERE id = ?').run(
    bundle.id,
  );

  return { price, bundleId: bundle.id };
}

/**
 * Price to record on a lesson that is being completed.
 * Prefers a prepaid bundle so package deals stay exact, otherwise falls back to
 * the price that was in effect at the lesson's date.
 * @returns {{price: number|null, bundleId: number|null}}
 */
function resolveLessonPrice(studentId, datetime) {
  if (!studentId) return { price: null, bundleId: null };

  const bundle = consumeFromBundle(studentId);
  if (bundle) return { price: bundle.price, bundleId: bundle.bundleId };

  return { price: getStudentPriceAt(studentId, datetime), bundleId: null };
}

/**
 * Return one lesson to its bundle (called when a completed lesson is deleted).
 */
function returnLessonToBundle(bundleId) {
  if (!bundleId) return;
  db.prepare('UPDATE payment_bundles SET lessons_used = MAX(0, lessons_used - 1) WHERE id = ?').run(
    bundleId,
  );
}

// # BALANCE HISTORY

/**
 * Log a payment or balance correction made by the teacher. Only called from the
 * IPC layer: the -1 per completed lesson is bookkeeping, not something the
 * teacher did, and would flood the history.
 * @param {number} studentId
 * @param {number} lessons  - signed (+N paid for, -N removed)
 * @param {number|null} amountKopiyky - what it was worth, null if no price is known
 */
function recordBalanceChange(studentId, lessons, amountKopiyky = null) {
  if (!studentId || !lessons) return;

  const student = db.prepare('SELECT name FROM students WHERE id = ?').get(studentId);

  db.prepare(
    `
    INSERT INTO balance_history (student_id, student_name_cache, lessons, amount)
    VALUES (?, ?, ?, ?)
  `,
  ).run(studentId, student ? student.name : null, lessons, amountKopiyky ?? null);
}

/**
 * Balance changes inside a period, newest first.
 * created_at is stored as UTC without a timezone marker, so both the comparison
 * and the returned value are normalised to make it unambiguous.
 */
function getBalanceHistory(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      h.id,
      h.student_id,
      COALESCE(s.name, h.student_name_cache, 'Видалений учень') AS student_name,
      h.lessons,
      h.amount,
      strftime('%Y-%m-%dT%H:%M:%SZ', h.created_at)             AS created_at
    FROM balance_history h
    LEFT JOIN students s ON s.id = h.student_id
    WHERE datetime(h.created_at) >= datetime(?) AND datetime(h.created_at) < datetime(?)
    ORDER BY h.created_at DESC, h.id DESC
  `,
    )
    .all(startDate, endDate);
}

// # DISCOUNTS  (total_price in kopiyky)

function getDiscounts(studentId) {
  return db
    .prepare(
      `
    SELECT * FROM discounts
    WHERE student_id = ? OR student_id IS NULL
    ORDER BY CASE WHEN student_id IS NULL THEN 1 ELSE 0 END ASC, lessons_count ASC
  `,
    )
    .all(studentId);
}

function getGlobalDiscounts() {
  return db
    .prepare(`SELECT * FROM discounts WHERE student_id IS NULL ORDER BY lessons_count ASC`)
    .all();
}

function addDiscount(studentId, lessonsCount, totalPriceKopiyky, description) {
  const result = db
    .prepare(
      `
    INSERT INTO discounts (student_id, lessons_count, total_price, description)
    VALUES (?, ?, ?, ?)
  `,
    )
    .run(studentId ?? null, lessonsCount, totalPriceKopiyky, description ?? null);
  return { id: result.lastInsertRowid };
}

function deleteDiscount(discountId) {
  db.prepare('DELETE FROM discounts WHERE id = ?').run(discountId);
}

function toggleDiscountActive(discountId) {
  db.prepare('UPDATE discounts SET is_active = NOT is_active WHERE id = ?').run(discountId);
}

function findApplicableDiscount(studentId, count) {
  return (
    db
      .prepare(
        `
    SELECT * FROM discounts
    WHERE (student_id = ? OR student_id IS NULL) AND is_active = 1 AND lessons_count = ?
    ORDER BY CASE WHEN student_id IS NULL THEN 1 ELSE 0 END ASC LIMIT 1
  `,
      )
      .get(studentId, count) || null
  );
}

// # TAX SETTINGS

function getTaxSettings() {
  db.prepare('INSERT OR IGNORE INTO tax_settings (id) VALUES (1)').run();
  return db.prepare('SELECT * FROM tax_settings WHERE id = 1').get();
}

function saveTaxSettings(s) {
  db.prepare(
    `
    UPDATE tax_settings SET
      esv_type             = ?,
      esv_fixed            = ?,
      single_tax_enabled   = ?,
      single_tax_rate      = ?,
      military_tax_enabled = ?,
      military_tax_rate    = ?,
      updated_at           = datetime('now')
    WHERE id = 1
  `,
  ).run(
    s.esv_type,
    s.esv_fixed,
    s.single_tax_enabled ? 1 : 0,
    s.single_tax_rate,
    s.military_tax_enabled ? 1 : 0,
    s.military_tax_rate,
  );
}

// # FINANCIAL STATS
//
// Two views of the same money, and they legitimately differ inside a period:
//  - CASH     — what was paid (payment_bundles by paid_at). This is the tax base:
//               a ФОП declares income on the date the money arrives, so a month
//               paid upfront in June belongs to Q2 even if the lessons are in Q3.
//  - EARNED   — what was worked off (lessons by datetime). Shows real load.
// cash = earned + change in unearned advances (see getUnearnedTotal).

/** A lesson counts as earned once it is completed, paid and has a price. */
const IS_INCOME = (t = '') => `${t}is_completed = 1 AND ${t}is_paid = 1 AND ${t}price IS NOT NULL`;

/** Payment date, falling back to the row's creation for pre-paid_at bundles. */
const PAID_AT = (t = '') => `datetime(COALESCE(${t}paid_at, ${t}created_at))`;

function getCashStats(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      COALESCE(SUM(total_price), 0)   AS total,
      COALESCE(SUM(lessons_count), 0) AS lessons,
      COUNT(*)                        AS payments
    FROM payment_bundles
    WHERE ${PAID_AT()} >= datetime(?) AND ${PAID_AT()} < datetime(?)
  `,
    )
    .get(startDate, endDate);
}

function getCashByDay(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      DATE(COALESCE(paid_at, created_at)) AS day,
      SUM(total_price)                    AS total,
      SUM(lessons_count)                  AS count
    FROM payment_bundles
    WHERE ${PAID_AT()} >= datetime(?) AND ${PAID_AT()} < datetime(?)
    GROUP BY day
    HAVING SUM(total_price) <> 0 OR SUM(lessons_count) <> 0
    ORDER BY day ASC
  `,
    )
    .all(startDate, endDate);
}

function getCashByStudent(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      COALESCE(s.id, -1)                              AS student_id,
      COALESCE(s.name, 'Видалений учень')             AS student_name,
      SUM(b.total_price)                              AS total,
      SUM(b.lessons_count)                            AS count
    FROM payment_bundles b
    LEFT JOIN students s ON s.id = b.student_id
    WHERE ${PAID_AT('b.')} >= datetime(?) AND ${PAID_AT('b.')} < datetime(?)
    GROUP BY COALESCE(s.id, -1)
    HAVING SUM(b.total_price) <> 0 OR SUM(b.lessons_count) <> 0
    ORDER BY total DESC
  `,
    )
    .all(startDate, endDate);
}

/**
 * Advances still owed as lessons at a moment in time: money already received
 * minus the part of it already worked off. This is the bridge between the two
 * views — cash of a period equals earned plus the change in this number.
 * @param {string} asOf - ISO moment (exclusive)
 */
function getUnearnedTotal(asOf) {
  const { unearned } = db
    .prepare(
      `
    SELECT
      (SELECT COALESCE(SUM(total_price), 0) FROM payment_bundles
        WHERE ${PAID_AT()} < datetime(?))
      -
      (SELECT COALESCE(SUM(price), 0) FROM lessons
        WHERE payment_bundle_id IS NOT NULL AND price IS NOT NULL AND datetime < ?)
      AS unearned
  `,
    )
    .get(asOf, asOf);
  return unearned;
}

function getEarningsStats(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE WHEN is_paid = 1 THEN price END), 0) AS total,
      COUNT(CASE WHEN price IS NOT NULL THEN 1 END)          AS lessons_with_price,
      COUNT(CASE WHEN ${IS_INCOME()} THEN 1 END)             AS lessons_paid,
      COUNT(*)                                               AS lessons_total
    FROM lessons
    WHERE is_completed = 1 AND datetime >= ? AND datetime < ?
  `,
    )
    .get(startDate, endDate);
}

function getEarningsByDay(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT DATE(datetime) AS day, SUM(price) AS total, COUNT(*) AS count
    FROM lessons
    WHERE ${IS_INCOME()} AND datetime >= ? AND datetime < ?
    GROUP BY DATE(datetime)
    ORDER BY day ASC
  `,
    )
    .all(startDate, endDate);
}

function getEarningsByStudent(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      COALESCE(s.id, -1)                           AS student_id,
      COALESCE(s.name, l.student_name_cache, '?')  AS student_name,
      SUM(l.price)                                 AS total,
      COUNT(*)                                     AS count
    FROM lessons l
    LEFT JOIN students s ON s.id = l.student_id
    WHERE ${IS_INCOME('l.')} AND l.datetime >= ? AND l.datetime < ?
    GROUP BY COALESCE(s.id, -1)
    ORDER BY total DESC
  `,
    )
    .all(startDate, endDate);
}

/**
 * First and last income, plus how many months actually had income.
 *
 * `min_date` is the moment the user really started using the finance features:
 * the earlier of the first recorded payment and the first paid lesson with a
 * price. Fixed monthly taxes (ЄСВ) are charged from that month onwards —
 * including months without lessons, as a real ФОП pays — but never before it,
 * so an existing install stays at zero tax until finances are actually used.
 */
function getEarningsDateRange() {
  const row = db
    .prepare(
      `
    SELECT
      MIN(datetime)                                AS min_date,
      MAX(datetime)                                AS max_date,
      COUNT(DISTINCT strftime('%Y-%m', datetime))  AS months_count
    FROM lessons
    WHERE ${IS_INCOME()}
  `,
    )
    .get();

  const { first_payment, last_payment } = db
    .prepare(
      `
    SELECT MIN(COALESCE(paid_at, created_at)) AS first_payment,
           MAX(COALESCE(paid_at, created_at)) AS last_payment
    FROM payment_bundles WHERE total_price > 0
  `,
    )
    .get();

  const earliest = [row.min_date, first_payment].filter(Boolean).sort()[0] ?? null;
  const latest = [row.max_date, last_payment].filter(Boolean).sort().pop() ?? null;

  return { ...row, min_date: earliest, max_date: latest };
}

// # LESSONS

function getLessons(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      l.*,
      COALESCE(s.name, l.student_name_cache, 'Видалений учень') AS student_name,
      COALESCE(s.balance, 0) AS balance,
      (SELECT lp.price FROM lesson_prices lp
       WHERE lp.student_id = l.student_id
       ORDER BY lp.valid_from DESC LIMIT 1) AS student_current_price
    FROM lessons l
    LEFT JOIN students s ON s.id = l.student_id
    WHERE l.datetime >= ? AND l.datetime < ?
    ORDER BY l.datetime
  `,
    )
    .all(startDate, endDate);
}

function addLesson(studentId, datetime, isPaid, isCompleted) {
  // Get student name for cache
  const student = studentId
    ? db.prepare('SELECT name FROM students WHERE id = ?').get(studentId)
    : null;
  const studentNameCache = student ? student.name : null;

  const { price, bundleId } =
    isCompleted && studentId
      ? resolveLessonPrice(studentId, datetime)
      : { price: null, bundleId: null };

  const result = db
    .prepare(
      `
    INSERT INTO lessons
      (student_id, student_name_cache, datetime, is_paid, is_completed, price, payment_bundle_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      studentId,
      studentNameCache,
      datetime,
      isPaid ? 1 : 0,
      isCompleted ? 1 : 0,
      price,
      bundleId,
    );

  if (isCompleted && studentId) {
    updateStudentBalance(studentId, -1);
  }

  return { id: result.lastInsertRowid };
}

function updateLesson(lessonId, updates) {
  const current = db
    .prepare(
      `
    SELECT l.*, s.balance FROM lessons l
    LEFT JOIN students s ON l.student_id = s.id
    WHERE l.id = ?
  `,
    )
    .get(lessonId);

  if (!current) return;

  const fields = [];
  const values = [];

  if (updates.is_completed !== undefined) {
    fields.push('is_completed = ?');
    values.push(updates.is_completed ? 1 : 0);

    // Snapshot price when marking completed for the first time
    if (
      updates.is_completed &&
      !current.is_completed &&
      current.price === null &&
      current.student_id
    ) {
      const { price, bundleId } = resolveLessonPrice(current.student_id, current.datetime);
      if (price !== null) {
        fields.push('price = ?');
        values.push(price);
      }
      if (bundleId !== null) {
        fields.push('payment_bundle_id = ?');
        values.push(bundleId);
      }
    }
  }

  if (updates.is_paid !== undefined) {
    fields.push('is_paid = ?');
    values.push(updates.is_paid ? 1 : 0);
    const noBalance = current.balance <= 0 && updates.is_completed;
    if (updates.is_paid || noBalance) updateStudentBalance(current.student_id, -1);
    else updateStudentBalance(current.student_id, 1);
  }

  if (updates.datetime !== undefined) {
    if (!current.previous_datetime) {
      fields.push('previous_datetime = ?');
      values.push(current.datetime);
    }
    fields.push('datetime = ?');
    values.push(updates.datetime);
  }

  if (fields.length === 0) return;
  values.push(lessonId);
  db.prepare(`UPDATE lessons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function toggleLessonPayment(lessonId) {
  const lesson = db
    .prepare(
      `
    SELECT l.*, s.balance FROM lessons l
    LEFT JOIN students s ON l.student_id = s.id WHERE l.id = ?
  `,
    )
    .get(lessonId);
  if (!lesson || !lesson.is_completed) throw new Error('Lesson not found or not completed');

  // Money arrives now, so it needs its own row in the cash ledger. The lesson is
  // attached to it right away — it is exactly what that payment bought.
  let price = lesson.price;
  let bundleId = lesson.payment_bundle_id;
  if (lesson.student_id && !bundleId) {
    if (price === null) price = getStudentPriceAt(lesson.student_id, lesson.datetime);
    const bundle = createPaymentBundle(lesson.student_id, 1, price);
    if (bundle) {
      bundleId = bundle.id;
      price = bundle.total;
      db.prepare('UPDATE payment_bundles SET lessons_used = 1 WHERE id = ?').run(bundleId);
    }
  }

  db.prepare('UPDATE lessons SET is_paid = 1, price = ?, payment_bundle_id = ? WHERE id = ?').run(
    price,
    bundleId,
    lessonId,
  );
  if (lesson.balance < 0 && lesson.student_id) updateStudentBalance(lesson.student_id, 1);
  return { studentId: lesson.student_id, price };
}

function deleteLesson(lessonId) {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) return;

  db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);

  if (lesson.is_completed) {
    // Restore balance
    if (lesson.student_id) updateStudentBalance(lesson.student_id, 1);
    // Return lesson to its payment bundle
    if (lesson.payment_bundle_id) returnLessonToBundle(lesson.payment_bundle_id);
  }

  // Record deleted slot to prevent auto-recreation
  if (lesson.student_id) {
    db.prepare(
      `INSERT OR IGNORE INTO deleted_lesson_slots (student_id, datetime) VALUES (?, ?)`,
    ).run(lesson.student_id, lesson.datetime);
  }
}

function cleanupExpiredDeletedSlots() {
  const threshold = new Date(Date.now() - LESSON_DURATION_MINUTES * 60 * 1000).toISOString();
  return db.prepare('DELETE FROM deleted_lesson_slots WHERE datetime < ?').run(threshold).changes;
}

// # AUTO SYNC

function syncCompletedLessons() {
  cleanupExpiredDeletedSlots();

  const threshold = new Date(Date.now() - LESSON_DURATION_MINUTES * 60 * 1000).toISOString();

  const sync = db.transaction(() => {
    const lessons = db
      .prepare(
        `
      SELECT l.id, l.student_id, l.datetime, l.price, s.balance
      FROM lessons l
      LEFT JOIN students s ON l.student_id = s.id
      WHERE l.datetime < ? AND l.is_completed = 0 AND l.student_id IS NOT NULL
      ORDER BY l.datetime ASC
    `,
      )
      .all(threshold);

    if (lessons.length === 0) return 0;

    const withBalance = [];
    const withoutBalance = [];
    const studentBalances = {};
    const balanceUpdates = {};

    lessons.forEach(({ id, student_id, balance }) => {
      if (studentBalances[student_id] === undefined) studentBalances[student_id] = balance ?? 0;
      if (studentBalances[student_id] > 0) {
        withBalance.push(id);
        studentBalances[student_id]--;
      } else {
        withoutBalance.push(id);
      }
      balanceUpdates[student_id] = (balanceUpdates[student_id] || 0) - 1;
    });

    if (withBalance.length) {
      const ph = withBalance.map(() => '?').join(',');
      db.prepare(`UPDATE lessons SET is_completed = 1, is_paid = 1 WHERE id IN (${ph})`).run(
        ...withBalance,
      );
    }
    if (withoutBalance.length) {
      const ph = withoutBalance.map(() => '?').join(',');
      db.prepare(`UPDATE lessons SET is_completed = 1 WHERE id IN (${ph})`).run(...withoutBalance);
    }

    // Snapshot the price of each newly completed lesson. Lessons that already
    // carry a price are skipped so they do not consume a second bundle slot.
    const priceStmt = db.prepare(
      'UPDATE lessons SET price = ?, payment_bundle_id = ? WHERE id = ?',
    );
    for (const { id, student_id, datetime, price: existing } of lessons) {
      if (existing !== null) continue;
      const { price, bundleId } = resolveLessonPrice(student_id, datetime);
      priceStmt.run(price, bundleId, id);
    }

    const balStmt = db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?');
    for (const [sid, amt] of Object.entries(balanceUpdates)) {
      balStmt.run(amt, parseInt(sid));
    }

    return lessons.length;
  });

  return sync();
}

// # SCHEDULES

function getSchedules(studentId) {
  return db
    .prepare(
      `
    SELECT * FROM schedules WHERE student_id = ?
    ORDER BY is_active DESC, day_of_week, time
  `,
    )
    .all(studentId);
}

/**
 * Active weekly slots per student. This is the planned load, so income
 * projections use it instead of looking back at lessons already given.
 */
function getWeeklyScheduleCounts() {
  return db
    .prepare(
      `
    SELECT student_id, COUNT(*) AS per_week
    FROM schedules WHERE is_active = 1
    GROUP BY student_id
  `,
    )
    .all();
}

function addSchedule(studentId, dayOfWeek, time) {
  const existing = db
    .prepare(
      `
    SELECT id, is_active FROM schedules WHERE student_id = ? AND day_of_week = ? AND time = ?
  `,
    )
    .get(studentId, dayOfWeek, time);

  if (existing) {
    if (!existing.is_active) {
      db.prepare('UPDATE schedules SET is_active = 1 WHERE id = ?').run(existing.id);
      return { id: existing.id };
    }
    throw new Error('Schedule with same day and time already exists');
  }

  const result = db
    .prepare(
      `
    INSERT INTO schedules (student_id, day_of_week, time, is_active) VALUES (?, ?, ?, 1)
  `,
    )
    .run(studentId, dayOfWeek, time);
  return { id: result.lastInsertRowid };
}

function deleteSchedule(scheduleId) {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(scheduleId);
}

function toggleScheduleActive(scheduleId) {
  db.prepare('UPDATE schedules SET is_active = NOT is_active WHERE id = ?').run(scheduleId);
}

// # AUTO CREATE LESSONS

function autoCreateLessons(studentId) {
  const schedules = getSchedules(studentId).filter((s) => s.is_active);
  if (!schedules.length) return 0;

  const now = new Date();
  const startOfWeek = new Date(now);
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (dow === 0 ? 6 : dow - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  const endDate = new Date(startOfWeek);
  endDate.setDate(endDate.getDate() + 14);
  endDate.setHours(23, 59, 59, 999);

  const student = db.prepare('SELECT name FROM students WHERE id = ?').get(studentId);
  const studentName = student ? student.name : null;

  let created = 0;
  const possibleLessons = [];

  for (let week = 0; week < 2; week++) {
    for (const sched of schedules) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + sched.day_of_week + week * 7);
      const [h, m] = sched.time.split(':');
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      if (d <= now || d > endDate) continue;
      possibleLessons.push(d.toISOString());
    }
  }

  possibleLessons.sort();

  for (const iso of possibleLessons) {
    const exists = db
      .prepare(
        `
      SELECT id FROM lessons WHERE student_id = ? AND (datetime = ? OR previous_datetime = ?)
    `,
      )
      .get(studentId, iso, iso);
    if (exists) continue;

    const deleted = db
      .prepare(
        `
      SELECT id FROM deleted_lesson_slots WHERE student_id = ? AND datetime = ?
    `,
      )
      .get(studentId, iso);
    if (deleted) continue;

    db.prepare(
      `
      INSERT INTO lessons (student_id, student_name_cache, datetime, is_paid, is_completed)
      VALUES (?, ?, ?, 0, 0)
    `,
    ).run(studentId, studentName, iso);
    created++;
  }

  return created;
}

function autoCreateLessonsForAllStudents() {
  const students = db.prepare('SELECT id FROM students').all();
  let total = 0;
  for (const s of students) total += autoCreateLessons(s.id);
  return total;
}

// # EXPORTS

module.exports = {
  initDatabase,
  // Students
  getStudents,
  addStudent,
  updateStudentBalance,
  markOldestUnpaidLessonsAsPaid,
  deleteStudent,
  // Lesson prices
  setStudentPrice,
  getStudentCurrentPrice,
  getStudentPriceHistory,
  deleteStudentPrice,
  // Payment bundles
  createPaymentBundle,
  // Balance history
  recordBalanceChange,
  getBalanceHistory,
  // Discounts
  getDiscounts,
  getGlobalDiscounts,
  addDiscount,
  deleteDiscount,
  toggleDiscountActive,
  findApplicableDiscount,
  // Tax
  getTaxSettings,
  saveTaxSettings,
  // Financial stats
  getEarningsStats,
  getEarningsByDay,
  getEarningsByStudent,
  getEarningsDateRange,
  getCashStats,
  getCashByDay,
  getCashByStudent,
  getUnearnedTotal,
  // Lessons
  getLessons,
  addLesson,
  updateLesson,
  toggleLessonPayment,
  deleteLesson,
  syncCompletedLessons,
  // Schedules
  getSchedules,
  getWeeklyScheduleCounts,
  addSchedule,
  deleteSchedule,
  toggleScheduleActive,
  autoCreateLessons,
  autoCreateLessonsForAllStudents,
};
