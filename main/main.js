const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./database');
const logger = require('./logger');

let mainWindow;

function createWindow() {
    logger.info('Creating main window');

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, '../build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.maximize();

    if (process.env.NODE_ENV === 'development') {
        logger.debug('Loading development URL');
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        logger.debug('Loading production file');
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        logger.error('Window failed to load', { errorCode, errorDescription });
    });

    mainWindow.webContents.on('crashed', () => {
        logger.error('Window crashed');
    });

    logger.info('Main window created successfully');
}

app.whenReady().then(() => {
    logger.info('Application ready', {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
    });

    try {
        db.initDatabase();
        db.syncCompletedLessons();
        db.autoCreateLessonsForAllStudents();
    } catch (error) {
        logger.error('Startup initialization failed', {
            error: error.message,
            stack: error.stack,
        });

        const { dialog } = require('electron');
        dialog.showErrorBox('Database Error', `Failed to initialize database: ${error.message}`);
    }

    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            logger.info('Reactivating application (macOS)');
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    logger.info('All windows closed');
    if (process.platform !== 'darwin') {
        logger.info('Quitting application');
        app.quit();
    }
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
    });

    const { dialog } = require('electron');
    dialog.showErrorBox('Error', `An error occurred: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
        reason: reason,
        promise: promise,
    });
});

function registerIpcHandlers() {
    logger.debug('Registering IPC handlers');

    // Students
    ipcMain.handle('db:get-students', async () => {
        logger.debug('IPC: get-students');
        try {
            const result = db.getStudents();
            logger.debug('IPC: get-students completed', { count: result.length });
            return result;
        } catch (error) {
            logger.error('IPC: get-students failed', { error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:add-student', async (_, name, balance) => {
        logger.info('IPC: add-student', { name, balance });
        try {
            const result = db.addStudent(name, balance);
            logger.info('IPC: add-student completed', { id: result.id });
            return result;
        } catch (error) {
            logger.error('IPC: add-student failed', { name, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:update-balance', async (_, studentId, amount) => {
        logger.info('IPC: update-balance', { studentId, amount });
        try {
            db.updateStudentBalance(studentId, amount);
            logger.info('IPC: update-balance completed', { studentId, amount });
        } catch (error) {
            logger.error('IPC: update-balance failed', { studentId, amount, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:mark-unpaid-lessons-paid', async (_, studentId, count) => {
        logger.info('IPC: mark-unpaid-lessons-paid', { studentId, count });
        try {
            db.markOldestUnpaidLessonsAsPaid(studentId, count);
            logger.info('IPC: mark-unpaid-lessons-paid completed', { studentId, count });
        } catch (error) {
            logger.error('IPC: mark-unpaid-lessons-paid failed', {
                studentId,
                count,
                error: error.message,
            });
            throw error;
        }
    });

    ipcMain.handle('db:delete-student', async (_, studentId) => {
        logger.info('IPC: delete-student', { studentId });
        try {
            db.deleteStudent(studentId);
            logger.info('IPC: delete-student completed', { studentId });
        } catch (error) {
            logger.error('IPC: delete-student failed', { studentId, error: error.message });
            throw error;
        }
    });

    // Lessons
    ipcMain.handle('db:get-lessons', async (_, startDate, endDate) => {
        logger.debug('IPC: get-lessons', { startDate, endDate });
        try {
            const result = db.getLessons(startDate, endDate);
            logger.debug('IPC: get-lessons completed', { count: result.length });
            return result;
        } catch (error) {
            logger.error('IPC: get-lessons failed', { startDate, endDate, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:add-lesson', async (_, data) => {
        logger.info('IPC: add-lesson', { data });
        try {
            const result = db.addLesson(
                data.studentId,
                data.datetime,
                data.isPaid,
                data.isCompleted,
            );
            logger.info('IPC: add-lesson completed', { id: result.id });
            return result;
        } catch (error) {
            logger.error('IPC: add-lesson failed', { data, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:update-lesson', async (_, id, updates) => {
        logger.info('IPC: update-lesson', { id, updates });
        try {
            db.updateLesson(id, updates);
            logger.info('IPC: update-lesson completed', { id });
        } catch (error) {
            logger.error('IPC: update-lesson failed', { id, updates, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:toggle-lesson-payment', async (_, id) => {
        logger.info('IPC: toggle-lesson-payment', { id });
        try {
            db.toggleLessonPayment(id);
            logger.info('IPC: toggle-lesson-payment completed', { id });
        } catch (error) {
            logger.error('IPC: toggle-lesson-payment failed', { id, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:delete-lesson', async (_, id) => {
        logger.info('IPC: delete-lesson', { id });
        try {
            db.deleteLesson(id);
            logger.info('IPC: delete-lesson completed', { id });
        } catch (error) {
            logger.error('IPC: delete-lesson failed', { id, error: error.message });
            throw error;
        }
    });

    // Schedules
    ipcMain.handle('db:get-schedules', async (_, studentId) => {
        logger.debug('IPC: get-schedules', { studentId });
        try {
            const result = db.getSchedules(studentId);
            logger.debug('IPC: get-schedules completed', { studentId, count: result.length });
            return result;
        } catch (error) {
            logger.error('IPC: get-schedules failed', { studentId, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:add-schedule', async (_, studentId, dayOfWeek, time) => {
        logger.info('IPC: add-schedule', { studentId, dayOfWeek, time });
        try {
            const result = db.addSchedule(studentId, dayOfWeek, time);
            logger.info('IPC: add-schedule completed', { id: result.id });
            return result;
        } catch (error) {
            logger.error('IPC: add-schedule failed', {
                studentId,
                dayOfWeek,
                time,
                error: error.message,
            });
            throw error;
        }
    });

    ipcMain.handle('db:delete-schedule', async (_, scheduleId) => {
        logger.info('IPC: delete-schedule', { scheduleId });
        try {
            db.deleteSchedule(scheduleId);
            logger.info('IPC: delete-schedule completed', { scheduleId });
        } catch (error) {
            logger.error('IPC: delete-schedule failed', { scheduleId, error: error.message });
            throw error;
        }
    });

    ipcMain.handle('db:toggle-schedule-active', async (_, scheduleId) => {
        logger.info('IPC: toggle-schedule-active', { scheduleId });
        try {
            db.toggleScheduleActive(scheduleId);
            logger.info('IPC: toggle-schedule-active completed', { scheduleId });
        } catch (error) {
            logger.error('IPC: toggle-schedule-active failed', {
                scheduleId,
                error: error.message,
            });
            throw error;
        }
    });

    ipcMain.handle('db:auto-create-lessons', async (_, studentId) => {
        logger.info('IPC: auto-create-lessons', { studentId });
        try {
            const result = db.autoCreateLessons(studentId);
            logger.info('IPC: auto-create-lessons completed', { studentId, created: result });
            return result;
        } catch (error) {
            logger.error('IPC: auto-create-lessons failed', { studentId, error: error.message });
            throw error;
        }
    });

    // Sync
    ipcMain.handle('db:sync-lessons', async () => {
        logger.info('IPC: sync-lessons');
        try {
            const result = db.syncCompletedLessons();
            logger.info('IPC: sync-lessons completed', { syncedCount: result });
            return result;
        } catch (error) {
            logger.error('IPC: sync-lessons failed', { error: error.message });
            throw error;
        }
    });

    logger.debug('IPC handlers registered successfully');
}
