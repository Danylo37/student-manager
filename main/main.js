const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.maximize();

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    db.initDatabase();

    db.syncCompletedLessons();

    registerIpcHandlers();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function registerIpcHandlers() {
    // Students
    ipcMain.handle('db:get-students', () => db.getStudents());
    ipcMain.handle('db:add-student', (_, name) => db.addStudent(name));
    ipcMain.handle('db:update-balance', (_, studentId, amount) =>
        db.updateStudentBalance(studentId, amount),
    );
    ipcMain.handle('db:delete-student', (_, studentId) => db.deleteStudent(studentId));

    // Lessons
    ipcMain.handle('db:get-lessons', (_, startDate, endDate) => db.getLessons(startDate, endDate));
    ipcMain.handle('db:add-lesson', (_, data) =>
        db.addLesson(data.studentId, data.datetime, data.isPaid, data.isCompleted),
    );
    ipcMain.handle('db:update-lesson', (_, id, updates) => db.updateLesson(id, updates));
    ipcMain.handle('db:delete-lesson', (_, id) => db.deleteLesson(id));

    // Schedules
    ipcMain.handle('db:get-schedules', (_, studentId) => db.getSchedules(studentId));
    ipcMain.handle('db:add-schedule', (_, studentId, dayOfWeek, time) =>
        db.addSchedule(studentId, dayOfWeek, time),
    );
    ipcMain.handle('db:delete-schedule', (_, scheduleId) => db.deleteSchedule(scheduleId));
    ipcMain.handle('db:auto-create-lessons', (_, studentId) => db.autoCreateLessons(studentId));

    // Sync
    ipcMain.handle('db:sync-lessons', () => db.syncCompletedLessons());
}
