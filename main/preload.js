const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Students
    getStudents: () => ipcRenderer.invoke('db:get-students'),
    addStudent: (name, balance) => ipcRenderer.invoke('db:add-student', name, balance),
    updateBalance: (studentId, amount) =>
        ipcRenderer.invoke('db:update-balance', studentId, amount),
    markUnpaidLessonsPaid: (studentId, count) =>
        ipcRenderer.invoke('db:mark-unpaid-lessons-paid', studentId, count),
    deleteStudent: (studentId) => ipcRenderer.invoke('db:delete-student', studentId),

    // Lessons
    getLessons: (startDate, endDate) => ipcRenderer.invoke('db:get-lessons', startDate, endDate),
    addLesson: (data) => ipcRenderer.invoke('db:add-lesson', data),
    updateLesson: (id, updates) => ipcRenderer.invoke('db:update-lesson', id, updates),
    toggleLessonPayment: (id) => ipcRenderer.invoke('db:toggle-lesson-payment', id),
    deleteLesson: (id) => ipcRenderer.invoke('db:delete-lesson', id),

    // Schedules
    getSchedules: (studentId) => ipcRenderer.invoke('db:get-schedules', studentId),
    addSchedule: (studentId, dayOfWeek, time) =>
        ipcRenderer.invoke('db:add-schedule', studentId, dayOfWeek, time),
    deleteSchedule: (scheduleId) => ipcRenderer.invoke('db:delete-schedule', scheduleId),
    toggleScheduleActive: (scheduleId) =>
        ipcRenderer.invoke('db:toggle-schedule-active', scheduleId),
    autoCreateLessons: (studentId) => ipcRenderer.invoke('db:auto-create-lessons', studentId),

    // Sync
    syncLessons: () => ipcRenderer.invoke('db:sync-lessons'),
});
