const { contextBridge, ipcRenderer } = require('electron');

/** Listens on a main → renderer channel; returns the unsubscribe. */
const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electron', {
  // Students
  getStudents: () => ipcRenderer.invoke('db:get-students'),
  addStudent: (name, balance, price, isTaxExempt, discount) =>
    ipcRenderer.invoke('db:add-student', name, balance, price, isTaxExempt, discount),
  updateBalance: (studentId, amount) => ipcRenderer.invoke('db:update-balance', studentId, amount),
  payForLessons: (studentId, amount, totalPriceKopiyky) =>
    ipcRenderer.invoke('db:pay-for-lessons', studentId, amount, totalPriceKopiyky),
  markUnpaidLessonsPaid: (studentId, count) =>
    ipcRenderer.invoke('db:mark-unpaid-lessons-paid', studentId, count),
  setStudentTaxExempt: (studentId, exempt) =>
    ipcRenderer.invoke('db:set-student-tax-exempt', studentId, exempt),
  updateStudentName: (studentId, name) =>
    ipcRenderer.invoke('db:update-student-name', studentId, name),
  getStudentAdvance: (studentId) => ipcRenderer.invoke('db:get-student-advance', studentId),
  deleteStudent: (studentId, refundAdvance) =>
    ipcRenderer.invoke('db:delete-student', studentId, refundAdvance),

  // Lesson prices
  setStudentPrice: (studentId, priceKopiyky) =>
    ipcRenderer.invoke('db:set-student-price', studentId, priceKopiyky),
  getStudentCurrentPrice: (studentId) =>
    ipcRenderer.invoke('db:get-student-current-price', studentId),
  getStudentPriceHistory: (studentId) =>
    ipcRenderer.invoke('db:get-student-price-history', studentId),
  deleteStudentPrice: (priceId) => ipcRenderer.invoke('db:delete-student-price', priceId),

  // Discounts
  getDiscounts: (studentId) => ipcRenderer.invoke('db:get-discounts', studentId),
  getGlobalDiscounts: () => ipcRenderer.invoke('db:get-global-discounts'),
  addDiscount: (studentId, lessonsCount, totalPriceKopiyky, description) =>
    ipcRenderer.invoke('db:add-discount', studentId, lessonsCount, totalPriceKopiyky, description),
  deleteDiscount: (discountId) => ipcRenderer.invoke('db:delete-discount', discountId),
  toggleDiscountActive: (discountId) => ipcRenderer.invoke('db:toggle-discount-active', discountId),
  findApplicableDiscount: (studentId, count) =>
    ipcRenderer.invoke('db:find-applicable-discount', studentId, count),

  // Tax settings
  getTaxSettings: () => ipcRenderer.invoke('db:get-tax-settings'),
  saveTaxSettings: (settings) => ipcRenderer.invoke('db:save-tax-settings', settings),

  // Financial stats
  getEarningsStats: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-earnings-stats', startDate, endDate),
  getEarningsByDay: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-earnings-by-day', startDate, endDate),
  getEarningsByStudent: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-earnings-by-student', startDate, endDate),
  getCashStats: (startDate, endDate) => ipcRenderer.invoke('db:get-cash-stats', startDate, endDate),
  getCashByDay: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-cash-by-day', startDate, endDate),
  getCashByStudent: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-cash-by-student', startDate, endDate),
  getBalanceTotals: (asOf) => ipcRenderer.invoke('db:get-balance-totals', asOf),
  getBalanceHistory: (startDate, endDate) =>
    ipcRenderer.invoke('db:get-balance-history', startDate, endDate),

  // Lessons
  getLessons: (startDate, endDate) => ipcRenderer.invoke('db:get-lessons', startDate, endDate),
  addLesson: (data) => ipcRenderer.invoke('db:add-lesson', data),
  updateLesson: (id, updates) => ipcRenderer.invoke('db:update-lesson', id, updates),
  toggleLessonPayment: (id) => ipcRenderer.invoke('db:toggle-lesson-payment', id),
  deleteLesson: (id) => ipcRenderer.invoke('db:delete-lesson', id),

  // Schedules
  getSchedules: (studentId) => ipcRenderer.invoke('db:get-schedules', studentId),
  getWeeklyScheduleCounts: () => ipcRenderer.invoke('db:get-weekly-schedule-counts'),
  addSchedule: (studentId, dayOfWeek, time) =>
    ipcRenderer.invoke('db:add-schedule', studentId, dayOfWeek, time),
  deleteSchedule: (scheduleId) => ipcRenderer.invoke('db:delete-schedule', scheduleId),
  toggleScheduleActive: (scheduleId) => ipcRenderer.invoke('db:toggle-schedule-active', scheduleId),
  autoCreateLessons: (studentId) => ipcRenderer.invoke('db:auto-create-lessons', studentId),

  // Sync
  syncLessons: () => ipcRenderer.invoke('db:sync-lessons'),

  // Cloud sync
  getSyncSettings: () => ipcRenderer.invoke('sync:get-settings'),
  pairSync: (code) => ipcRenderer.invoke('sync:pair', code),
  disableSync: () => ipcRenderer.invoke('sync:disable'),
  getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  takeSyncChanges: () => ipcRenderer.invoke('sync:take-changes'),
  getSyncHistory: () => ipcRenderer.invoke('sync:get-history'),
  onSyncChanged: (callback) => subscribe('sync:changed', callback),
  onSyncStatus: (callback) => subscribe('sync:status', callback),

  // Updates
  getReleaseNotes: () => ipcRenderer.invoke('app:get-release-notes'),
});
