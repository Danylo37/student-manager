-- # STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  balance INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- PAYMENT BUNDLES
-- Created when teacher adds balance (+N lessons).
-- Tracks how many lessons from this payment have been consumed.
-- total_price in KOPIYKY (1 hryvnia = 100 kopiyky).
CREATE TABLE IF NOT EXISTS payment_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  total_price INTEGER NOT NULL, -- kopiyky
  lessons_count INTEGER NOT NULL,
  lessons_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
);

-- LESSONS
-- student_id is nullable so completed lessons survive student deletion.
-- student_name_cache preserves the name after deletion.
-- price in KOPIYKY.
-- payment_bundle_id links to the bundle that paid for this lesson.
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  student_name_cache TEXT,
  datetime TEXT NOT NULL,
  previous_datetime TEXT,
  is_completed BOOLEAN DEFAULT 0,
  is_paid BOOLEAN DEFAULT 0,
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
-- military_tax_rate: percent (e.g. 1.0 means 1%)
CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  esv_type TEXT DEFAULT 'none',
  esv_fixed INTEGER DEFAULT 0, -- kopiyky/month
  military_tax_enabled INTEGER DEFAULT 0,
  military_tax_rate REAL DEFAULT 1.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT
OR IGNORE INTO tax_settings (id)
VALUES
  (1);

-- # INDEXES
CREATE INDEX IF NOT EXISTS idx_lessons_datetime ON lessons (datetime);

CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons (student_id);

CREATE INDEX IF NOT EXISTS idx_schedules_student ON schedules (student_id);

CREATE INDEX IF NOT EXISTS idx_deleted_slots_student ON deleted_lesson_slots (student_id, datetime);

CREATE INDEX IF NOT EXISTS idx_lesson_prices_student ON lesson_prices (student_id, valid_from);

CREATE INDEX IF NOT EXISTS idx_discounts_student ON discounts (student_id);

CREATE INDEX IF NOT EXISTS idx_bundles_student ON payment_bundles (student_id, created_at);
