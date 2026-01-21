CREATE TABLE IF NOT EXISTS students
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    balance    INTEGER  DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lessons
(
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER NOT NULL,
    datetime     TEXT    NOT NULL,
    is_completed BOOLEAN  DEFAULT 0,
    is_paid      BOOLEAN  DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schedules
(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    time        TEXT    NOT NULL,
    is_active   BOOLEAN  DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lessons_datetime ON lessons (datetime);
CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons (student_id);
CREATE INDEX IF NOT EXISTS idx_schedules_student ON schedules (student_id);
