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
 * When the money actually arrived, for a payment recorded after the fact.
 * paid_at is ordered as text next to rows stamped by datetime('now'), so the
 * ISO string is rewritten to that same format; the moment itself is unchanged.
 *
 * LEDGER-BUG-8: this parameter is what closes it for balance.pay and
 * balance.adjust. The desktop still passes null, so money entered there is
 * dated when it is entered, and toggleLessonPayment cannot take a date at all:
 * its bundle is created inside database.js with no way to pass one through.
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
 * mistake, and either way the period must show it. Taking lessons off the
 * balance also takes them off the payments they came from, and what those
 * slots cost is exactly the money going back; the price list of today has
 * nothing to do with it.
 */
function adjustBalance(studentId, lessons, paidAt = null) {
  return transaction(() => {
    db.updateStudentBalance(studentId, lessons);
    const refunded = lessons < 0 ? db.cancelPrepaidLessons(studentId, -lessons) : null;
    // LEDGER-BUG-9: the refund row is written for `lessons` even when fewer
    // slots could actually be taken back (refunded.lessons).
    const bundle = db.createPaymentBundle(
      studentId,
      lessons,
      refunded && refunded.amount,
      toLedgerTime(paidAt),
    );
    if (!bundle) throw new Rejection(REASON.noPrice);
    db.recordBalanceChange(studentId, lessons, bundle.total);
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
function toggleLessonPayment(lessonId) {
  return transaction(() => {
    const { studentId, studentName, price } = db.toggleLessonPayment(lessonId);
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
