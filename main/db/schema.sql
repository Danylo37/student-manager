-- # STUDENTS
-- is_tax_exempt: payments from this student stay out of the percentage tax base.
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  balance INTEGER DEFAULT 0,
  is_tax_exempt INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PAYMENT BUNDLES
-- The cash ledger: one row per payment received (+N lessons).
-- Tracks how many lessons from this payment have been consumed.
-- total_price in KOPIYKY (1 hryvnia = 100 kopiyky).
-- paid_at is when the money was actually received — taxes are calculated on it,
-- because a ФОП declares income by payment date, not by lesson date.
-- A refund is a row with negative lessons_count and total_price; it is never
-- consumed by lessons and simply reduces the cash of its period.
-- is_tax_exempt snapshots the student's flag when the payment is recorded, so the
-- tax base of a past period never changes and survives the student's deletion.
-- lessons_cancelled/amount_cancelled are the slots a refund took back: the money
-- of this row never changes (it is the tax base of its period), the refund lives
-- in its own negative row, and what is left to work off is
-- total_price - amount_cancelled minus the lessons already taken from it.
CREATE TABLE IF NOT EXISTS payment_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  total_price INTEGER NOT NULL, -- kopiyky
  lessons_count INTEGER NOT NULL,
  lessons_used INTEGER DEFAULT 0,
  lessons_cancelled INTEGER DEFAULT 0,
  amount_cancelled INTEGER DEFAULT 0, -- kopiyky
  is_tax_exempt INTEGER DEFAULT 0,
  paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
);

-- BALANCE HISTORY
-- One row per balance change made by the teacher (payment or manual correction).
-- lessons is signed (+N paid, -N removed); amount in KOPIYKY, NULL when no price was known.
CREATE TABLE IF NOT EXISTS balance_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  student_name_cache TEXT,
  lessons INTEGER NOT NULL,
  amount INTEGER, -- kopiyky
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
);

-- LESSONS
-- student_id is nullable so completed lessons survive student deletion.
-- student_name_cache preserves the name after deletion.
-- price in KOPIYKY.
-- payment_bundle_id links to the bundle that paid for this lesson.
-- is_trial: a 30-minute free lesson with no student of its own — it keeps the
-- name in student_name_cache and never touches balances, bundles or income.
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  student_name_cache TEXT,
  datetime TEXT NOT NULL,
  previous_datetime TEXT,
  is_completed BOOLEAN DEFAULT 0,
  is_paid BOOLEAN DEFAULT 0,
  is_trial BOOLEAN DEFAULT 0,
  price INTEGER DEFAULT NULL, -- kopiyky
  payment_bundle_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL,
  FOREIGN KEY (payment_bundle_id) REFERENCES payment_bundles (id) ON DELETE SET NULL
);

-- # SCHEDULES
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  time TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- # DELETED LESSON SLOTS
CREATE TABLE IF NOT EXISTS deleted_lesson_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  datetime TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- LESSON PRICES
-- price in KOPIYKY.
CREATE TABLE IF NOT EXISTS lesson_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  price INTEGER NOT NULL, -- kopiyky
  valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- DISCOUNTS
-- total_price in KOPIYKY.
-- student_id = NULL means global discount.
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  lessons_count INTEGER NOT NULL,
  total_price INTEGER NOT NULL, -- kopiyky
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

-- TAX SETTINGS (single row)
-- esv_type: 'none' | 'fixed'
-- esv_fixed: kopiyky/month
-- esv_since: YYYY-MM-DD, the first day of the month ЄСВ is counted from — the
--   month it was switched on, unless the user picks another; NULL while it is off.
--   ЄСВ is due every month from then on, income or not.
-- single_tax_rate: percent (єдиний податок, 5.0 = 5% — ФОП 3 group default)
-- military_tax_rate: percent (e.g. 1.0 means 1%)
CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  esv_type TEXT DEFAULT 'none',
  esv_fixed INTEGER DEFAULT 0, -- kopiyky/month
  esv_since TEXT,
  single_tax_enabled INTEGER DEFAULT 0,
  single_tax_rate REAL DEFAULT 5.0,
  military_tax_enabled INTEGER DEFAULT 0,
  military_tax_rate REAL DEFAULT 1.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT
OR IGNORE INTO tax_settings (id)
VALUES
  (1);

-- APPLIED INTENTS
-- One row per intent id ever decided on (see main/sync/intents.js): a mutation
-- recorded outside the desktop and applied here once. A repeat of the same id
-- is answered from this table and never touches the ledger.
-- status: 'applied' | 'rejected'; result and payload are JSON; created_at is the
-- intent's own UTC ISO timestamp, applied_at is when it reached this database.
CREATE TABLE IF NOT EXISTS applied_intents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT,
  payload TEXT,
  created_at TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,
  result TEXT,
  reason TEXT
);

-- # INDEXES
CREATE INDEX IF NOT EXISTS idx_lessons_datetime ON lessons (datetime);

CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons (student_id);

CREATE INDEX IF NOT EXISTS idx_schedules_student ON schedules (student_id);

CREATE INDEX IF NOT EXISTS idx_deleted_slots_student ON deleted_lesson_slots (student_id, datetime);

CREATE INDEX IF NOT EXISTS idx_lesson_prices_student ON lesson_prices (student_id, valid_from);

CREATE INDEX IF NOT EXISTS idx_discounts_student ON discounts (student_id);

CREATE INDEX IF NOT EXISTS idx_bundles_student ON payment_bundles (student_id, created_at);

CREATE INDEX IF NOT EXISTS idx_bundles_paid_at ON payment_bundles (paid_at);

CREATE INDEX IF NOT EXISTS idx_balance_history_created ON balance_history (created_at);
