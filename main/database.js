const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { LESSON_DURATION_MINUTES } = require('./constants');
const logger = require('./logger');

let db = null;

function initDatabase() {
    try {
        logger.info('Initializing database');

        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'students.db');

        logger.debug('Database path', { path: dbPath });

        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
            logger.debug('Created user data directory', { path: userDataPath });
        }

        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        logger.debug('Database connection established');

        let schemaPath;
        if (process.env.NODE_ENV === 'development') {
            schemaPath = path.join(__dirname, 'db', 'schema.sql');
        } else {
            schemaPath = path.join(process.resourcesPath, 'main', 'db', 'schema.sql');
        }

        logger.debug('Schema path', { path: schemaPath });

        if (!fs.existsSync(schemaPath)) {
            logger.error('Schema file not found', { path: schemaPath });
            throw new Error(`Schema file not found: ${schemaPath}`);
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);

        logger.info('Database initialized successfully');
        return db;
    } catch (error) {
        logger.error('Database initialization failed', {
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }
}

// === STUDENTS ===
function getStudents() {
    logger.debug('Fetching all students');

    try {
        const stmt = db.prepare(`
            SELECT
                s.*,
                COUNT(CASE WHEN l.is_completed = 1 THEN 1 END) as completed_lessons_count
            FROM students s
                     LEFT JOIN lessons l ON s.id = l.student_id
            GROUP BY s.id
            ORDER BY s.name
        `);
        const students = stmt.all();

        logger.debug('Students fetched successfully', { count: students.length });
        return students;
    } catch (error) {
        logger.error('Failed to fetch students', { error: error.message });
        throw error;
    }
}

function addStudent(name, balance) {
    logger.info('Adding student', { name, balance });

    try {
        const stmt = db.prepare('INSERT INTO students (name, balance) VALUES (?, ?)');
        const result = stmt.run(name, balance);

        logger.info('Student added successfully', {
            id: result.lastInsertRowid,
            name,
            balance,
        });

        return { id: result.lastInsertRowid, name, balance: balance };
    } catch (error) {
        logger.error('Failed to add student', {
            name,
            balance,
            error: error.message,
        });
        throw error;
    }
}

function getUnpaidCompletedLessons(studentId) {
    logger.debug('Fetching unpaid completed lessons', { studentId });

    const stmt = db.prepare(`
        SELECT id
        FROM lessons
        WHERE student_id = ?
          AND is_completed = 1
          AND is_paid = 0
        ORDER BY datetime ASC
    `);
    return stmt.all(studentId);
}

function markOldestUnpaidLessonsAsPaid(studentId, count) {
    if (count <= 0) {
        logger.debug('No lessons to mark as paid', { studentId, count });
        return;
    }

    logger.info('Marking unpaid lessons as paid', { studentId, count });

    const unpaidLessons = getUnpaidCompletedLessons(studentId);
    const lessonsToMark = unpaidLessons.slice(0, count);

    const markAsPaidStmt = db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?');

    for (const lesson of lessonsToMark) {
        markAsPaidStmt.run(lesson.id);
    }

    logger.info('Lessons marked as paid', {
        studentId,
        markedCount: lessonsToMark.length,
    });
}

function updateStudentBalance(studentId, amount) {
    logger.debug('Updating student balance', { studentId, amount });

    try {
        const stmt = db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?');
        stmt.run(amount, studentId);

        logger.debug('Student balance updated', { studentId, amount });
    } catch (error) {
        logger.error('Failed to update student balance', {
            studentId,
            amount,
            error: error.message,
        });
        throw error;
    }
}

function deleteStudent(studentId) {
    logger.info('Deleting student', { studentId });

    try {
        const stmt = db.prepare('DELETE FROM students WHERE id = ?');
        const result = stmt.run(studentId);

        logger.info('Student deleted successfully', {
            studentId,
            changes: result.changes,
        });
    } catch (error) {
        logger.error('Failed to delete student', {
            studentId,
            error: error.message,
        });
        throw error;
    }
}

// === LESSONS ===
function getLessons(startDate, endDate) {
    logger.debug('Fetching lessons', { startDate, endDate });

    try {
        const stmt = db.prepare(`
            SELECT l.*, s.name as student_name, s.balance
            FROM lessons l
                     JOIN students s ON l.student_id = s.id
            WHERE l.datetime >= ? AND l.datetime < ?
            ORDER BY l.datetime
        `);
        const lessons = stmt.all(startDate, endDate);

        logger.debug('Lessons fetched successfully', { count: lessons.length });
        return lessons;
    } catch (error) {
        logger.error('Failed to fetch lessons', {
            startDate,
            endDate,
            error: error.message,
        });
        throw error;
    }
}

function addLesson(studentId, datetime, isPaid, isCompleted) {
    logger.info('Adding lesson', { studentId, datetime, isPaid, isCompleted });

    try {
        const stmt = db.prepare(`
            INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(studentId, datetime, isPaid ? 1 : 0, isCompleted ? 1 : 0);

        // If lesson was completed, deduct 1 from student balance
        if (isCompleted) {
            updateStudentBalance(studentId, -1);
            logger.debug('Deducted balance for completed lesson', { studentId });
        }

        logger.info('Lesson added successfully', {
            id: result.lastInsertRowid,
            studentId,
            datetime,
        });

        return { id: result.lastInsertRowid };
    } catch (error) {
        logger.error('Failed to add lesson', {
            studentId,
            datetime,
            error: error.message,
        });
        throw error;
    }
}

function updateLesson(lessonId, updates) {
    logger.info('Updating lesson', { lessonId, updates });

    try {
        const current = db
            .prepare(
                `
                SELECT l.datetime, l.student_id, l.is_completed, l.is_paid, s.balance
                FROM lessons l
                JOIN students s ON l.student_id = s.id
                WHERE l.id = ?
            `,
            )
            .get(lessonId);

        if (!current) {
            logger.warn('Lesson not found for update', { lessonId });
            return;
        }

        const fields = [];
        const values = [];

        if (updates.is_completed !== undefined) {
            fields.push('is_completed = ?');
            values.push(updates.is_completed ? 1 : 0);
            logger.debug('Updating completion status', {
                lessonId,
                is_completed: updates.is_completed,
            });
        }

        if (updates.is_paid !== undefined) {
            fields.push('is_paid = ?');
            values.push(updates.is_paid ? 1 : 0);

            const completedButNoBalance = current && current.balance <= 0 && updates.is_completed;

            if (updates.is_paid || completedButNoBalance) {
                updateStudentBalance(current.student_id, -1);
                logger.debug('Decreased student balance', { studentId: current.student_id });
            } else {
                updateStudentBalance(current.student_id, 1);
                logger.debug('Increased student balance', { studentId: current.student_id });
            }
        }

        if (updates.datetime !== undefined) {
            // Store old datetime as previous_datetime
            fields.push('previous_datetime = ?');
            values.push(current.datetime);

            fields.push('datetime = ?');
            values.push(updates.datetime);

            logger.info('Lesson rescheduled', {
                lessonId,
                oldDatetime: current.datetime,
                newDatetime: updates.datetime,
            });
        }

        if (fields.length === 0) {
            logger.debug('No fields to update', { lessonId });
            return;
        }

        values.push(lessonId);
        const stmt = db.prepare(`UPDATE lessons SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        logger.info('Lesson updated successfully', { lessonId });
    } catch (error) {
        logger.error('Failed to update lesson', {
            lessonId,
            updates,
            error: error.message,
        });
        throw error;
    }
}

function toggleLessonPayment(lessonId) {
    logger.info('Toggling lesson payment', { lessonId });

    try {
        const lessonData = db
            .prepare(
                `
                SELECT l.id, l.is_completed, l.student_id, s.balance
                FROM lessons l
                JOIN students s ON l.student_id = s.id
                WHERE l.id = ?
            `,
            )
            .get(lessonId);

        if (!lessonData || !lessonData.is_completed) {
            logger.warn('Cannot toggle payment: lesson not found or not completed', {
                lessonId,
            });
            throw new Error('Lesson not found or not completed');
        }

        // Update payment status
        const updateStmt = db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?');
        updateStmt.run(lessonId);

        // Update balance only when marking as paid and balance < 0
        if (lessonData.balance < 0) {
            updateStudentBalance(lessonData.student_id, 1);
            logger.debug('Increased balance after payment', {
                studentId: lessonData.student_id,
            });
        }

        logger.info('Lesson payment toggled successfully', { lessonId });
    } catch (error) {
        logger.error('Failed to toggle lesson payment', {
            lessonId,
            error: error.message,
        });
        throw error;
    }
}

function deleteLesson(lessonId) {
    logger.info('Deleting lesson', { lessonId });

    try {
        // Get lesson data before deleting
        const lessonStmt = db.prepare('SELECT * FROM lessons WHERE id = ?');
        const lesson = lessonStmt.get(lessonId);

        if (!lesson) {
            logger.warn('Lesson not found for deletion', { lessonId });
            return;
        }

        // Delete lesson
        const deleteStmt = db.prepare('DELETE FROM lessons WHERE id = ?');
        deleteStmt.run(lessonId);

        // If lesson was completed, return 1 to balance
        if (lesson && lesson.is_completed) {
            updateStudentBalance(lesson.student_id, 1);
            logger.debug('Returned balance after lesson deletion', {
                studentId: lesson.student_id,
            });
        }

        logger.info('Lesson deleted successfully', { lessonId });
    } catch (error) {
        logger.error('Failed to delete lesson', {
            lessonId,
            error: error.message,
        });
        throw error;
    }
}

// === AUTO SYNC ===
function syncCompletedLessons() {
    const startTime = Date.now();
    logger.info('Starting lesson synchronization');

    const now = new Date();
    const thresholdTime = new Date(now.getTime() - LESSON_DURATION_MINUTES * 60 * 1000);
    const thresholdISO = thresholdTime.toISOString();

    const sync = db.transaction(() => {
        const stmt = db.prepare(`
            SELECT l.id, l.student_id, s.balance
            FROM lessons l
            JOIN students s ON l.student_id = s.id
            WHERE l.datetime < ? AND l.is_completed = 0
            ORDER BY l.datetime ASC
        `);
        const lessons = stmt.all(thresholdISO);

        if (lessons.length === 0) {
            logger.debug('No lessons to sync');
            return 0;
        }

        logger.info('Syncing completed lessons', { count: lessons.length });

        const lessonsWithBalance = [];
        const lessonsWithoutBalance = [];

        // Track current balance for each student as we process lessons
        const studentBalances = {};
        const balanceUpdates = {};

        lessons.forEach(({ id, student_id, balance }) => {
            // Initialize student balance if not yet tracked
            if (studentBalances[student_id] === undefined) {
                studentBalances[student_id] = balance;
            }

            // Check if student has balance at this moment (after previous lessons)
            if (studentBalances[student_id] > 0) {
                lessonsWithBalance.push(id);
                studentBalances[student_id] -= 1;
            } else {
                lessonsWithoutBalance.push(id);
            }

            // Track total balance change for this student
            balanceUpdates[student_id] = (balanceUpdates[student_id] || 0) - 1;
        });

        if (lessonsWithBalance.length > 0) {
            const placeholders = lessonsWithBalance.map(() => '?').join(',');
            const updatePaidStmt = db.prepare(`
                UPDATE lessons 
                SET is_completed = 1, is_paid = 1 
                WHERE id IN (${placeholders})
            `);
            updatePaidStmt.run(...lessonsWithBalance);
            logger.debug('Marked lessons as paid', { count: lessonsWithBalance.length });
        }

        if (lessonsWithoutBalance.length > 0) {
            const placeholders = lessonsWithoutBalance.map(() => '?').join(',');
            const updateCompletedStmt = db.prepare(`
                UPDATE lessons 
                SET is_completed = 1 
                WHERE id IN (${placeholders})
            `);
            updateCompletedStmt.run(...lessonsWithoutBalance);
            logger.debug('Marked lessons as completed (unpaid)', {
                count: lessonsWithoutBalance.length,
            });
        }

        const updateBalanceStmt = db.prepare(
            'UPDATE students SET balance = balance + ? WHERE id = ?',
        );

        for (const [studentId, amount] of Object.entries(balanceUpdates)) {
            updateBalanceStmt.run(amount, parseInt(studentId));
        }

        return lessons.length;
    });

    const count = sync();
    const duration = Date.now() - startTime;

    logger.info('Lesson synchronization completed', {
        count,
        durationMs: duration,
    });

    return count;
}

// === SCHEDULES ===
function getSchedules(studentId) {
    logger.debug('Fetching schedules', { studentId });

    try {
        const stmt = db.prepare(`
            SELECT * FROM schedules
            WHERE student_id = ?
            ORDER BY is_active DESC, day_of_week, time
        `);
        const schedules = stmt.all(studentId);

        logger.debug('Schedules fetched successfully', {
            studentId,
            count: schedules.length,
        });

        return schedules;
    } catch (error) {
        logger.error('Failed to fetch schedules', {
            studentId,
            error: error.message,
        });
        throw error;
    }
}

function addSchedule(studentId, dayOfWeek, time) {
    logger.info('Adding schedule', { studentId, dayOfWeek, time });

    try {
        // Check if schedule with same day and time already exists (active or inactive)
        const existingStmt = db.prepare(`
            SELECT id, is_active FROM schedules
            WHERE student_id = ? AND day_of_week = ? AND time = ?
        `);
        const existing = existingStmt.get(studentId, dayOfWeek, time);

        if (existing) {
            // If inactive schedule exists, reactivate it
            if (!existing.is_active) {
                const reactivateStmt = db.prepare(
                    'UPDATE schedules SET is_active = 1 WHERE id = ?',
                );
                reactivateStmt.run(existing.id);
                logger.info('Reactivated existing schedule', { id: existing.id });
                return { id: existing.id };
            }
            // If active schedule exists, throw error
            logger.warn('Schedule already exists', { studentId, dayOfWeek, time });
            throw new Error('Schedule with same day and time already exists');
        }

        const stmt = db.prepare(`
            INSERT INTO schedules (student_id, day_of_week, time, is_active)
            VALUES (?, ?, ?, 1)
        `);
        const result = stmt.run(studentId, dayOfWeek, time);

        logger.info('Schedule added successfully', {
            id: result.lastInsertRowid,
            studentId,
            dayOfWeek,
            time,
        });

        return { id: result.lastInsertRowid };
    } catch (error) {
        logger.error('Failed to add schedule', {
            studentId,
            dayOfWeek,
            time,
            error: error.message,
        });
        throw error;
    }
}

function deleteSchedule(scheduleId) {
    logger.info('Deleting schedule', { scheduleId });

    try {
        const stmt = db.prepare('DELETE FROM schedules WHERE id = ?');
        const result = stmt.run(scheduleId);

        logger.info('Schedule deleted successfully', {
            scheduleId,
            changes: result.changes,
        });
    } catch (error) {
        logger.error('Failed to delete schedule', {
            scheduleId,
            error: error.message,
        });
        throw error;
    }
}

function toggleScheduleActive(scheduleId) {
    logger.info('Toggling schedule active status', { scheduleId });

    try {
        const stmt = db.prepare('UPDATE schedules SET is_active = NOT is_active WHERE id = ?');
        const result = stmt.run(scheduleId);

        logger.info('Schedule active status toggled', {
            scheduleId,
            changes: result.changes,
        });
    } catch (error) {
        logger.error('Failed to toggle schedule active status', {
            scheduleId,
            error: error.message,
        });
        throw error;
    }
}

// === AUTO CREATE LESSONS ===
function autoCreateLessons(studentId) {
    const startTime = Date.now();
    logger.info('Auto-creating lessons', { studentId });

    const schedules = getSchedules(studentId);
    if (schedules.length === 0) {
        logger.debug('No schedules found for student', { studentId });
        return 0;
    }

    // Filter only active schedules
    const activeSchedules = schedules.filter((s) => s.is_active);
    if (activeSchedules.length === 0) {
        logger.debug('No active schedules for student', { studentId });
        return 0;
    }

    let created = 0;
    const now = new Date();

    // Calculate the start of the current week (Monday)
    const startOfWeek = new Date(now);
    const currentDay = startOfWeek.getDay();
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    startOfWeek.setDate(startOfWeek.getDate() - daysFromMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate the end: current week + 1 full week = 2 weeks total
    const endDate = new Date(startOfWeek);
    endDate.setDate(endDate.getDate() + 14);
    endDate.setHours(23, 59, 59, 999);

    // Generate lesson dates for current week + 1 week ahead
    const possibleLessons = [];

    for (let week = 0; week < 2; week++) {
        for (const schedule of activeSchedules) {
            const lessonDate = new Date(startOfWeek);
            const targetDay = schedule.day_of_week;

            const daysToAdd = targetDay + week * 7;

            lessonDate.setDate(lessonDate.getDate() + daysToAdd);

            const [hours, minutes] = schedule.time.split(':');
            lessonDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            // Only include lessons that are in the future and within the period
            if (lessonDate <= now || lessonDate > endDate) continue;

            possibleLessons.push({
                datetime: lessonDate,
                schedule: schedule,
            });
        }
    }

    // Sort lessons chronologically
    possibleLessons.sort((a, b) => a.datetime - b.datetime);

    logger.debug('Generated possible lessons', {
        studentId,
        count: possibleLessons.length,
    });

    // Create lessons
    for (const lesson of possibleLessons) {
        // Check if lesson already exists at this datetime or if this datetime was a previous datetime
        const existing = db
            .prepare(
                `
                    SELECT id FROM lessons
                    WHERE student_id = ? AND (datetime = ? OR previous_datetime = ?)
                `,
            )
            .get(studentId, lesson.datetime.toISOString(), lesson.datetime.toISOString());

        if (existing) {
            continue;
        }

        db.prepare(
            `
                INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
                VALUES (?, ?, 0, 0)
            `,
        ).run(studentId, lesson.datetime.toISOString());

        created++;
    }

    const duration = Date.now() - startTime;
    logger.info('Auto-create lessons completed', {
        studentId,
        created,
        durationMs: duration,
    });

    return created;
}

function autoCreateLessonsForAllStudents() {
    const startTime = Date.now();
    logger.info('Auto-creating lessons for all students');

    try {
        const students = db.prepare('SELECT id FROM students').all();
        let totalCreated = 0;

        for (const student of students) {
            const created = autoCreateLessons(student.id);
            totalCreated += created;
        }

        const duration = Date.now() - startTime;
        logger.info('Auto-create lessons for all students completed', {
            totalCreated,
            studentCount: students.length,
            durationMs: duration,
        });

        return totalCreated;
    } catch (error) {
        logger.error('Failed to auto-create lessons for all students', {
            error: error.message,
        });
        throw error;
    }
}

module.exports = {
    initDatabase,
    getStudents,
    addStudent,
    updateStudentBalance,
    markOldestUnpaidLessonsAsPaid,
    deleteStudent,
    getLessons,
    addLesson,
    updateLesson,
    toggleLessonPayment,
    deleteLesson,
    syncCompletedLessons,
    getSchedules,
    addSchedule,
    deleteSchedule,
    toggleScheduleActive,
    autoCreateLessons,
    autoCreateLessonsForAllStudents,
};
