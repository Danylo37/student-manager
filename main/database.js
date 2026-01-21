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

function addLesson(studentId, datetime, isPaid) {
    const stmt = db.prepare(`
    INSERT INTO lessons (student_id, datetime, is_paid, is_completed)
    VALUES (?, ?, ?, 0)
  `);
    const result = stmt.run(studentId, datetime, isPaid ? 1 : 0);
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

    // If lesson was paid and completed, return 1 to balance
    if (lesson && lesson.is_paid && lesson.is_completed) {
        const balanceStmt = db.prepare('UPDATE students SET balance = balance + 1 WHERE id = ?');
        balanceStmt.run(lesson.student_id);
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
};
