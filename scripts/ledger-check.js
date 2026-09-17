#!/usr/bin/env node
'use strict';

// Replays the money paths on throwaway databases and checks that the ledger
// ends up identical whichever way a mutation arrives: through the IPC handlers
// or through an intent. Also checks that a repeated intent changes nothing, that
// expected rejections write nothing, and that a failure inside an action rolls
// the whole action back.
//
//   node scripts/ledger-check.js
//   node scripts/ledger-check.js --before <dir> --fixed BUG-2
//        also replay through another checkout's main/ (a git worktree of the
//        previous commit) and diff the two; --fixed names the LEDGER-BUG tags
//        this tree fixes and the old one still has
//
// With --before, every scenario must end up byte for byte the same on both
// trees, except the ones whose `fixed` tag is named in --fixed: those must
// differ, and their `expect` assertions must fail on the old tree and pass on
// the new one. That is how a fix commit shows it changed exactly the scenario
// it meant to.
//
// main/ needs electron for app.getPath and ipcMain.handle, so a stand-in is
// served from here and the handlers are collected instead of registered.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { randomUUID } = require('crypto');

// # ELECTRON STAND-IN

const state = { userData: null, handlers: null, startupError: null };

const fakeElectron = {
  app: {
    isPackaged: false,
    getPath: () => state.userData,
    getVersion: () => 'ledger-check',
    whenReady: () => Promise.resolve(),
    on() {},
  },
  BrowserWindow: class {
    constructor() {
      this.webContents = { on() {}, openDevTools() {} };
    }
    maximize() {}
    loadURL() {
      return Promise.resolve();
    }
    loadFile() {
      return Promise.resolve();
    }
    static getAllWindows() {
      return [];
    }
  },
  ipcMain: {
    handle: (channel, fn) => {
      state.handlers[channel] = fn;
    },
  },
  dialog: {
    showErrorBox: (title, message) => {
      state.startupError = new Error(`${title}: ${message}`);
    },
    showMessageBox: async () => ({ response: 1 }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return fakeElectron;
  if (request === 'electron-updater') return { autoUpdater: {} };
  return originalLoad.call(this, request, ...rest);
};

// schema.sql is read from the tree itself in development
process.env.NODE_ENV = 'development';

const tempDirs = [];

/** Boot one main/ tree on a fresh database, the way electron would. */
async function loadTree(mainDir) {
  state.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-check-'));
  tempDirs.push(state.userData);
  state.handlers = {};
  state.startupError = null;

  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(mainDir + path.sep)) delete require.cache[file];
  }
  require(path.join(mainDir, 'main.js'));
  require(path.join(mainDir, 'logger.js')).silent = true;
  await new Promise((resolve) => setImmediate(resolve));
  if (state.startupError) throw state.startupError;
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');

  const Database = require('better-sqlite3');
  const tree = {
    mainDir,
    handlers: state.handlers,
    db: require(path.join(mainDir, 'database.js')),
    raw: new Database(path.join(state.userData, 'students.db')),
  };
  const intentsFile = path.join(mainDir, 'sync', 'intents.js');
  if (fs.existsSync(intentsFile)) tree.intents = require(intentsFile);
  return tree;
}

// # DRIVERS
//
// The same eight operations, sent the way the renderer sends them (IPC
// channels) or wrapped as intents. Both return promises so scenarios read the
// same either way. `attempt` runs an operation that may be refused and returns
// the refusal instead of throwing, so a scenario can expect one.

async function attempt(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error.message;
  }
}

/** Deleting a student is desktop-only, so both drivers send it the IPC way. */
const removeStudent = (tree) => (studentId, refundAdvance) =>
  tree.handlers['db:delete-student']({}, studentId, refundAdvance);

function viaHandlers(tree) {
  const call = (channel, ...args) => tree.handlers[channel]({}, ...args);
  return {
    name: 'handlers',
    tree,
    attempt,
    removeStudent: removeStudent(tree),
    addStudent: async (name, balance, price, exempt = false, discount = null) =>
      (await call('db:add-student', name, balance, price, exempt, discount)).id,
    pay: (studentId, lessons, total = null) =>
      call('db:pay-for-lessons', studentId, lessons, total),
    adjust: (studentId, lessons) => call('db:update-balance', studentId, lessons),
    addLesson: async (studentId, datetime, extra = {}) =>
      (await call('db:add-lesson', { studentId, datetime, isCompleted: false, ...extra })).id,
    move: (lessonId, datetime) => call('db:update-lesson', lessonId, { datetime }),
    complete: (lessonId, done) =>
      call('db:update-lesson', lessonId, { is_completed: done ? 1 : 0 }),
    remove: (lessonId) => call('db:delete-lesson', lessonId),
    toggle: (lessonId) => call('db:toggle-lesson-payment', lessonId),
  };
}

function viaIntents(tree) {
  const apply = (type, payload, createdAt = new Date().toISOString()) => {
    const intent = { id: randomUUID(), type, payload, createdAt, source: 'ledger-check' };
    const outcome = tree.intents.apply(intent);
    if (outcome.status !== 'applied') {
      throw new Error(`${type} ${JSON.stringify(payload)} -> ${outcome.status}: ${outcome.reason}`);
    }
    return outcome.result;
  };
  return {
    name: 'intents',
    tree,
    apply,
    attempt,
    removeStudent: removeStudent(tree),
    addStudent: async (name, balance, price) =>
      apply('student.add', { name, balance, priceKopiyky: price }).id,
    pay: async (studentId, lessons, total = null) =>
      apply('balance.pay', { studentId, lessons, totalPriceKopiyky: total }),
    adjust: async (studentId, lessons) => apply('balance.adjust', { studentId, lessons }),
    addLesson: async (studentId, datetime, extra = {}) =>
      apply('lesson.add', { studentId, datetime, ...extra }).id,
    move: async (lessonId, datetime) => apply('lesson.move', { lessonId, datetime }),
    complete: async (lessonId, done) => apply('lesson.complete', { lessonId, isCompleted: done }),
    remove: async (lessonId) => apply('lesson.delete', { lessonId }),
    toggle: async (lessonId) => apply('lesson.togglePayment', { lessonId }),
  };
}

