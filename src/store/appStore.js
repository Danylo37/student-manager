import { create } from 'zustand';
import { getWeekStart, getWeekRange } from '../utils/dateHelpers';

/**
 * Global application state using Zustand
 */
const useAppStore = create((set, get) => ({
    // ========== STATE ==========

    // Students data
    students: [],
    studentsLoading: false,
    studentsError: null,

    // Lessons data
    lessons: [],
    lessonsLoading: false,
    lessonsError: null,

    // Schedules data
    schedules: [],
    schedulesLoading: false,
    schedulesError: null,

    // Current week (Monday of the week)
    currentWeek: getWeekStart(new Date()),

    // Modal states
    modals: {
        addStudent: false,
        addLesson: false,
        studentsList: false,
        editLesson: false,
        schedule: false,
    },

    // Selected lesson for editing
    selectedLesson: null,

    // Selected student for schedule management
    selectedStudentForSchedule: null,

    // Pre-filled date/time for add lesson modal
    prefilledLessonDateTime: null,

    // ========== ACTIONS ==========

    /**
     * Load all students from database
     */
    loadStudents: async () => {
        set({ studentsLoading: true, studentsError: null });

        try {
            const students = await window.electron.getStudents();
            set({ students, studentsLoading: false });
        } catch (error) {
            console.error('Failed to load students:', error);
            set({ studentsError: error.message, studentsLoading: false });
        }
    },

    /**
     * Add new student
     * @param {string} name - Student name
     * @param {number} balance - Initial balance
     */
    addStudent: async (name, balance) => {
        try {
            await window.electron.addStudent(name, balance);
            // Reload students list
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to add student:', error);
            throw error;
        }
    },

    /**
     * Delete student
     * @param {number} studentId - Student ID
     */
    deleteStudent: async (studentId) => {
        try {
            await window.electron.deleteStudent(studentId);
            // Reload students list
            await get().loadStudents();
            // Reload lessons (student's lessons will be removed)
            await get().loadLessons();
        } catch (error) {
            console.error('Failed to delete student:', error);
            throw error;
        }
    },

    /**
     * Update student balance
     * @param {number} studentId - Student ID
     * @param {number} amount - Amount to add (can be negative)
     */
    updateBalance: async (studentId, amount) => {
        try {
            await window.electron.updateBalance(studentId, amount);
            // Reload students and lessons (auto-create will happen)
            await get().loadStudents();
            await get().loadLessons();
        } catch (error) {
            console.error('Failed to update balance:', error);
            throw error;
        }
    },

    /**
     * Load lessons for current week
     */
    loadLessons: async () => {
        set({ lessonsLoading: true, lessonsError: null });

        try {
            const { currentWeek } = get();
            const { start, end } = getWeekRange(currentWeek);

            const lessons = await window.electron.getLessons(start, end);
            set({ lessons, lessonsLoading: false });
        } catch (error) {
            console.error('Failed to load lessons:', error);
            set({ lessonsError: error.message, lessonsLoading: false });
        }
    },

    /**
     * Add new lesson
     * @param {Object} lessonData - Lesson data
     */
    addLesson: async (lessonData) => {
        try {
            await window.electron.addLesson(lessonData);
            // Reload lessons
            await get().loadLessons();
            // Reload students (balance might change)
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to add lesson:', error);
            throw error;
        }
    },

    /**
     * Update lesson
     * @param {number} lessonId - Lesson ID
     * @param {Object} updates - Fields to update
     */
    updateLesson: async (lessonId, updates) => {
        try {
            await window.electron.updateLesson(lessonId, updates);
            // Reload lessons
            await get().loadLessons();
            // Reload students (balance might change)
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to update lesson:', error);
            throw error;
        }
    },

    /**
     * Delete lesson
     * @param {number} lessonId - Lesson ID
     */
    deleteLesson: async (lessonId) => {
        try {
            await window.electron.deleteLesson(lessonId);
            // Reload lessons
            await get().loadLessons();
            // Reload students (balance might change)
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to delete lesson:', error);
            throw error;
        }
    },

    /**
     * Sync completed lessons
     */
    syncLessons: async () => {
        try {
            await window.electron.syncLessons();
            // Reload everything
            await get().loadLessons();
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to sync lessons:', error);
            throw error;
        }
    },

    // ========== SCHEDULES ==========

    /**
     * Load schedules for a student
     * @param {number} studentId - Student ID
     */
    loadSchedules: async (studentId) => {
        set({ schedulesLoading: true, schedulesError: null });

        try {
            const schedules = await window.electron.getSchedules(studentId);
            set({ schedules, schedulesLoading: false });
        } catch (error) {
            console.error('Failed to load schedules:', error);
            set({ schedulesError: error.message, schedulesLoading: false });
        }
    },

    /**
     * Add schedule
     * @param {number} studentId - Student ID
     * @param {number} dayOfWeek - Day of week (0-6)
     * @param {string} time - Time in HH:MM format
     */
    addSchedule: async (studentId, dayOfWeek, time) => {
        try {
            await window.electron.addSchedule(studentId, dayOfWeek, time);
            // Reload schedules and lessons
            await get().loadSchedules(studentId);
            await get().loadLessons();
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to add schedule:', error);
            throw error;
        }
    },

    /**
     * Delete schedule
     * @param {number} scheduleId - Schedule ID
     */
    deleteSchedule: async (scheduleId) => {
        try {
            const studentId = get().selectedStudentForSchedule?.id;
            await window.electron.deleteSchedule(scheduleId);
            // Reload schedules
            if (studentId) {
                await get().loadSchedules(studentId);
            }
        } catch (error) {
            console.error('Failed to delete schedule:', error);
            throw error;
        }
    },

    /**
     * Auto-create lessons for a student based on their schedule
     * @param {number} studentId - Student ID
     */
    autoCreateLessons: async (studentId) => {
        try {
            const created = await window.electron.autoCreateLessons(studentId);
            // Reload lessons and students
            await get().loadLessons();
            await get().loadStudents();
            return created;
        } catch (error) {
            console.error('Failed to auto-create lessons:', error);
            throw error;
        }
    },

    // ========== NAVIGATION ==========

    /**
     * Move to next week
     */
    nextWeek: () => {
        const { currentWeek } = get();
        const nextWeek = new Date(currentWeek);
        nextWeek.setDate(nextWeek.getDate() + 7);

        set({ currentWeek: getWeekStart(nextWeek) });
        get().loadLessons();
    },

    /**
     * Move to previous week
     */
    prevWeek: () => {
        const { currentWeek } = get();
        const prevWeek = new Date(currentWeek);
        prevWeek.setDate(prevWeek.getDate() - 7);

        set({ currentWeek: getWeekStart(prevWeek) });
        get().loadLessons();
    },

    /**
     * Go to today's week
     */
    goToToday: () => {
        set({ currentWeek: getWeekStart(new Date()) });
        get().loadLessons();
    },

    // ========== MODALS ==========

    /**
     * Open modal
     * @param {string} modalName - Modal name
     */
    openModal: (modalName) => {
        set((state) => ({
            modals: { ...state.modals, [modalName]: true },
        }));
    },

    /**
     * Open add lesson modal with pre-filled date/time
     * @param {Date} datetime - Pre-filled date and time
     */
    openAddLessonModal: (datetime) => {
        set({ prefilledLessonDateTime: datetime });
        set((state) => ({
            modals: { ...state.modals, addLesson: true },
        }));
    },

    /**
     * Close modal
     * @param {string} modalName - Modal name
     */
    closeModal: (modalName) => {
        set((state) => ({
            modals: { ...state.modals, [modalName]: false },
        }));

        // Clear selected lesson when closing edit modal
        if (modalName === 'editLesson') {
            set({ selectedLesson: null });
        }

        // Clear selected student when closing schedule modal
        if (modalName === 'schedule') {
            set({ selectedStudentForSchedule: null, schedules: [] });
        }

        // Clear pre-filled date/time when closing add lesson modal
        if (modalName === 'addLesson') {
            set({ prefilledLessonDateTime: null });
        }
    },

    /**
     * Select lesson for editing
     * @param {Object} lesson - Lesson object
     */
    selectLesson: (lesson) => {
        set({ selectedLesson: lesson });
        get().openModal('editLesson');
    },

    /**
     * Select student for schedule management
     * @param {Object} student - Student object
     */
    selectStudentForSchedule: (student) => {
        set({ selectedStudentForSchedule: student });
    },

    /**
     * Initialize app
     */
    initialize: async () => {
        await get().syncLessons();
        await Promise.all([get().loadStudents(), get().loadLessons()]);
    },

    /**
     * Toggle theme between default and purple
     */
    toggleTheme: () => {
        const { theme } = get();
        const newTheme = theme === 'default' ? 'purple' : 'default';
        localStorage.setItem('theme', newTheme);
        set({ theme: newTheme });
    },
}));

export default useAppStore;
