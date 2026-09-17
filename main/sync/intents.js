const actions = require('../actions');
const db = require('../database');
const logger = require('../logger');
const { Rejection, REASON: REFUSAL } = require('../rejection');

// An intent is a mutation recorded somewhere else (later: the Telegram Mini
// App) and applied here exactly once: { id, type, payload, createdAt, source }.
// The ledger is touched only through actions.*, so an intent can never run a
// shorter sequence than the desktop does; database.js answers the lookups the
// guards need and keeps applied_intents, where every id that was decided on is
// remembered. A repeat of the same id is answered from there without touching
// anything.
//
// apply() never throws for a bad intent. It returns one of
//   { status: 'applied',   result, summary }     written and remembered
//   { status: 'rejected',  reason, summary }     a guard or the action refused, nothing written
//   { status: 'duplicate', previous }            this id was decided on before
//   { status: 'failed',    reason, summary }     unexpected error, rolled back, not remembered
// A malformed envelope or payload is rejected without being remembered, so the
// same id can come back corrected. summary is the one line the desktop shows
// for the intent, written with the names as they are at that moment.

// # VALIDATION

const isId = (v) => Number.isInteger(v) && v > 0;
const isKopiyky = (v) => Number.isInteger(v) && v >= 0;

const REASON = {
  studentDeleted: 'Учня видалено',
  lessonNotFound: 'Урок не знайдено',
  slotTaken: 'Цей час уже зайнято',
  alreadyCompleted: 'Урок уже проведено',
  notCompleted: 'Урок ще не проведено',
  alreadyPaid: REFUSAL.alreadyPaid,
  trialIsFree: 'Пробний урок безкоштовний',
  noStudent: 'Не вказано учня',
};

function invalid(field) {
  return `Некоректне поле: ${field}`;
}

const field = {
  id: (p, name) => (isId(p[name]) ? null : invalid(name)),
  optionalKopiyky: (p, name) => (p[name] == null || isKopiyky(p[name]) ? null : invalid(name)),
  optionalBoolean: (p, name) =>
    p[name] == null || typeof p[name] === 'boolean' ? null : invalid(name),
  boolean: (p, name) => (typeof p[name] === 'boolean' ? null : invalid(name)),
  datetime: (p, name) => (actions.isUtcIso(p[name]) ? null : invalid(name)),
  text: (p, name) => (typeof p[name] === 'string' && p[name].trim() ? null : invalid(name)),
  optionalText: (p, name) =>
    p[name] == null || typeof p[name] === 'string' ? null : invalid(name),
  optionalHint: (p, name) => {
    const h = p[name];
    if (h == null) return null;
    const ok =
      typeof h === 'object' &&
      (h.studentName == null || typeof h.studentName === 'string') &&
      actions.isUtcIso(h.datetime) &&
      typeof h.isTrial === 'boolean';
    return ok ? null : invalid(name);
  },
};

/** The first failed check, or null when every check passed. */
const firstError = (...errors) => errors.find(Boolean) ?? null;

// # SUMMARY
//
// One line per intent for the desktop, the way the tutor would say it: who,
// how many lessons, which time, and once it is applied, what it cost and the
// balance it left. Written before the guard, so a refused intent has its line
// too, and again after the action when the numbers are known.

const WEEKDAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const pad = (n) => String(n).padStart(2, '0');

function when(iso) {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function lessonsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'урок';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'уроки';
  return 'уроків';
}

const count = (n) => `${n} ${lessonsWord(n)}`;
const uah = (kopiyky) =>
  `${(kopiyky / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ₴`;
const money = (result, word = '') => (result.amount > 0 ? `, ${word}${uah(result.amount)}` : '');

const studentName = (id) => db.getStudentById(id)?.name ?? `учень #${id}`;
const balanceAfter = (id) => ` · баланс ${db.getStudentById(id)?.balance ?? '?'}`;

/**
 * "Іван: урок пт 18.09 14:00" from the row, or from what the phone saw when the
 * row is already gone, or the bare id when neither is there.
 */
function lessonLabel(id, was) {
  const lesson = db.getLessonById(id);
  const known = lesson
    ? { name: lesson.student_name_cache, datetime: lesson.datetime, isTrial: lesson.is_trial }
    : was && { name: was.studentName, datetime: was.datetime, isTrial: was.isTrial };
  if (!known) return `урок #${id}`;
  const name = known.name || 'Без імені';
  return `${known.isTrial ? `${name} (пробний)` : name}: урок ${when(known.datetime)}`;
}

// # GUARDS
//
// What has to be true right before an action runs, read inside the transaction.

const studentExists = (studentId) => (db.getStudentById(studentId) ? null : REASON.studentDeleted);
const slotTaken = (datetime, isTrial, exceptLessonId = null) =>
  db.findOverlappingLesson(datetime, isTrial, exceptLessonId) !== null;