// # SNAPSHOT

const WIDE = ['2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z'];
const FAR = '2100-01-01T00:00:00.000Z';

// Every business column except the timestamps, which differ run to run
const TABLES = {
  students: 'SELECT id, name, balance, is_tax_exempt FROM students ORDER BY id',
  payment_bundles: `SELECT id, student_id, total_price, lessons_count, lessons_used,
      lessons_cancelled, amount_cancelled, is_tax_exempt FROM payment_bundles ORDER BY id`,
  lessons: `SELECT id, student_id, student_name_cache, datetime, previous_datetime, is_completed,
      is_paid, is_trial, price, payment_bundle_id FROM lessons ORDER BY id`,
  balance_history:
    'SELECT id, student_id, student_name_cache, lessons, amount FROM balance_history ORDER BY id',
  lesson_prices: 'SELECT id, student_id, price FROM lesson_prices ORDER BY id',
  deleted_lesson_slots: 'SELECT id, student_id, datetime FROM deleted_lesson_slots ORDER BY id',
};

function snapshot(tree) {
  const rows = {};
  for (const [table, sql] of Object.entries(TABLES)) rows[table] = tree.raw.prepare(sql).all();
  return {
    rows,
    cash: tree.db.getCashStats(...WIDE),
    earned: tree.db.getEarningsStats(...WIDE),
    open: tree.db.getBalanceTotals(FAR),
  };
}

/** First difference between two snapshots, or null. */
function diff(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  for (const table of Object.keys(TABLES)) {
    const n = Math.max(a.rows[table].length, b.rows[table].length);
    for (let i = 0; i < n; i++) {
      const ra = JSON.stringify(a.rows[table][i]);
      const rb = JSON.stringify(b.rows[table][i]);
      if (ra !== rb) return `${table}[${i}]\n      ${ra}\n      ${rb}`;
    }
  }
  for (const key of ['cash', 'earned', 'open']) {
    const ja = JSON.stringify(a[key]);
    const jb = JSON.stringify(b[key]);
    if (ja !== jb) return `${key}: ${ja} vs ${jb}`;
  }
  return 'differs';
}

const uah = (kopiyky) => (kopiyky / 100).toFixed(2);

function summary(s) {
  const balances = s.rows.students.map((r) => `#${r.id}=${r.balance}`).join(' ') || '-';
  return (
    `cash ${uah(s.cash.total)} (taxable ${uah(s.cash.taxable)}, lessons ${s.cash.lessons}) ` +
    `earned ${uah(s.earned.total)} advance ${uah(s.open.advance)} debt ${uah(s.open.debt)} ` +
    `balances ${balances}`
  );
}

// # SCENARIOS

const PRICE = 50000; // 500 ₴ per lesson
const at = (hours) => new Date(Date.UTC(2030, 0, 1, 10) + hours * 3600e3).toISOString();

/** Add and complete `count` lessons, one per hour starting at slot `from`. */
async function given(t, studentId, count, from = 0) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = await t.addLesson(studentId, at(from + i));
    await t.complete(id, true);
    ids.push(id);
  }
  return ids;
}

