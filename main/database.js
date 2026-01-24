const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function initDatabase() {
    try {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'students.db');

        console.log('Database path:', dbPath);

        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }

        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');

        let schemaPath;
        if (process.env.NODE_ENV === 'development') {
            schemaPath = path.join(__dirname, 'db', 'schema.sql');
        } else {
            schemaPath = path.join(__dirname, 'db', 'schema.sql');
        }

        console.log('Schema path:', schemaPath);

        if (!fs.existsSync(schemaPath)) {
            console.error('Schema file not found at:', schemaPath);
            throw new Error(`Schema file not found: ${schemaPath}`);
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema);

        console.log('Database initialized successfully');
        return db;
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// === STUDENTS ===
function getStudents() {
    const stmt = db.prepare(`
        SELECT
            s.*,
            COUNT(CASE WHEN l.is_completed = 1 THEN 1 END) as completed_lessons_count
        FROM students s
                 LEFT JOIN lessons l ON s.id = l.student_id
        GROUP BY s.id
        ORDER BY s.name
    `);
    return stmt.all();
}

function addStudent(name, balance) {
    const stmt = db.prepare('INSERT INTO students (name, balance) VALUES (?, ?)');
    const result = stmt.run(name, balance);
    return { id: result.lastInsertRowid, name, balance: balance };
}

function updateStudentBalance(studentId, amount) {
    const stmt = db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?');
    stmt.run(amount, studentId);

    if (amount > 0) autoCreateLessons(studentId);
}

function deleteStudent(studentId) {
    const stmt = db.prepare('DELETE FROM students WHERE id = ?');
    stmt.run(studentId);
}

// === LESSONS ===
function getLessons(startDate, endDate) {
    const stmt = db.prepare(`
        SELECT l.*, s.name as student_name, s.balance
        FROM lessons l
                 JOIN students s ON l.student_id = s.id
        WHERE l.datetime >= ? AND l.datetime < ?
        ORDER BY l.datetime
    `);
    return stmt.all(startDate, endDate);
}