// # REGISTRY (v1)
//
// validate: the payload's shape, before anything is read.
// describe: the line for the desktop, read before the guard so it is there either way.
// applied:  the line once the action ran, with what it reported; describe's when absent.
// guard:    the preconditions; a reason rejects.
// run:      the action, with the intent's own time as the payment date.

const TYPES = {
  'balance.pay': {
    validate: (p) =>
      firstError(
        field.id(p, 'studentId'),
        Number.isInteger(p.lessons) && p.lessons > 0 ? null : invalid('lessons'),
        field.optionalKopiyky(p, 'totalPriceKopiyky'),
      ),
    describe: (p) => `💳 ${studentName(p.studentId)}: +${count(p.lessons)}`,
    applied: (p, r) =>
      `💳 ${studentName(p.studentId)}: +${count(r.lessons)}${money(r)}${balanceAfter(p.studentId)}`,
    guard: (p) => studentExists(p.studentId),
    run: (p, intent) =>
      actions.payForLessons(p.studentId, p.lessons, p.totalPriceKopiyky ?? null, intent.createdAt),
  },

  'balance.adjust': {
    validate: (p) =>
      firstError(
        field.id(p, 'studentId'),
        Number.isInteger(p.lessons) && p.lessons !== 0 ? null : invalid('lessons'),
      ),
    describe: (p) =>
      p.lessons > 0
        ? `💳 ${studentName(p.studentId)}: +${count(p.lessons)}`
        : `↩️ ${studentName(p.studentId)}: −${count(-p.lessons)}`,
    // Taking lessons off gives back what the ledger holds, so the line says
    // how many actually went, not how many were asked for.
    applied: (p, r) =>
      p.lessons > 0
        ? `💳 ${studentName(p.studentId)}: +${count(r.lessons)}${money(r)}${balanceAfter(p.studentId)}`
        : `↩️ ${studentName(p.studentId)}: −${count(r.lessons)}${money(r, 'повернуто ')}${balanceAfter(p.studentId)}`,
    guard: (p) => studentExists(p.studentId),
    run: (p, intent) => actions.adjustBalance(p.studentId, p.lessons, intent.createdAt),
  },

  'lesson.add': {
    validate: (p) =>
      firstError(
        field.datetime(p, 'datetime'),
        field.optionalBoolean(p, 'isTrial'),
        field.optionalText(p, 'studentName'),
        p.isTrial ? null : p.studentId == null ? REASON.noStudent : field.id(p, 'studentId'),
      ),
    describe: (p) =>
      p.isTrial
        ? `📅 ${(p.studentName ?? '').trim() || 'Без імені'} (пробний): урок ${when(p.datetime)}`
        : `📅 ${studentName(p.studentId)}: урок ${when(p.datetime)}`,
    guard: (p) =>
      firstError(
        p.isTrial ? null : studentExists(p.studentId),
        slotTaken(p.datetime, !!p.isTrial) ? REASON.slotTaken : null,
      ),
    // A scheduled lesson: completion comes as its own intent, or from the
    // regular sync once the time has passed.
    run: (p) =>
      actions.addLesson(p.studentId ?? null, p.datetime, false, !!p.isTrial, p.studentName ?? null),
  },

  'lesson.move': {
    validate: (p) =>
      firstError(
        field.id(p, 'lessonId'),
        field.datetime(p, 'datetime'),
        field.optionalHint(p, 'was'),
      ),
    describe: (p) => `🔁 ${lessonLabel(p.lessonId, p.was)} → ${when(p.datetime)}`,
    guard: (p) => {
      const lesson = db.getLessonById(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (lesson.is_completed) return REASON.alreadyCompleted;
      return slotTaken(p.datetime, !!lesson.is_trial, p.lessonId) ? REASON.slotTaken : null;
    },
    run: (p) => actions.updateLesson(p.lessonId, { datetime: p.datetime }),
  },

  'lesson.complete': {
    validate: (p) =>
      firstError(
        field.id(p, 'lessonId'),
        field.boolean(p, 'isCompleted'),
        field.optionalHint(p, 'was'),
      ),
    describe: (p) =>
      p.isCompleted
        ? `✅ ${lessonLabel(p.lessonId, p.was)} проведено`
        : `↩️ ${lessonLabel(p.lessonId, p.was)} знову заплановано`,
    guard: (p) => {
      const lesson = db.getLessonById(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (!!lesson.is_completed === p.isCompleted) {
        return p.isCompleted ? REASON.alreadyCompleted : REASON.notCompleted;
      }
      return null;
    },
    run: (p) => actions.updateLesson(p.lessonId, { is_completed: p.isCompleted ? 1 : 0 }),
  },

  'lesson.delete': {
    validate: (p) => firstError(field.id(p, 'lessonId'), field.optionalHint(p, 'was')),
    describe: (p) => `🗑 ${lessonLabel(p.lessonId, p.was)} видалено`,
    guard: (p) => (db.getLessonById(p.lessonId) ? null : REASON.lessonNotFound),
    run: (p) => actions.deleteLesson(p.lessonId),
  },

  'lesson.togglePayment': {
    validate: (p) => firstError(field.id(p, 'lessonId'), field.optionalHint(p, 'was')),
    describe: (p) => `💳 ${lessonLabel(p.lessonId, p.was)} оплачено`,
    applied: (p, r) => `💳 ${lessonLabel(p.lessonId, p.was)} оплачено${money(r)}`,
    guard: (p) => {
      const lesson = db.getLessonById(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (lesson.is_trial) return REASON.trialIsFree;
      if (!lesson.is_completed) return REASON.notCompleted;
      if (lesson.is_paid) return REASON.alreadyPaid;
      return null;
    },
    run: (p, intent) => actions.toggleLessonPayment(p.lessonId, intent.createdAt),
  },

  // The balance is lessons already paid for, so it is a payment dated by the
  // intent and it needs a price; the action refuses it otherwise. Tax flags and
  // packages stay on the desktop.
  'student.add': {
    validate: (p) =>
      firstError(
        field.text(p, 'name'),
        p.balance == null || (Number.isInteger(p.balance) && p.balance >= 0)
          ? null
          : invalid('balance'),
        field.optionalKopiyky(p, 'priceKopiyky'),
      ),
    describe: (p) =>
      `👤 Новий учень ${p.name.trim()}${p.balance ? `, оплачено ${count(p.balance)} наперед` : ''}`,
    guard: () => null,
    run: (p, intent) =>
      actions.addStudent(p.name.trim(), p.balance ?? 0, p.priceKopiyky ?? null, {
        paidAt: intent.createdAt,
      }),
  },
};

function validateEnvelope(intent) {
  if (!intent || typeof intent !== 'object') return 'Намір не є об’єктом';
  if (typeof intent.id !== 'string' || !intent.id.trim()) return invalid('id');
  if (!Object.hasOwn(TYPES, intent.type)) return `Невідомий тип наміру: ${intent.type}`;
  if (!intent.payload || typeof intent.payload !== 'object') return invalid('payload');
  if (!actions.isUtcIso(intent.createdAt)) return invalid('createdAt');
  if (intent.source != null && typeof intent.source !== 'string') return invalid('source');
  return null;
}

/** Datetimes are stored exactly as the renderer writes them: toISOString(). */
function canonical(payload) {
  if (!('datetime' in payload)) return payload;
  return { ...payload, datetime: new Date(payload.datetime).toISOString() };
}

// # APPLY

function apply(intent) {
  const envelope = validateEnvelope(intent);
  if (envelope) return { status: 'rejected', reason: envelope };

  const type = TYPES[intent.type];
  const shape = type.validate(intent.payload);
  if (shape) return { status: 'rejected', reason: shape };

  const payload = canonical(intent.payload);
  let summary = null;

  try {
    return actions.transaction(() => {
      const previous = db.getAppliedIntent(intent.id);
      if (previous) return { status: 'duplicate', previous };

      summary = type.describe(payload);
      const reason = type.guard(payload);
      if (reason) {
        db.recordAppliedIntent(intent, 'rejected', null, reason, summary);
        return { status: 'rejected', reason, summary };
      }

      let result;
      try {
        result = type.run(payload, intent) ?? null;
      } catch (error) {
        // The action itself refused: remembered exactly like a guard rejection
        if (!(error instanceof Rejection)) throw error;
        db.recordAppliedIntent(intent, 'rejected', null, error.message, summary);
        return { status: 'rejected', reason: error.message, summary };
      }
      if (type.applied && result) summary = type.applied(payload, result);
      db.recordAppliedIntent(intent, 'applied', result, null, summary);
      logger.info('Intent applied', { id: intent.id, type: intent.type, source: intent.source });
      return { status: 'applied', result, summary };
    });
  } catch (error) {
    logger.error('Intent failed', { id: intent.id, type: intent.type, error: error.message });
    return { status: 'failed', reason: error.message, summary };
  }
}

// # HISTORY

/**
 * The decided intents, newest first, each with its line. Rows decided on before
 * lines were written get one now, from the payload and today's names.
 */
function history(limit) {
  return db.listAppliedIntents(limit).map((row) => {
    if (row.summary != null) return row;
    const type = TYPES[row.type];
    let summary = row.type;
    try {
      summary =
        row.status === 'applied' && type.applied && row.result
          ? type.applied(row.payload, row.result)
          : type.describe(row.payload);
    } catch {
      // A payload from an older registry: the type name is all there is to show
    }
    return { ...row, summary };
  });
}

module.exports = { apply, history, TYPES: Object.keys(TYPES) };