// `real` is the money that actually changed hands, so the printout shows where
// the ledger is known to drift (the LEDGER-BUG markers) and that the drift is
// the same before and after. `intents: false` marks a path the intent guards
// refuse on purpose; those run through the handlers only. `expect` lists
// assertions as [label, ok] pairs; with `fixed: 'BUG-N'` named in --fixed they
// must fail on the --before tree and the scenario must come out different there.
const scenarios = [
  {
    name: 'пополнение со скидкой: 10 уроків за 4000 ₴, 12 проведено',
    real: 400000,
    run: async (t) => {
      const s = await t.addStudent('Знижка', 0, PRICE);
      t.tree.db.addDiscount(s, 10, 400000, '10 уроків');
      await t.pay(s, 10);
      await given(t, s, 12);
    },
  },
  {
    name: 'возврат с отменой предоплаченных: оплата 5, 3 проведено, знято 4',
    real: 250000 - 200000,
    run: async (t) => {
      const s = await t.addStudent('Повернення', 0, PRICE);
      await t.pay(s, 5);
      await given(t, s, 3);
      await t.adjust(s, -4);
    },
  },
  {
    name: 'урок оплачен задним числом (💵 на долговом), потом пополнение 3',
    real: 50000 + 150000,
    run: async (t) => {
      const s = await t.addStudent('Борг', 0, PRICE);
      const [first] = await given(t, s, 2);
      await t.toggle(first);
      await t.pay(s, 3);
    },
  },
  {
    name: 'ошибочное пополнение 10, снято 5, добавлено 2 через баланс',
    real: 500000 - 250000 + 100000,
    run: async (t) => {
      const s = await t.addStudent('Помилка', 0, PRICE);
      await t.pay(s, 10);
      await t.adjust(s, -5);
      await t.adjust(s, 2);
    },
  },
  {
    name: 'перенос запланированного, проведён и отменён, удалён запланированный, пробный',
    real: 100000,
    run: async (t) => {
      const s = await t.addStudent('Рух', 0, PRICE);
      await t.pay(s, 2);
      const a = await t.addLesson(s, at(0));
      await t.move(a, at(5));
      await t.complete(a, true);
      await t.complete(a, false);
      const b = await t.addLesson(s, at(1));
      await t.remove(b);
      const trial = await t.addLesson(null, at(2), { isTrial: true, studentName: 'Пробний' });
      await t.complete(trial, true);
    },
  },
  {
    name: 'LEDGER-BUG-2: учень без цены, 2 проведено, пополнение 3 и 💵',
    real: null,
    fixed: 'BUG-2',
    run: async (t) => {
      const s = await t.addStudent('Без ціни', 0, null);
      const [first] = await given(t, s, 2);
      return {
        pay: await t.attempt(() => t.pay(s, 3)),
        toggle: await t.attempt(() => t.toggle(first)),
      };
    },
    expect: (snap, tree, notes) => [
      ['пополнение без цены отклонено', !!notes.pay && notes.pay.includes('Вкажіть ціну уроку')],
      ['💵 без цены отклонено', !!notes.toggle && notes.toggle.includes('Вкажіть ціну уроку')],
      ['баланс не изменился: -2', snap.rows.students[0].balance === -2],
      ['уроки остались неоплаченными', snap.rows.lessons.every((l) => l.is_paid === 0)],
      [
        'ни бандлов, ни истории',
        snap.rows.payment_bundles.length === 0 && snap.rows.balance_history.length === 0,
      ],
    ],
  },
  {
    name: 'ціна 0: пополнение 3, 4 проведено, 💵 на долговом — касса не трогается',
    real: 0,
    fixed: 'PRICE-0',
    run: async (t) => {
      const s = await t.addStudent('Нуль', 0, 0);
      const pay = await t.attempt(() => t.pay(s, 3));
      const ids = await given(t, s, 4);
      const toggle = await t.attempt(() => t.toggle(ids[3]));
      return { pay, toggle };
    },
    expect: (snap, tree, notes) => [
      ['пополнение и 💵 с ценой 0 не отклонены', notes.pay === null && notes.toggle === null],
      [
        'бандлы на 0 ₴: 3 урока и 1 урок',
        snap.rows.payment_bundles.some((b) => b.lessons_count === 3 && b.total_price === 0) &&
          snap.rows.payment_bundles.some((b) => b.lessons_count === 1 && b.total_price === 0),
      ],
      [
        'все 4 урока оплачены по 0',
        snap.rows.lessons.every((l) => l.is_paid === 1 && l.price === 0),
      ],
      [
        'касса 0, аванс 0, долг 0, баланс 0',
        snap.cash.total === 0 &&
          snap.open.advance === 0 &&
          snap.open.debt === 0 &&
          snap.rows.students[0].balance === 0,
      ],
    ],
  },
  {
    name: 'LEDGER-BUG-3: стартовый баланс 3 — оплата в день создания, 4 проведено; перенос старой предоплаты ценой 0; баланс без цены',
    real: 150000,
    fixed: 'BUG-3',
    run: async (t) => {
      const s = await t.addStudent('Старт', 3, PRICE);
      await given(t, s, 4);
      // Lessons paid before the ledger existed: a price of 0 keeps the cash untouched
      const old = await t.addStudent('Перенос', 2, 0);
      await given(t, old, 1, 10);
      return { noPrice: await t.attempt(() => t.addStudent('Без ціни', 2, null)) };
    },
    expect: (snap, tree, notes) => [
      [
        'стартовый баланс — платёж: касса 1500, бандл на 3 урока',
        snap.cash.total === 150000 &&
          snap.rows.payment_bundles.some(
            (b) => b.student_id === 1 && b.lessons_count === 3 && b.total_price === 150000,
          ),
      ],
      [
        '3 урока оплачены из бандла, четвёртый — долг 500',
        snap.rows.lessons.filter((l) => l.student_id === 1 && l.is_paid === 1).length === 3 &&
          snap.open.debt === 50000,
      ],
      [
        'история: +3 на 1500',
        snap.rows.balance_history.some(
          (h) => h.student_id === 1 && h.lessons === 3 && h.amount === 150000,
        ),
      ],
      [
        'перенос ценой 0: бандл 2 урока на 0 ₴, урок оплачен по 0',
        snap.rows.payment_bundles.some(
          (b) => b.student_id === 2 && b.lessons_count === 2 && b.total_price === 0,
        ) && snap.rows.lessons.some((l) => l.student_id === 2 && l.is_paid === 1 && l.price === 0),
      ],
      [
        'баланс без цены отклонён, ученик не создан',
        !!notes.noPrice &&
          notes.noPrice.includes('Вкажіть ціну уроку') &&
          snap.rows.students.length === 2,
      ],
      [
        'балансы -1 и 1',
        snap.rows.students[0].balance === -1 && snap.rows.students[1].balance === 1,
      ],
    ],
  },
  {
    name: 'создание с пакетом из формы и без податків: баланс 10 по пакету 4000, 2 проведено',
    real: 400000,
    intents: false,
    fixed: 'BUG-3',
    run: async (t) => {
      const s = await t.addStudent('Пакет', 10, PRICE, true, {
        lessonsCount: 10,
        totalPriceKopiyky: 400000,
      });
      await given(t, s, 2);
    },
    expect: (snap) => [
      [
        'платёж по пакету: касса 4000, taxable 0',
        snap.cash.total === 400000 && snap.cash.taxable === 0,
      ],
      [
        'бандл 10 уроков на 4000 со снимком пільги',
        snap.rows.payment_bundles.some(
          (b) => b.lessons_count === 10 && b.total_price === 400000 && b.is_tax_exempt === 1,
        ),
      ],
      ['ученик без податків', snap.rows.students[0].is_tax_exempt === 1],
      [
        '2 урока по 400 из пакета, баланс 8',
        snap.rows.lessons.filter((l) => l.is_paid === 1 && l.price === 40000).length === 2 &&
          snap.rows.students[0].balance === 8,
      ],
    ],
  },
  {
    name: 'LEDGER-BUG-4: оплата 5, 6 проведено, удалён оплаченный, 💵 на бывшем долговом; отмена проведения',
    real: 250000 + 100000,
    fixed: 'BUG-4',
    run: async (t) => {
      const s = await t.addStudent('Слот', 0, PRICE);
      await t.pay(s, 5);
      const ids = await given(t, s, 6);
      await t.remove(ids[2]);
      const toggle = await t.attempt(() => t.toggle(ids[5]));
      // The same through un-completing: the freed slot goes to the debt lesson
      const u = await t.addStudent('Скасування', 0, PRICE);
      await t.pay(u, 2);
      const [first] = await given(t, u, 3, 10);
      await t.complete(first, false);
      await t.complete(first, true);
      return { toggle };
    },
    expect: (snap, tree, notes) => {
      const lesson = (id) => snap.rows.lessons.find((l) => l.id === id);
      return [
        [
          'освободившийся слот занял шестой урок',
          lesson(6).is_paid === 1 && lesson(6).payment_bundle_id === 1,
        ],
        ['💵 на оплаченном отклонён', !!notes.toggle && notes.toggle.includes('Урок уже оплачено')],
        [
          'после отмены проведения слот ушёл долговому уроку',
          lesson(9).is_paid === 1 && lesson(7).is_paid === 0 && lesson(7).price === 50000,
        ],
        [
          'кэш = реальные деньги: 3500, аванс 0, долг 500',
          snap.cash.total === 350000 && snap.open.advance === 0 && snap.open.debt === 50000,
        ],
        [
          'балансы 0 и -1',
          snap.rows.students[0].balance === 0 && snap.rows.students[1].balance === -1,
        ],
      ];
    },
  },
  {
    name: 'LEDGER-BUG-5: оплата 5, флаг пільги, знято 2, оплата 3 (пільга), знято 4',
    real: 250000 - 100000 + 150000 - 200000,
    fixed: 'BUG-5',
    run: async (t) => {
      const s = await t.addStudent('Пільга', 0, PRICE);
      await t.pay(s, 5);
      t.tree.db.setStudentTaxExempt(s, true);
      await t.adjust(s, -2);
      await t.pay(s, 3);
      await t.adjust(s, -4);
    },
    expect: (snap) => {
      const refund = (lessons, total, exempt) =>
        snap.rows.payment_bundles.some(
          (b) =>
            b.lessons_count === lessons && b.total_price === total && b.is_tax_exempt === exempt,
        );
      return [
        ['taxable = 2500 − 1000 − 500 = 1000', snap.cash.taxable === 100000],
        ['возврат 2 наследует базу оплаты: -2/-1000 без пільги', refund(-2, -100000, 0)],
        ['возврат 4 разбит по флагу: -3/-1500 пільга', refund(-3, -150000, 1)],
        ['возврат 4 разбит по флагу: -1/-500 без пільги', refund(-1, -50000, 0)],
        [
          'история: одно снятие -4 на 2000',
          snap.rows.balance_history.some((h) => h.lessons === -4 && h.amount === -200000),
        ],
      ];
    },
  },
  {
    name: 'LEDGER-BUG-6: оплата 5, 2 проведено, ученик удалён, аванс оставлен как доход',
    real: 250000,
    run: async (t) => {
      const s = await t.addStudent('Пішов', 0, PRICE);
      await t.pay(s, 5);
      await given(t, s, 2);
      await t.removeStudent(s, false);
    },
    expect: (snap) => [
      [
        'деньги остались в кассе: 2500, аванс закрыт',
        snap.cash.total === 250000 && snap.open.advance === 0,
      ],
      ['строки возврата нет', snap.rows.payment_bundles.length === 1],
    ],
  },
  {
    name: 'LEDGER-BUG-6: оплата 5, 2 проведено, ученик удалён, аванс возвращён',
    real: 250000 - 150000,
    fixed: 'BUG-6',
    run: async (t) => {
      const s = await t.addStudent('Пішов', 0, PRICE);
      await t.pay(s, 5);
      await given(t, s, 2);
      // What the dialog offers to give back, read the way the renderer reads it
      const advance = t.tree.handlers['db:get-student-advance']
        ? await t.tree.handlers['db:get-student-advance']({}, s)
        : null;
      await t.removeStudent(s, true);
      return { advance };
    },
    expect: (snap, tree, notes) => [
      [
        'диалогу показано: 3 урока на 1500',
        !!notes.advance && notes.advance.lessons === 3 && notes.advance.amount === 150000,
      ],
      ['возврат 3 уроков на 1500: касса 1000', snap.cash.total === 100000],
      [
        'строка возврата -3/-1500 без владельца',
        snap.rows.payment_bundles.some(
          (b) => b.student_id === null && b.lessons_count === -3 && b.total_price === -150000,
        ),
      ],
      [
        'история: -3 на 1500 с именем ученика',
        snap.rows.balance_history.some(
          (h) =>
            h.student_id === null &&
            h.student_name_cache === 'Пішов' &&
            h.lessons === -3 &&
            h.amount === -150000,
        ),
      ],
      [
        'аванс 0, ученика нет, проведённые уроки оплачены и остались',
        snap.open.advance === 0 &&
          snap.rows.students.length === 0 &&
          snap.rows.lessons.length === 2 &&
          snap.rows.lessons.every((l) => l.student_id === null && l.is_paid === 1),
      ],
    ],
  },
  {
    name: 'LEDGER-BUG-1: должник удалён, 💵 на его уроке',
    real: 50000,
    fixed: 'BUG-1',
    run: async (t) => {
      const s = await t.addStudent('Боржник', 0, PRICE);
      const [first] = await given(t, s, 2);
      await t.removeStudent(s, false);
      await t.toggle(first);
    },
    expect: (snap) => [
      ['деньги в кэше: 500', snap.cash.total === 50000],
      [
        'бандл без владельца на 1 урок, слот занят',
        snap.rows.payment_bundles.some(
          (b) =>
            b.student_id === null &&
            b.lessons_count === 1 &&
            b.total_price === 50000 &&
            b.lessons_used === 1,
        ),
      ],
      ['урок привязан к бандлу', snap.rows.lessons[0].payment_bundle_id !== null],
      [
        'история: оплата от удалённого ученика',
        snap.rows.balance_history.some(
          (h) => h.student_id === null && h.lessons === 1 && h.amount === 50000,
        ),
      ],
    ],
  },
  {
    name: 'LEDGER-BUG-7: пакет по 400, ошибочный +1 по 500, внесён прошлый урок, снято 1',
    real: 400000 + 50000 - 50000,
    fixed: 'BUG-7',
    run: async (t) => {
      const s = await t.addStudent('Пакет', 0, PRICE);
      t.tree.db.addDiscount(s, 10, 400000, '10 уроків');
      await t.pay(s, 10);
      await given(t, s, 10, 10);
      await t.pay(s, 1);
      await given(t, s, 1, 0);
      await t.adjust(s, -1);
    },
    expect: (snap) => [
      ['кэш сошёлся с реальными деньгами: 4000', snap.cash.total === 400000],
      [
        'возврат снял слот ошибочной оплаты: -1/-500',
        snap.rows.payment_bundles.some((b) => b.lessons_count === -1 && b.total_price === -50000),
      ],
      [
        'пакет цел: 10 оплаченных уроков по 400',
        snap.rows.lessons.filter((l) => l.is_paid === 1 && l.price === 40000).length === 10,
      ],
      [
        'отцеплен урок ошибочной оплаты: долг 500',
        snap.open.debt === 50000 &&
          snap.rows.lessons.some((l) => l.is_paid === 0 && l.price === 50000),
      ],
    ],
  },
  {
    name: 'LEDGER-BUG-9: оплата 2, знято 5; ручной баланс 3 (старая версия), знято 2; нечего снимать',
    real: 100000 - 100000,
    fixed: 'BUG-9',
    run: async (t) => {
      const a = await t.addStudent('Двічі', 0, PRICE);
      await t.pay(a, 2);
      const over = await t.attempt(() => t.adjust(a, -5));
      // A balance an older version wrote straight to the student: no payment behind it
      const h = await t.addStudent('Рука', 0, PRICE);
      t.tree.raw.prepare('UPDATE students SET balance = 3 WHERE id = ?').run(h);
      const hand = await t.attempt(() => t.adjust(h, -2));
      const n = await t.addStudent('Нуль', 0, PRICE);
      const nothing = await t.attempt(() => t.adjust(n, -1));
      return { over, hand, nothing };
    },
    expect: (snap, tree, notes) => [
      [
        'снято 2 из 5: баланс 0, строка возврата -2 на 1000',
        snap.rows.students[0].balance === 0 &&
          snap.rows.payment_bundles.some(
            (b) => b.student_id === 1 && b.lessons_count === -2 && b.total_price === -100000,
          ),
      ],
      [
        'ручной баланс: снято 2, баланс 1, без денежной строки',
        snap.rows.students[1].balance === 1 &&
          !snap.rows.payment_bundles.some((b) => b.student_id === 2),
      ],
      [
        'история ручного снятия: -2 без суммы',
        snap.rows.balance_history.some(
          (h) => h.student_id === 2 && h.lessons === -2 && h.amount === null,
        ),
      ],
      ['нечего снимать: отказ, баланс 0', !!notes.nothing && snap.rows.students[2].balance === 0],
      ['первые два снятия не отклонены', notes.over === null && notes.hand === null],
    ],
  },
];