function addLesson(studentId, datetime, isPaid, isCompleted) {
    const stmt = db.prepare(`
        INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
        VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(studentId, datetime, isPaid ? 1 : 0, isCompleted ? 1 : 0);

    // If lesson was completed, deduct 1 from student balance
    if (isCompleted) {
        updateStudentBalance(studentId, -1);
    }

    return { id: result.lastInsertRowid };
}

function updateLesson(lessonId, updates) {
    const fields = [];
    const values = [];

    if (updates.is_completed !== undefined) {
        fields.push('is_completed = ?');
        values.push(updates.is_completed ? 1 : 0);
    }
    if (updates.is_paid !== undefined) {
        fields.push('is_paid = ?');
        values.push(updates.is_paid ? 1 : 0);
    }
    if (updates.datetime !== undefined) {
        // Get current datetime before updating
        const currentLesson = db.prepare('SELECT datetime FROM lessons WHERE id = ?').get(lessonId);

        // Store old datetime as previous_datetime
        fields.push('previous_datetime = ?');
        values.push(currentLesson.datetime);

        fields.push('datetime = ?');
        values.push(updates.datetime);
    }

    if (fields.length === 0) return;

    values.push(lessonId);
    const stmt = db.prepare(`UPDATE lessons SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
}

function deleteLesson(lessonId) {
    // Get lesson data before deleting
    const lessonStmt = db.prepare('SELECT * FROM lessons WHERE id = ?');
    const lesson = lessonStmt.get(lessonId);

    // Delete lesson
    const deleteStmt = db.prepare('DELETE FROM lessons WHERE id = ?');
    deleteStmt.run(lessonId);

    // If lesson was completed, return 1 to balance
    if (lesson && lesson.is_completed) {
        updateStudentBalance(lesson.student_id, 1);
    }
}

// === AUTO SYNC ===
function syncCompletedLessons() {
    const now = new Date();
    const lessonDurationMinutes = 50;

    // Calculate the time threshold: now - lesson duration
    const thresholdTime = new Date(now.getTime() - lessonDurationMinutes * 60 * 1000);
    const thresholdISO = thresholdTime.toISOString();

    const stmt = db.prepare(`
        SELECT id, student_id FROM lessons
        WHERE datetime < ? AND is_completed = 0
    `);

    const lessons = stmt.all(thresholdISO);

    const updateStmt = db.prepare('UPDATE lessons SET is_completed = 1 WHERE id = ?');

    for (const { id, student_id } of lessons) {
        updateStmt.run(id);
        updateStudentBalance(student_id, -1);
    }

    // Check for completed unpaid lessons where student has positive balance
    const unpaidCompletedStmt = db.prepare(`
        SELECT l.id, l.student_id, s.balance
        FROM lessons l
        JOIN students s ON l.student_id = s.id
        WHERE l.is_completed = 1 AND l.is_paid = 0 AND s.balance > 0
    `);

    const unpaidLessons = unpaidCompletedStmt.all();
    const markAsPaidStmt = db.prepare('UPDATE lessons SET is_paid = 1 WHERE id = ?');

    for (const { id, student_id } of unpaidLessons) {
        markAsPaidStmt.run(id);
        updateStudentBalance(student_id, -1);
    }

    return lessons.length;
}

// === SCHEDULES ===
function getSchedules(studentId) {
    const stmt = db.prepare(`
        SELECT * FROM schedules
        WHERE student_id = ? AND is_active = 1
        ORDER BY day_of_week, time
    `);
    return stmt.all(studentId);
}

function addSchedule(studentId, dayOfWeek, time) {
    const stmt = db.prepare(`
        INSERT INTO schedules (student_id, day_of_week, time, is_active)
        VALUES (?, ?, ?, 1)
    `);
    const result = stmt.run(studentId, dayOfWeek, time);

    return { id: result.lastInsertRowid };
}

function deleteSchedule(scheduleId) {
    const stmt = db.prepare('UPDATE schedules SET is_active = 0 WHERE id = ?');
    stmt.run(scheduleId);
}

// === AUTO CREATE LESSONS ===
function autoCreateLessons(studentId) {
    const student = db.prepare('SELECT balance FROM students WHERE id = ?').get(studentId);
    if (!student || student.balance <= 0) return 0;

    const schedules = getSchedules(studentId);
    if (schedules.length === 0) return 0;

    let created = 0;
    let remainingBalance = student.balance;
    const now = new Date();

    // Generate possible lesson dates, but only as many as needed
    const possibleLessons = [];
    const maxWeeksToCheck = Math.ceil(remainingBalance / schedules.length) + 2; // +2 for safety buffer

    for (let week = 0; week < maxWeeksToCheck; week++) {
        for (const schedule of schedules) {
            const lessonDate = new Date(now);
            const currentDay = lessonDate.getDay();
            const targetDay = schedule.day_of_week;

            const targetDayJS = targetDay === 6 ? 0 : targetDay + 1;

            let daysToAdd = targetDayJS - currentDay;
            if (daysToAdd < 0) daysToAdd += 7;
            daysToAdd += week * 7;

            lessonDate.setDate(lessonDate.getDate() + daysToAdd);

            const [hours, minutes] = schedule.time.split(':');
            lessonDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            if (lessonDate <= now) continue;

            possibleLessons.push({
                datetime: lessonDate,
                schedule: schedule,
            });
        }

        // Early exit if we have enough potential slots
        if (possibleLessons.length >= remainingBalance * 2) break;
    }

    // Sort lessons chronologically
    possibleLessons.sort((a, b) => a.datetime - b.datetime);

    // Create lessons in chronological order
    for (const lesson of possibleLessons) {
        if (remainingBalance <= 0) break;

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
            remainingBalance--;
            continue;
        }

        db.prepare(
            `
                INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
                VALUES (?, ?, 1, 0)
            `,
        ).run(studentId, lesson.datetime.toISOString());

        remainingBalance--;
        created++;
    }

    return created;
}

module.exports = {
    initDatabase,
    getStudents,
    addStudent,
    updateStudentBalance,
    deleteStudent,
    getLessons,
    addLesson,
    updateLesson,
    deleteLesson,
    syncCompletedLessons,
    getSchedules,
    addSchedule,
    deleteSchedule,
    autoCreateLessons,
};
