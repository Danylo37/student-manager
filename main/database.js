const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { LESSON_DURATION_MINUTES } = require('./constants');
const logger = require('./logger');

let db = null;

// ─────────────────────────────────────────────────────────────────────────────
// INIT & MIGRATION
// ─────────────────────────────────────────────────────────────────────────────

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

    logger.info('Database initialized successfully');
    return db;
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
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
      CASE WHEN l.price IS NOT NULL THEN CAST(ROUND(l.price * 100) AS INTEGER) ELSE NULL END,
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

  db.pragma('foreign_keys = ON');

  logger.info('Migration v2 complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENTS
// ─────────────────────────────────────────────────────────────────────────────

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
    SELECT id FROM lessons
    WHERE student_id = ? AND is_completed = 1 AND is_paid = 0
    ORDER BY datetime ASC
  `,
    )
    .all(studentId);
}

function markOldestUnpaidLessonsAsPaid(studentId, count) {
  if (count <= 0) return;
  const lessons = getUnpaidCompletedLessons(studentId).slice(0, count);
  const stmt = db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?');
  for (const l of lessons) stmt.run(l.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSON PRICES  (all values in kopiyky)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT BUNDLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a payment bundle when teacher records a payment.
 * Called automatically from updateBalance / payForLessons.
 * @param {number} studentId
 * @param {number} count     - number of lessons purchased
 * @param {number|null} totalPriceKopiyky - if null, computed from current price
 * @returns {number|null} bundle id or null if no price info
 */
function createPaymentBundle(studentId, count, totalPriceKopiyky = null) {
  if (count <= 0) return null;

  let total = totalPriceKopiyky;

  if (total === null) {
    // Try applicable discount first
    const discount = findApplicableDiscount(studentId, count);
    if (discount) {
      total = discount.total_price;
    } else {
      // Fall back to current price × count
      const priceRecord = getStudentCurrentPrice(studentId);
      if (priceRecord) {
        total = priceRecord.price * count;
      }
    }
  }

  if (total === null) return null; // no price info → no bundle

  const result = db
    .prepare(
      `
    INSERT INTO payment_bundles (student_id, total_price, lessons_count)
    VALUES (?, ?, ?)
  `,
    )
    .run(studentId, total, count);

  logger.info('Payment bundle created', {
    studentId,
    count,
    total,
    bundleId: result.lastInsertRowid,
  });
  return result.lastInsertRowid;
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
    WHERE student_id = ? AND lessons_used < lessons_count
    ORDER BY created_at ASC LIMIT 1
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
 * Return one lesson to its bundle (called when a completed lesson is deleted).
 */
function returnLessonToBundle(bundleId) {
  if (!bundleId) return;
  db.prepare('UPDATE payment_bundles SET lessons_used = MAX(0, lessons_used - 1) WHERE id = ?').run(
    bundleId,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNTS  (total_price in kopiyky)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// TAX SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

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
      military_tax_enabled = ?,
      military_tax_rate    = ?,
      updated_at           = datetime('now')
    WHERE id = 1
  `,
  ).run(s.esv_type, s.esv_fixed, s.military_tax_enabled ? 1 : 0, s.military_tax_rate);
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL STATS
// ─────────────────────────────────────────────────────────────────────────────