// # CHECKS
//
// Assertions are [label, ok] pairs, optionally tagged with the fix they prove:
// [label, ok, 'BUG-N']. Tagged pairs must fail on the --before tree.

let failures = 0;
const fixes = new Set(); // LEDGER-BUG tags this run proves against --before
const ok = (cond, message) => {
  if (!cond) failures++;
  console.log(`   ${cond ? '✓' : '✗'} ${message}`);
  return cond;
};

/**
 * Report assertions for the tree they ran on: after must pass; before must fail
 * for the fixes this run proves (--fixed), which the old tree does not have.
 */
function report(pairs, { before }) {
  for (const [label, passed, fixed] of pairs) {
    if (!before) ok(passed, label);
    else if (fixed && fixes.has(fixed)) ok(!passed, `падает до фикса (${fixed}): ${label}`);
  }
}

async function runScenario(scenario, trees) {
  console.log(`\n${scenario.name}`);
  const results = [];
  for (const { label, mainDir, driver, before } of trees) {
    if (driver === viaIntents && scenario.intents === false) continue;
    const tree = await loadTree(mainDir);
    if (driver === viaIntents && !tree.intents) continue;
    const t = driver(tree);
    const notes = await scenario.run(t);
    const snap = snapshot(tree);
    results.push({ label, before, snap, tree, notes });
    console.log(`   ${label.padEnd(16)} ${summary(snap)}`);
  }

  const after = results.filter((r) => !r.before);
  const before = results.find((r) => r.before);
  for (const other of after.slice(1)) {
    const d = diff(after[0].snap, other.snap);
    ok(!d, `${after[0].label} == ${other.label}${d ? `\n      ${d}` : ''}`);
  }
  const proves = scenario.fixed && fixes.has(scenario.fixed);
  if (before) {
    const d = diff(before.snap, after[0].snap);
    if (proves) ok(d, `before ≠ after, намеренно (${scenario.fixed})`);
    else ok(!d, `before == after${d ? `\n      ${d}` : ''}`);
  }
  if (scenario.expect) {
    report(scenario.expect(after[0].snap, after[0].tree, after[0].notes), { before: false });
    if (before && proves) {
      const pairs = scenario.expect(before.snap, before.tree, before.notes);
      ok(
        pairs.some(([, passed]) => !passed),
        `падает до фикса (${scenario.fixed}): ${
          pairs
            .filter(([, p]) => !p)
            .map(([l]) => l)
            .join('; ') || 'ничего не упало'
        }`,
      );
    }
  }

  const { cash, earned, open } = after[0].snap;
  const identity = cash.total - open.advance === earned.total;
  console.log(
    `   ${identity ? '=' : '≠'} cash − advance ${identity ? '=' : '≠'} earned` +
      (scenario.real === null
        ? '   real: невідомо (ціни немає)'
        : `   ledger ${uah(cash.total)} vs real ${uah(scenario.real)}` +
          (cash.total === scenario.real ? '' : '  ← known drift')),
  );
  return { name: scenario.name, changed: before ? !!diff(before.snap, after[0].snap) : null };
}

