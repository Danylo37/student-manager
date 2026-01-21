const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function initDatabase() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'students.db');

    console.log('Database path:', dbPath);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    console.log('Database initialized');
    return db;
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

function addStudent(name) {
    const stmt = db.prepare('INSERT INTO students (name, balance) VALUES (?, 0)');
    const result = stmt.run(name);
    return { id: result.lastInsertRowid, name, balance: 0 };
}

function updateStudentBalance(studentId, amount) {
    const stmt = db.prepare('UPDATE students SET balance = balance + ? WHERE id = ?');
    stmt.run(amount, studentId);

    if (amount > 0) {
        autoCreateLessons(studentId);
    }
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
    const now = new Date().toISOString();

    const stmt = db.prepare(`
        SELECT id, student_id FROM lessons
        WHERE datetime < ? AND is_completed = 0
    `);

    const lessons = stmt.all(now);

    const updateStmt = db.prepare('UPDATE lessons SET is_completed = 1 WHERE id = ?');
    const balanceStmt = db.prepare('UPDATE students SET balance = balance - 1 WHERE id = ?');

    for (const { id, student_id } of lessons) {
        updateStmt.run(id);
        balanceStmt.run(student_id);
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
    const weeksAhead = 12;
    const now = new Date();

    schedules.sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
            return a.day_of_week - b.day_of_week;
        }
        return a.time.localeCompare(b.time);
    });

    for (let week = 0; week < weeksAhead && remainingBalance > 0; week++) {
        for (const schedule of schedules) {
            if (remainingBalance <= 0) break;

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

            // Check if lesson already exists at this datetime or if this datetime was a previous datetime
            const existing = db
                .prepare(
                    `
                SELECT id FROM lessons 
                WHERE student_id = ? AND (datetime = ? OR previous_datetime = ?)
            `,
                )
                .get(studentId, lessonDate.toISOString(), lessonDate.toISOString());

            if (existing) {
                remainingBalance--;
                continue;
            }

            db.prepare(
                `
                    INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
                    VALUES (?, ?, 1, 0)
                `,
            ).run(studentId, lessonDate.toISOString());

            remainingBalance--;
            created++;
        }
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
