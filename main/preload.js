const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Students
    getStudents: () => ipcRenderer.invoke('db:get-students'),
    addStudent: (name) => ipcRenderer.invoke('db:add-student', name),
    updateBalance: (studentId, amount) =>
        ipcRenderer.invoke('db:update-balance', studentId, amount),
    deleteStudent: (studentId) => ipcRenderer.invoke('db:delete-student', studentId),

    // Lessons
    getLessons: (startDate, endDate) => ipcRenderer.invoke('db:get-lessons', startDate, endDate),
    addLesson: (data) => ipcRenderer.invoke('db:add-lesson', data),
    updateLesson: (id, updates) => ipcRenderer.invoke('db:update-lesson', id, updates),
    deleteLesson: (id) => ipcRenderer.invoke('db:delete-lesson', id),

    // Sync
    syncLessons: () => ipcRenderer.invoke('db:sync-lessons'),
});