async function checkPastPaidAt(tree) {
  const t = viaIntents(tree);
  const s = await t.addStudent('Минуле', 0, PRICE);
  t.apply('balance.pay', { studentId: s, lessons: 5 }, '2024-02-10T10:00:00.000Z');
  t.apply('balance.adjust', { studentId: s, lessons: -1 }, '2024-05-03T09:30:00.000Z');
  await viaHandlers(tree).pay(s, 1);
  // A debt paid through an intent recorded in Q3 2024 belongs to Q3 2024
  const d = await t.addStudent('Борг', 0, PRICE);
  const [debt] = await given(t, d, 1, 3);
  t.apply('lesson.togglePayment', { lessonId: debt }, '2024-08-15T12:00:00.000Z');

  const cash = (from, to) => tree.db.getCashStats(from, to).total;
  const q1 = cash('2024-01-01T00:00:00.000Z', '2024-04-01T00:00:00.000Z');
  const q2 = cash('2024-04-01T00:00:00.000Z', '2024-07-01T00:00:00.000Z');
  const q3 = cash('2024-07-01T00:00:00.000Z', '2024-10-01T00:00:00.000Z');
  const year = new Date().getUTCFullYear();
  const thisYear = cash(`${year}-01-01T00:00:00.000Z`, FAR);
  const paidAt = tree.raw
    .prepare('SELECT paid_at FROM payment_bundles ORDER BY id')
    .all()
    .map((r) => r.paid_at);
  console.log(`   2024 Q1 ${uah(q1)}  Q2 ${uah(q2)}  Q3 ${uah(q3)}  ${year} ${uah(thisYear)}`);
  console.log(`   paid_at: ${paidAt.join(' | ')}`);
  return [
    ['оплата и возврат легли в свои кварталы 2024', q1 === 250000 && q2 === -50000],
    ['IPC-оплата без paidAt осталась в текущем периоде', thisYear === 50000],
    [
      "paid_at в формате datetime('now')",
      paidAt.every((p) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p)),
    ],
    [
      '💵 по намерению из Q3 2024 лёг в Q3 2024',
      q3 === 50000 && paidAt[3] === '2024-08-15 12:00:00',
      'BUG-8',
    ],
  ];
}

