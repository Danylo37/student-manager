const db = require('./database');
const { Rejection, REASON } = require('./rejection');

// Every mutation the app makes goes through here, whether it comes from the
// desktop UI or from a command recorded elsewhere. Each action repeats, step
// for step, the sequence its IPC handler used to run inline, inside a single
// transaction, so a caller cannot run a shorter sequence or leave half of one
// behind. database.js still owns every SQL statement; this file only orders
// the calls.

let conn = null;

/** The connection initDatabase() returned; every action runs inside its transaction. */
function init(connection) {
  conn = connection;
}

/** Run fn inside one transaction; nested calls become savepoints. */
function transaction(fn) {
  return conn.transaction(fn)();
}

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** A moment written as a UTC ISO string, the only form the app stores. */
function isUtcIso(value) {
  return typeof value === 'string' && UTC_ISO.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * When the money actually arrived, for a payment recorded after the fact: an
 * intent carries its own createdAt, the desktop passes null and the money is
 * dated when it is entered. paid_at is ordered as text next to rows stamped by
 * datetime('now'), so the ISO string is rewritten to that same format; the
 * moment itself is unchanged.
 */
function toLedgerTime(paidAt) {
  if (paidAt == null) return null;
  if (!isUtcIso(paidAt)) throw new Error(`paidAt must be a UTC ISO string, got ${paidAt}`);
  return new Date(paidAt).toISOString().slice(0, 19).replace('T', ' ');
}

// # STUDENTS

function addStudent(name, balance, priceKopiyky) {
  return transaction(() => db.addStudent(name, balance, priceKopiyky ?? null));
}

// # BALANCE

/**
 * Explicit payment for N lessons, with a known total when a discount applies,
 * otherwise priced from the discount table or the current price.
 */
function payForLessons(studentId, lessons, totalPriceKopiyky = null, paidAt = null) {
  return transaction(() => {
    db.updateStudentBalance(studentId, lessons);
    const bundle = db.createPaymentBundle(
      studentId,
      lessons,
      totalPriceKopiyky,
      toLedgerTime(paidAt),
    );
    // Money with no price behind it cannot be put in the ledger, so it is refused
    // outright rather than marked paid on the quiet.
    if (!bundle) throw new Rejection(REASON.noPrice);
    db.recordBalanceChange(studentId, lessons, bundle.total);
    db.markOldestUnpaidLessonsAsPaid(studentId, lessons);
  });
}

/**
 * Lessons added to or taken off a balance by hand. Both directions hit the
 * cash ledger: a negative change is money given back or a payment entered by
 * mistake, and either way the period must show it, in the tax base of the payment
 * it undoes (one refund row per base touched).
 *
 * Taking lessons off gives back what the ledger holds, open slots first and
 * then lessons already worked off, newest payment first; what those slots cost
 * is exactly the money going back, the price list of today has nothing to do
 * with it. A balance typed in by hand (LEDGER-BUG-3) has no money behind it and
 * gives the rest while it lasts. Whatever is left over is not applied: a lesson
 * nobody paid for cannot be taken back, so the balance moves by what actually
 * happened and the caller learns that number.
 * @returns {{lessons: number, amount: number}} lessons added or taken off, and
 *   the money that moved with them
 */
function adjustBalance(studentId, lessons, paidAt = null) {
  return transaction(() => {
    if (lessons > 0) {
      db.updateStudentBalance(studentId, lessons);
      const bundle = db.createPaymentBundle(studentId, lessons, null, toLedgerTime(paidAt));
      if (!bundle) throw new Rejection(REASON.noPrice);
      db.recordBalanceChange(studentId, lessons, bundle.total);
      return { lessons, amount: bundle.total };
    }

    const requested = -lessons;
    const hand = db.countHandPrepaidLessons(studentId);
    const refunded = db.cancelPrepaidLessons(studentId, requested);
    const removed = refunded.lessons + Math.min(requested - refunded.lessons, hand);
    if (removed === 0) throw new Rejection(REASON.nothingToRefund);

    db.updateStudentBalance(studentId, -removed);
    for (const r of refunded.refunds) {
      db.createPaymentBundle(studentId, -r.lessons, r.amount, toLedgerTime(paidAt), r.isTaxExempt);
    }
    db.recordBalanceChange(studentId, -removed, refunded.lessons > 0 ? -refunded.amount : null);
    return { lessons: removed, amount: refunded.amount };
  });
}

// # LESSONS

function addLesson(studentId, datetime, isCompleted, isTrial, studentName) {
  return transaction(() => db.addLesson(studentId, datetime, isCompleted, isTrial, studentName));
}

function updateLesson(lessonId, updates) {
  return transaction(() => db.updateLesson(lessonId, updates));
}

function deleteLesson(lessonId) {
  return transaction(() => db.deleteLesson(lessonId));
}

/** Paying for a single lesson after the fact: a payment like any other. */
function toggleLessonPayment(lessonId, paidAt = null) {
  return transaction(() => {
    const { studentId, studentName, price } = db.toggleLessonPayment(
      lessonId,
      toLedgerTime(paidAt),
    );
    db.recordBalanceChange(studentId, 1, price, studentName);
  });
}

module.exports = {
  init,
  transaction,
  isUtcIso,
  addStudent,
  payForLessons,
  adjustBalance,
  addLesson,
  updateLesson,
  deleteLesson,
  toggleLessonPayment,
};