function getEarningsStats(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT
      COALESCE(SUM(CASE WHEN is_paid = 1 THEN price END), 0) AS total,
      COUNT(CASE WHEN price IS NOT NULL THEN 1 END)          AS lessons_with_price,
      COUNT(*)                                                AS lessons_total
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
    SELECT DATE(datetime) AS day, COALESCE(SUM(price), 0) AS total, COUNT(*) AS count
    FROM lessons
    WHERE is_completed = 1 AND is_paid = 1 AND datetime >= ? AND datetime < ? AND price IS NOT NULL
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
      COALESCE(s.id, -1)                              AS student_id,
      COALESCE(s.name, l.student_name_cache, '?')    AS student_name,
      COALESCE(SUM(l.price), 0)                       AS total,
      COUNT(*)                                         AS count
    FROM lessons l
    LEFT JOIN students s ON s.id = l.student_id
    WHERE l.is_completed = 1 AND l.is_paid = 1 AND l.datetime >= ? AND l.datetime < ? AND l.price IS NOT NULL
    GROUP BY COALESCE(s.id, -1)
    ORDER BY total DESC
  `,
    )
    .all(startDate, endDate);
}

// ─────────────────────────────────────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────────────────────────────────────

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

  let price = null;
  let bundleId = null;

  if (isCompleted && studentId) {
    const bundleResult = consumeFromBundle(studentId);
    if (bundleResult) {
      price = bundleResult.price;
      bundleId = bundleResult.bundleId;
    } else {
      price = getStudentPriceAt(studentId, datetime);
    }
  }

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
      const bundleResult = consumeFromBundle(current.student_id);
      if (bundleResult) {
        fields.push('price = ?');
        values.push(bundleResult.price);
        fields.push('payment_bundle_id = ?');
        values.push(bundleResult.bundleId);
      } else {
        const p = getStudentPriceAt(current.student_id, current.datetime);
        if (p !== null) {
          fields.push('price = ?');
          values.push(p);
        }
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
  db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?').run(lessonId);
  if (lesson.balance < 0 && lesson.student_id) updateStudentBalance(lesson.student_id, 1);
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

// ─────────────────────────────────────────────────────────────────────────────
// AUTO SYNC
// ─────────────────────────────────────────────────────────────────────────────

function syncCompletedLessons() {
  cleanupExpiredDeletedSlots();

  const threshold = new Date(Date.now() - LESSON_DURATION_MINUTES * 60 * 1000).toISOString();

  const sync = db.transaction(() => {
    const lessons = db
      .prepare(
        `
      SELECT l.id, l.student_id, l.datetime, s.balance
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

    // Snapshot price for each newly completed lesson
    const priceStmt = db.prepare(`UPDATE lessons SET
      price = CASE
        WHEN payment_bundle_id IS NOT NULL THEN price
        ELSE (
          SELECT lp.price FROM lesson_prices lp
          WHERE lp.student_id = lessons.student_id AND lp.valid_from <= lessons.datetime
          ORDER BY lp.valid_from DESC LIMIT 1
        )
      END
      WHERE id = ? AND price IS NULL
    `);
    for (const { id, student_id } of lessons) {
      // Try bundle first
      const bundleResult = consumeFromBundle(student_id);
      if (bundleResult) {
        db.prepare('UPDATE lessons SET price = ?, payment_bundle_id = ? WHERE id = ?').run(
          bundleResult.price,
          bundleResult.bundleId,
          id,
        );
      } else {
        priceStmt.run(id);
      }
    }

    const balStmt = db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?');
    for (const [sid, amt] of Object.entries(balanceUpdates)) {
      balStmt.run(amt, parseInt(sid));
    }

    return lessons.length;
  });

  return sync();
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULES
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// AUTO CREATE LESSONS
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * First/last income and the number of months that actually had income.
 *
 * `min_date` is the moment the user really started using the finance features
 * (first paid lesson with a price). Fixed monthly taxes (ЄСВ) are charged from
 * that month onwards — including months without lessons, as a real ФОП pays —
 * but never before it, so an existing install stays at zero tax until a price
 * is set and such a lesson happens.
 */
function getEarningsDateRange() {
  return db
    .prepare(
      `
    SELECT
      MIN(datetime)                                          AS min_date,
      MAX(datetime)                                          AS max_date,
      COUNT(DISTINCT strftime('%Y-%m', datetime))            AS months_count
    FROM lessons
    WHERE is_completed = 1 AND is_paid = 1 AND price IS NOT NULL
  `,
    )
    .get();
}

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
  getStudentPriceAt,
  getStudentPriceHistory,
  deleteStudentPrice,
  // Payment bundles
  createPaymentBundle,
  consumeFromBundle,
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
  // Lessons
  getLessons,
  addLesson,
  updateLesson,
  toggleLessonPayment,
  deleteLesson,
  syncCompletedLessons,
  // Schedules
  getSchedules,
  addSchedule,
  deleteSchedule,
  toggleScheduleActive,
  autoCreateLessons,
  autoCreateLessonsForAllStudents,
};