async function checkIntents(tree) {
  const pairs = [];
  const t = viaIntents(tree);
  const s = await t.addStudent('Ідемпотентність', 0, PRICE);
  const now = new Date().toISOString();

  const intent = {
    id: 'pay-once',
    type: 'balance.pay',
    payload: { studentId: s, lessons: 5 },
    createdAt: now,
    source: 'ledger-check',
  };
  pairs.push(['первое применение: applied', tree.intents.apply(intent).status === 'applied']);
  const after = snapshot(tree);
  const again = tree.intents.apply(intent);
  pairs.push([
    'второе применение: duplicate',
    again.status === 'duplicate' && again.previous.status === 'applied',
  ]);
  const forged = tree.intents.apply({ ...intent, payload: { studentId: s, lessons: 50 } });
  pairs.push(['тот же id с другим payload: duplicate', forged.status === 'duplicate']);
  pairs.push(['после повторов база не изменилась', !diff(after, snapshot(tree))]);

  // Fixtures for the rejections
  const [done] = await given(t, s, 1, 0);
  const ghost = await t.addStudent('Привид', 0, PRICE);
  const [ghostLesson] = await given(t, ghost, 1, 1);
  tree.db.deleteStudent(ghost);
  const noPrice = await t.addStudent('Без ціни', 0, null);
  const [unpriced] = await given(t, noPrice, 1, 2);

  const cases = [
    ['ученик удалён', 'balance.pay', { studentId: ghost, lessons: 1 }, 'Учня видалено'],
    [
      'урок не найден',
      'lesson.complete',
      { lessonId: 9999, isCompleted: true },
      'Урок не знайдено',
    ],
    ['слот занят', 'lesson.add', { studentId: s, datetime: at(0) }, 'Цей час уже зайнято'],
    [
      'урок уже проведён',
      'lesson.complete',
      { lessonId: done, isCompleted: true },
      'Урок уже проведено',
    ],
    [
      'перенос проведённого',
      'lesson.move',
      { lessonId: done, datetime: at(9) },
      'Урок уже проведено',
    ],
    ['урок уже оплачен', 'lesson.togglePayment', { lessonId: done }, 'Урок уже оплачено'],
    [
      'пополнение без цены',
      'balance.pay',
      { studentId: noPrice, lessons: 1 },
      'Вкажіть ціну уроку, щоб записати оплату',
      'BUG-2',
    ],
    [
      '💵 без цены',
      'lesson.togglePayment',
      { lessonId: unpriced },
      'Вкажіть ціну уроку, щоб записати оплату',
      'BUG-2',
    ],
    [
      'нечего снимать',
      'balance.adjust',
      { studentId: noPrice, lessons: -1 },
      'Немає оплачених уроків, які можна зняти',
      'BUG-9',
    ],
    [
      'ученик с балансом без цены',
      'student.add',
      { name: 'Без ціни', balance: 2 },
      'Вкажіть ціну уроку, щоб записати оплату',
      'BUG-3',
    ],
  ];
  for (const [label, type, payload, reason, fixed] of cases) {
    const before = snapshot(tree);
    const id = randomUUID();
    const outcome = tree.intents.apply({
      id,
      type,
      payload,
      createdAt: now,
      source: 'ledger-check',
    });
    const repeat = tree.intents.apply({
      id,
      type,
      payload,
      createdAt: now,
      source: 'ledger-check',
    });
    pairs.push([
      `${label}: ${outcome.status} «${outcome.reason}», повтор ${repeat.status}, база без изменений`,
      outcome.status === 'rejected' &&
        outcome.reason === reason &&
        repeat.status === 'duplicate' &&
        !diff(before, snapshot(tree)),
      fixed,
    ]);
  }

  // 0 is a valid price: the student is created with it and their payments are 0 ₴
  const zero = tree.intents.apply({
    id: randomUUID(),
    type: 'student.add',
    payload: { name: 'Нуль', balance: 0, priceKopiyky: 0 },
    createdAt: now,
  });
  pairs.push([
    `ученик с ценой 0: ${zero.status}, цена записана`,
    zero.status === 'applied' && tree.db.getStudentCurrentPrice(zero.result.id)?.price === 0,
    'PRICE-0',
  ]);

  // A deleted student's debt can still be paid; the bundle simply has no owner
  const orphan = tree.intents.apply({
    id: randomUUID(),
    type: 'lesson.togglePayment',
    payload: { lessonId: ghostLesson },
    createdAt: now,
  });
  pairs.push([
    '💵 на уроке удалённого ученика: applied, бандл без владельца',
    orphan.status === 'applied' &&
      tree.raw.prepare('SELECT COUNT(*) AS n FROM payment_bundles WHERE student_id IS NULL').get()
        .n === 1,
    'BUG-1',
  ]);

  // Lessons take time, so a slot is an interval: 50 minutes, 30 for a trial
  const shift = (iso, minutes) => new Date(Date.parse(iso) + minutes * 60e3).toISOString();
  const scheduled = t.apply('lesson.add', { studentId: s, datetime: at(6) }).id;
  const overlaps = [
    [
      'урок через 30 хв після початку заняття',
      'lesson.add',
      { studentId: s, datetime: shift(at(0), 30) },
    ],
    [
      'пробний за 20 хв до заняття',
      'lesson.add',
      { datetime: shift(at(0), -20), isTrial: true, studentName: 'Проба' },
    ],
    [
      'перенос на 20 хв після початку заняття',
      'lesson.move',
      { lessonId: scheduled, datetime: shift(at(0), 20) },
    ],
  ];
  for (const [label, type, payload] of overlaps) {
    const before = snapshot(tree);
    const outcome = tree.intents.apply({ id: randomUUID(), type, payload, createdAt: now });
    pairs.push([
      `${label}: ${outcome.status} «${outcome.reason}»`,
      outcome.status === 'rejected' &&
        outcome.reason === 'Цей час уже зайнято' &&
        !diff(before, snapshot(tree)),
      'OVERLAP',
    ]);
  }
  const edges = [
    [
      'пробний, що закінчується рівно на початку заняття',
      { datetime: shift(at(0), -30), isTrial: true, studentName: 'Проба' },
    ],
    [
      'урок, що закінчується рівно на початку пробного',
      { studentId: s, datetime: shift(at(0), -80) },
    ],
  ];
  for (const [label, payload] of edges) {
    const outcome = tree.intents.apply({
      id: randomUUID(),
      type: 'lesson.add',
      payload,
      createdAt: now,
    });
    pairs.push([`${label}: ${outcome.status}`, outcome.status === 'applied']);
  }

  const malformed = [
    ['дробные копейки', 'balance.pay', { studentId: s, lessons: 1, totalPriceKopiyky: 12.5 }],
    ['datetime без Z', 'lesson.add', { studentId: s, datetime: '2030-01-01T10:00:00' }],
    ['отрицательный стартовый баланс', 'student.add', { name: 'Мінус', balance: -2 }],
    ['неизвестный тип', 'lesson.pay', { lessonId: done }],
  ];
  for (const [label, type, payload] of malformed) {
    const before = snapshot(tree);
    const outcome = tree.intents.apply({ id: randomUUID(), type, payload, createdAt: now });
    pairs.push([
      `${label}: rejected «${outcome.reason}»`,
      outcome.status === 'rejected' && !diff(before, snapshot(tree)),
    ]);
  }

  // A trial lesson without a name: refused like the desktop form does, and remembered
  {
    const before = snapshot(tree);
    const intent = {
      id: randomUUID(),
      type: 'lesson.add',
      payload: { datetime: shift(at(0), 120), isTrial: true, studentName: '  ' },
      createdAt: now,
    };
    const outcome = tree.intents.apply(intent);
    const repeat = tree.intents.apply(intent);
    pairs.push([
      `пробний без імені: ${outcome.status} «${outcome.reason}», повтор ${repeat.status}`,
      outcome.status === 'rejected' &&
        outcome.reason === "Вкажіть ім'я" &&
        repeat.status === 'duplicate' &&
        !diff(before, snapshot(tree)),
    ]);
  }

  // A failure inside the action: rolled back, not remembered, so a retry can succeed
  const original = tree.db.recordBalanceChange;
  tree.db.recordBalanceChange = () => {
    throw new Error('disk full (simulated)');
  };
  const before = snapshot(tree);
  const failing = {
    id: 'retry-me',
    type: 'balance.pay',
    payload: { studentId: s, lessons: 2 },
    createdAt: now,
  };
  const failed = tree.intents.apply(failing);
  const untouched = !diff(before, snapshot(tree));
  tree.db.recordBalanceChange = original;
  const retried = tree.intents.apply(failing);
  pairs.push([
    `сбой внутри действия: ${failed.status} «${failed.reason}», база без изменений, повтор после починки: ${retried.status}`,
    failed.status === 'failed' && untouched && retried.status === 'applied',
  ]);
  return pairs;
}

