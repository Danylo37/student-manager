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

    // Current week (Monday of the week)
    currentWeek: getWeekStart(new Date()),

    // Modal states
    modals: {
        addStudent: false,
        addLesson: false,
        studentsList: false,
        editLesson: false,
    },

    // Selected lesson for editing
    selectedLesson: null,

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
     */
    addStudent: async (name) => {
        try {
            await window.electron.addStudent(name);
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
            // Reload students list
            await get().loadStudents();
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
     * @param {number} lessonData.studentId - Student ID
     * @param {string} lessonData.datetime - Datetime in ISO format
     * @param {boolean} lessonData.isPaid - Is lesson paid
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
     * Sync completed lessons (mark as completed and deduct balance)
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

    /**
     * Move to next week
     */
    nextWeek: () => {
        const { currentWeek } = get();
        const nextWeek = new Date(currentWeek);
        nextWeek.setDate(nextWeek.getDate() + 7);

        set({ currentWeek: getWeekStart(nextWeek) });
        // Load lessons for new week
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
        // Load lessons for new week
        get().loadLessons();
    },

    /**
     * Go to today's week
     */
    goToToday: () => {
        set({ currentWeek: getWeekStart(new Date()) });
        // Load lessons for current week
        get().loadLessons();
    },

    /**
     * Open modal
     * @param {string} modalName - Modal name ('addStudent', 'addLesson', etc.)
     */
    openModal: (modalName) => {
        set((state) => ({
            modals: { ...state.modals, [modalName]: true },
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
     * Initialize app (load initial data)
     */
    initialize: async () => {
        // Sync lessons first (mark completed lessons)
        await get().syncLessons();
        // Load students and lessons
        await Promise.all([get().loadStudents(), get().loadLessons()]);
    },
}));

export default useAppStore;
