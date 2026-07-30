const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database');
const logger = require('./logger');

let mainWindow;

function createWindow() {
  const iconPath =
    process.platform === 'win32'
      ? path.join(__dirname, '../build/icon.ico')
      : path.join(__dirname, '../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.maximize();

  if (process.env.NODE_ENV === 'development') {
    mainWindow
      .loadURL('http://localhost:5173')
      .catch((e) => logger.error('Failed to load dev URL', { error: e.message }));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow
      .loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
      .catch((e) => logger.error('Failed to load prod file', { error: e.message }));
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) =>
    logger.error('Window failed to load', { code, desc }),
  );
  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    logger.error('Renderer process gone', details),
  );
}

app.whenReady().then(() => {
  logger.info('Application ready', {
    version: app.getVersion(),
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
  });

  try {
    db.initDatabase();
    db.syncCompletedLessons();
    db.autoCreateLessonsForAllStudents();
  } catch (error) {
    logger.error('Startup initialization failed', { error: error.message });
    const { dialog } = require('electron');
    dialog.showErrorBox('Database Error', `Failed to initialize database: ${error.message}`);
  }

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  const { dialog } = require('electron');
  dialog.showErrorBox('Error', `An error occurred: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

// ─────────────────────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (...args) => {
      try {
        return fn(...args);
      } catch (e) {
        logger.error(`IPC ${channel} failed`, { error: e.message });
        throw e;
      }
    });
  };

  // ── Students ──────────────────────────────────────────────────────────────
  handle('db:get-students', () => db.getStudents());
  handle('db:add-student', (_, name, balance, price) =>
    db.addStudent(name, balance, price ?? null),
  );
  handle('db:update-balance', (_, studentId, amount) => {
    db.updateStudentBalance(studentId, amount);
    if (amount > 0) db.createPaymentBundle(studentId, amount);
  });
  handle('db:pay-for-lessons', (_, studentId, amount, totalPriceKopiyky) => {
    // Explicit payment with known total (used when a discount applies)
    db.updateStudentBalance(studentId, amount);
    db.createPaymentBundle(studentId, amount, totalPriceKopiyky);
    db.markOldestUnpaidLessonsAsPaid(studentId, amount);
  });
  handle('db:mark-unpaid-lessons-paid', (_, studentId, count) =>
    db.markOldestUnpaidLessonsAsPaid(studentId, count),
  );
  handle('db:delete-student', (_, studentId) => db.deleteStudent(studentId));

  // ── Lesson prices ─────────────────────────────────────────────────────────
  handle('db:set-student-price', (_, studentId, price) => db.setStudentPrice(studentId, price));
  handle('db:get-student-current-price', (_, studentId) => db.getStudentCurrentPrice(studentId));
  handle('db:get-student-price-history', (_, studentId) => db.getStudentPriceHistory(studentId));
  handle('db:delete-student-price', (_, priceId) => db.deleteStudentPrice(priceId));

  // ── Discounts ─────────────────────────────────────────────────────────────
  handle('db:get-discounts', (_, studentId) => db.getDiscounts(studentId));
  handle('db:get-global-discounts', () => db.getGlobalDiscounts());
  handle('db:add-discount', (_, studentId, count, total, desc) =>
    db.addDiscount(studentId, count, total, desc),
  );
  handle('db:delete-discount', (_, id) => db.deleteDiscount(id));
  handle('db:toggle-discount-active', (_, id) => db.toggleDiscountActive(id));
  handle('db:find-applicable-discount', (_, studentId, count) =>
    db.findApplicableDiscount(studentId, count),
  );

  // ── Tax settings ──────────────────────────────────────────────────────────
  handle('db:get-tax-settings', () => db.getTaxSettings());
  handle('db:save-tax-settings', (_, s) => db.saveTaxSettings(s));

  // ── Financial stats ───────────────────────────────────────────────────────
  handle('db:get-earnings-stats', (_, s, e) => db.getEarningsStats(s, e));
  handle('db:get-earnings-by-day', (_, s, e) => db.getEarningsByDay(s, e));
  handle('db:get-earnings-by-student', (_, s, e) => db.getEarningsByStudent(s, e));
  handle('db:get-earnings-date-range', () => db.getEarningsDateRange());

  // ── Lessons ───────────────────────────────────────────────────────────────
  handle('db:get-lessons', (_, s, e) => db.getLessons(s, e));
  handle('db:add-lesson', (_, data) =>
    db.addLesson(data.studentId, data.datetime, data.isPaid, data.isCompleted),
  );
  handle('db:update-lesson', (_, id, updates) => db.updateLesson(id, updates));
  handle('db:toggle-lesson-payment', (_, id) => db.toggleLessonPayment(id));
  handle('db:delete-lesson', (_, id) => db.deleteLesson(id));

  // ── Schedules ─────────────────────────────────────────────────────────────
  handle('db:get-schedules', (_, studentId) => db.getSchedules(studentId));
  handle('db:add-schedule', (_, studentId, day, time) => db.addSchedule(studentId, day, time));
  handle('db:delete-schedule', (_, id) => db.deleteSchedule(id));
  handle('db:toggle-schedule-active', (_, id) => db.toggleScheduleActive(id));
  handle('db:auto-create-lessons', (_, studentId) => db.autoCreateLessons(studentId));

  // ── Sync ──────────────────────────────────────────────────────────────────
  handle('db:sync-lessons', () => db.syncCompletedLessons());

  logger.debug('IPC handlers registered');
}
