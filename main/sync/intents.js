const actions = require('../actions');
const logger = require('../logger');

// An intent is a mutation recorded somewhere else (later: the Telegram Mini
// App) and applied here exactly once: { id, type, payload, createdAt, source }.
// The ledger is touched only through actions.*, so an intent can never run a
// shorter sequence than the desktop does. applied_intents remembers every id
// that was decided on, and a repeat of the same id is answered from there
// without touching anything.
//
// apply() never throws for a bad intent. It returns one of
//   { status: 'applied',   result }              written and remembered
//   { status: 'rejected',  reason }              a precondition failed, nothing written
//   { status: 'duplicate', previous }            this id was decided on before
//   { status: 'failed',    reason }              unexpected error, rolled back, not remembered
// A malformed envelope or payload is rejected without being remembered, so the
// same id can come back corrected.

let conn = null;

function init(connection) {
  conn = connection;
}

// # VALIDATION

const isId = (v) => Number.isInteger(v) && v > 0;
const isKopiyky = (v) => Number.isInteger(v) && v >= 0;

const REASON = {
  studentDeleted: 'Учня видалено',
  lessonNotFound: 'Урок не знайдено',
  slotTaken: 'Цей час уже зайнято',
  alreadyCompleted: 'Урок уже проведено',
  notCompleted: 'Урок ще не проведено',
  alreadyPaid: 'Урок уже оплачено',
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
};

/** The first failed check, or null when every check passed. */
const firstError = (...errors) => errors.find(Boolean) ?? null;

// # GUARDS
//
// What has to be true right before an action runs. These are the only reads
// outside database.js: the sync layer looks up the rows an intent names, and
// never writes to them.

function findStudent(studentId) {
  return conn.prepare('SELECT id FROM students WHERE id = ?').get(studentId) ?? null;
}

function findLesson(lessonId) {
  return (
    conn
      .prepare('SELECT id, student_id, is_completed, is_paid, is_trial FROM lessons WHERE id = ?')
      .get(lessonId) ?? null
  );
}

/** The tutor gives one lesson at a time, so a datetime is a slot for everyone. */
function slotTaken(datetime, exceptLessonId = null) {
  return (
    conn
      .prepare('SELECT id FROM lessons WHERE datetime = ? AND (? IS NULL OR id <> ?)')
      .get(datetime, exceptLessonId, exceptLessonId) !== undefined
  );
}

const studentExists = (studentId) => (findStudent(studentId) ? null : REASON.studentDeleted);

// # REGISTRY (v1)
//
// validate: the payload's shape, before anything is read.
// guard:    the preconditions, read inside the transaction; a reason rejects.
// run:      the action, with the intent's own time as the payment date.

const TYPES = {
  'balance.pay': {
    validate: (p) =>
      firstError(
        field.id(p, 'studentId'),
        Number.isInteger(p.lessons) && p.lessons > 0 ? null : invalid('lessons'),
        field.optionalKopiyky(p, 'totalPriceKopiyky'),
      ),
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
    guard: (p) =>
      firstError(
        p.isTrial ? null : studentExists(p.studentId),
        slotTaken(p.datetime) ? REASON.slotTaken : null,
      ),
    // A scheduled lesson: completion comes as its own intent, or from the
    // regular sync once the time has passed.
    run: (p) =>
      actions.addLesson(p.studentId ?? null, p.datetime, false, !!p.isTrial, p.studentName ?? null),
  },

  'lesson.move': {
    validate: (p) => firstError(field.id(p, 'lessonId'), field.datetime(p, 'datetime')),
    guard: (p) => {
      const lesson = findLesson(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (lesson.is_completed) return REASON.alreadyCompleted;
      return slotTaken(p.datetime, p.lessonId) ? REASON.slotTaken : null;
    },
    run: (p) => actions.updateLesson(p.lessonId, { datetime: p.datetime }),
  },

  'lesson.complete': {
    validate: (p) => firstError(field.id(p, 'lessonId'), field.boolean(p, 'isCompleted')),
    guard: (p) => {
      const lesson = findLesson(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (!!lesson.is_completed === p.isCompleted) {
        return p.isCompleted ? REASON.alreadyCompleted : REASON.notCompleted;
      }
      return null;
    },
    run: (p) => actions.updateLesson(p.lessonId, { is_completed: p.isCompleted ? 1 : 0 }),
  },

  'lesson.delete': {
    validate: (p) => field.id(p, 'lessonId'),
    guard: (p) => (findLesson(p.lessonId) ? null : REASON.lessonNotFound),
    run: (p) => actions.deleteLesson(p.lessonId),
  },

  'lesson.togglePayment': {
    validate: (p) => field.id(p, 'lessonId'),
    guard: (p) => {
      const lesson = findLesson(p.lessonId);
      if (!lesson) return REASON.lessonNotFound;
      if (lesson.is_trial) return REASON.trialIsFree;
      if (!lesson.is_completed) return REASON.notCompleted;
      if (lesson.is_paid) return REASON.alreadyPaid;
      if (!lesson.student_id) return REASON.studentDeleted;
      return null;
    },
    run: (p) => actions.toggleLessonPayment(p.lessonId),
  },

  'student.add': {
    validate: (p) =>
      firstError(
        field.text(p, 'name'),
        p.balance == null || Number.isInteger(p.balance) ? null : invalid('balance'),
        p.priceKopiyky == null || (isKopiyky(p.priceKopiyky) && p.priceKopiyky > 0)
          ? null
          : invalid('priceKopiyky'),
      ),
    guard: () => null,
    run: (p) => actions.addStudent(p.name.trim(), p.balance ?? 0, p.priceKopiyky ?? null),
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

// # APPLIED INTENTS

function findApplied(id) {
  const row = conn
    .prepare('SELECT status, result, reason, applied_at FROM applied_intents WHERE id = ?')
    .get(id);
  if (!row) return null;
  return {
    status: row.status,
    result: row.result === null ? null : JSON.parse(row.result),
    reason: row.reason,
    appliedAt: row.applied_at,
  };
}

function remember(intent, status, result, reason) {
  conn
    .prepare(
      `
    INSERT INTO applied_intents (id, type, source, payload, created_at, status, result, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      intent.id,
      intent.type,
      intent.source ?? null,
      JSON.stringify(intent.payload),
      intent.createdAt,
      status,
      result === undefined || result === null ? null : JSON.stringify(result),
      reason ?? null,
    );
}

// # APPLY

function apply(intent) {
  const envelope = validateEnvelope(intent);
  if (envelope) return { status: 'rejected', reason: envelope };

  const type = TYPES[intent.type];
  const shape = type.validate(intent.payload);
  if (shape) return { status: 'rejected', reason: shape };

  const payload = canonical(intent.payload);

  try {
    return conn.transaction(() => {
      const previous = findApplied(intent.id);
      if (previous) return { status: 'duplicate', previous };

      const reason = type.guard(payload);
      if (reason) {
        remember(intent, 'rejected', null, reason);
        return { status: 'rejected', reason };
      }

      const result = type.run(payload, intent) ?? null;
      remember(intent, 'applied', result, null);
      logger.info('Intent applied', { id: intent.id, type: intent.type, source: intent.source });
      return { status: 'applied', result };
    })();
  } catch (error) {
    logger.error('Intent failed', { id: intent.id, type: intent.type, error: error.message });
    return { status: 'failed', reason: error.message };
  }
}

module.exports = { init, apply, TYPES: Object.keys(TYPES) };