async function checkRollback(tree) {
  const t = viaHandlers(tree);
  const s = await t.addStudent('Відкат', 0, PRICE);
  const original = tree.db.recordBalanceChange;
  tree.db.recordBalanceChange = () => {
    throw new Error('disk full (simulated)');
  };
  const threw = (await t.attempt(() => t.pay(s, 5))) !== null;
  tree.db.recordBalanceChange = original;
  const { balance } = tree.raw.prepare('SELECT balance FROM students WHERE id = ?').get(s);
  const bundles = tree.raw.prepare('SELECT COUNT(*) AS n FROM payment_bundles').get().n;
  console.log(`   threw ${threw}, balance ${balance}, bundles ${bundles}`);
  return [['транзакция откатила всё', threw && balance === 0 && bundles === 0]];
}

// # MAIN

async function main() {
  const args = process.argv.slice(2);
  const afterDir = path.resolve(__dirname, '..', 'main');
  const beforeArg = args[args.indexOf('--before') + 1];
  const fixedArg = args[args.indexOf('--fixed') + 1];
  if (args.includes('--fixed') && fixedArg) {
    for (const tag of fixedArg.split(',')) fixes.add(tag.trim());
  }
  const beforeDir =
    args.includes('--before') && beforeArg
      ? fs.existsSync(path.join(path.resolve(beforeArg), 'main.js'))
        ? path.resolve(beforeArg)
        : path.join(path.resolve(beforeArg), 'main')
      : null;

  const trees = [];
  if (beforeDir) {
    trees.push({ label: 'before/handlers', mainDir: beforeDir, driver: viaHandlers, before: true });
  }
  trees.push({ label: 'after/handlers', mainDir: afterDir, driver: viaHandlers, before: false });
  trees.push({ label: 'after/intents', mainDir: afterDir, driver: viaIntents, before: false });

  console.log(`after:  ${afterDir}`);
  if (beforeDir) console.log(`before: ${beforeDir}`);

  const outcomes = [];
  for (const scenario of scenarios) outcomes.push(await runScenario(scenario, trees));

  const checks = [
    ['сбой посреди pay-for-lessons (recordBalanceChange бросает)', checkRollback],
    ['намерение с createdAt в прошлом: paid_at попадает в тот период', checkPastPaidAt],
    ['повторное применение и отказы намерений: база не меняется', checkIntents],
  ];
  for (const [title, check] of checks) {
    console.log(`\n${title}`);
    const tree = await loadTree(afterDir);
    if (check !== checkRollback && !tree.intents) continue;
    report(await check(tree), { before: false });
    if (beforeDir) {
      const old = await loadTree(beforeDir);
      if (check === checkRollback || old.intents) report(await check(old), { before: true });
    }
  }

  if (beforeDir) {
    const changed = outcomes.filter((o) => o.changed).map((o) => o.name);
    console.log(
      `\nсценарии, изменившиеся относительно before: ${changed.length ? changed.join('; ') : 'ни одного'}`,
    );
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
