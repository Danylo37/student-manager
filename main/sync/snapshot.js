const { createHash } = require('crypto');
const db = require('../database');

// What the Mini App shows: the students and the lessons around today, flat and
// only for display. Money history, tax settings, bundles and discounts never
// leave the desktop (rule 5 of docs/miniapp.md). Lesson datetimes are UTC ISO;
// the timezone tells the phone where the tutor's day starts.

const WINDOW_BEFORE_DAYS = 7;
const WINDOW_AFTER_DAYS = 21;

/** Local day boundaries, so the window only moves at midnight. */
function windowRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - WINDOW_BEFORE_DAYS);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + WINDOW_AFTER_DAYS + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildSnapshot(now = new Date()) {
  const { start, end } = windowRange(now);
  return {
    generatedAt: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    students: db.getStudents().map((s) => ({
      id: s.id,
      name: s.name,
      balance: s.balance,
      priceKopiyky: s.current_price ?? null,
    })),
    lessons: db.getLessons(start, end).map((l) => ({
      id: l.id,
      studentId: l.student_id,
      studentName: l.student_name,
      datetime: l.datetime,
      isCompleted: !!l.is_completed,
      isPaid: !!l.is_paid,
      isTrial: !!l.is_trial,
    })),
  };
}

/** The content only: two snapshots of the same data hash the same whenever they were built. */
function hashSnapshot({ timezone, students, lessons }) {
  return createHash('sha256').update(JSON.stringify({ timezone, students, lessons })).digest('hex');
}

module.exports = { buildSnapshot, hashSnapshot };
