import { create } from 'zustand';
import { getWeekStart, getWeekRange } from '../utils/dateHelpers';
import type {
    Student,
    Lesson,
    AddLessonData,
    UpdateLessonData,
    ModalName,
    Theme,
    AppState,
} from '@/types';

/**
 * Global application state using Zustand
 */
const useAppStore = create<AppState>((set, get) => ({
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

    // Theme
    theme: (localStorage.getItem('theme') as Theme) || 'default',

    // ========== ACTIONS ==========

    /**
     * Load all students from database
     */
    loadStudents: async (): Promise<void> => {
        set({ studentsLoading: true, studentsError: null });

        try {
            const students = await window.electron.getStudents();
            set({ students, studentsLoading: false });
        } catch (error) {
            console.error('Failed to load students:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            set({ studentsError: errorMessage, studentsLoading: false });
        }
    },

    /**
     * Add new student
     */
    addStudent: async (name: string, balance: number): Promise<void> => {
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
     */
    deleteStudent: async (studentId: number): Promise<void> => {
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
     */
    updateBalance: async (studentId: number, amount: number): Promise<void> => {
        try {
            await window.electron.updateBalance(studentId, amount);

            // If adding positive balance, mark the oldest unpaid completed lessons as paid
            if (amount > 0) {
                await window.electron.markUnpaidLessonsPaid(studentId, amount);
            }

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
    loadLessons: async (): Promise<void> => {
        set({ lessonsLoading: true, lessonsError: null });

        try {
            const { currentWeek } = get();
            const { start, end } = getWeekRange(currentWeek);

            const lessons = await window.electron.getLessons(start, end);
            set({ lessons, lessonsLoading: false });
        } catch (error) {
            console.error('Failed to load lessons:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            set({ lessonsError: errorMessage, lessonsLoading: false });
        }
    },

    /**
     * Add new lesson
     */
    addLesson: async (lessonData: AddLessonData): Promise<void> => {
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
     */
    updateLesson: async (lessonId: number, updates: UpdateLessonData): Promise<void> => {
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
     * Toggle lesson payment status
     */
    toggleLessonPayment: async (lessonId: number): Promise<void> => {
        try {
            await window.electron.toggleLessonPayment(lessonId);
            // Reload lessons
            await get().loadLessons();
            // Reload students (balance might change)
            await get().loadStudents();
        } catch (error) {
            console.error('Failed to toggle payment:', error);
            throw error;
        }
    },

    /**
     * Delete lesson
     */
    deleteLesson: async (lessonId: number): Promise<void> => {
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
    syncLessons: async (): Promise<void> => {
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
     */
    loadSchedules: async (studentId: number): Promise<void> => {
        set({ schedulesLoading: true, schedulesError: null });

        try {
            const schedules = await window.electron.getSchedules(studentId);
            set({ schedules, schedulesLoading: false });
        } catch (error) {
            console.error('Failed to load schedules:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            set({ schedulesError: errorMessage, schedulesLoading: false });
        }
    },

    /**
     * Add schedule
     */
    addSchedule: async (studentId: number, dayOfWeek: number, time: string): Promise<void> => {
        try {
            await window.electron.addSchedule(studentId, dayOfWeek, time);
            // Reload schedules
            await get().loadSchedules(studentId);
        } catch (error) {
            console.error('Failed to add schedule:', error);
            throw error;
        }
    },

    /**
     * Delete schedule
     */
    deleteSchedule: async (scheduleId: number): Promise<void> => {
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
     * Toggle schedule active status
     */
    toggleScheduleActive: async (scheduleId: number): Promise<void> => {
        try {
            const studentId = get().selectedStudentForSchedule?.id;
            await window.electron.toggleScheduleActive(scheduleId);
            // Reload schedules
            if (studentId) {
                await get().loadSchedules(studentId);
            }
        } catch (error) {
            console.error('Failed to toggle schedule:', error);
            throw error;
        }
    },

    /**
     * Auto-create lessons for a student based on their schedule
     */
    autoCreateLessons: async (studentId: number): Promise<number> => {
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
    nextWeek: (): void => {
        const { currentWeek } = get();
        const nextWeek = new Date(currentWeek);
        nextWeek.setDate(nextWeek.getDate() + 7);

        set({ currentWeek: getWeekStart(nextWeek) });
        void get().loadLessons();
    },

    /**
     * Move to previous week
     */
    prevWeek: (): void => {
        const { currentWeek } = get();
        const prevWeek = new Date(currentWeek);
        prevWeek.setDate(prevWeek.getDate() - 7);

        set({ currentWeek: getWeekStart(prevWeek) });
        void get().loadLessons();
    },

    /**
     * Go to today's week
     */
    goToToday: (): void => {
        set({ currentWeek: getWeekStart(new Date()) });
        void get().loadLessons();
    },

    // ========== MODALS ==========

    /**
     * Open modal
     */
    openModal: (modalName: ModalName): void => {
        set((state) => ({
            modals: { ...state.modals, [modalName]: true },
        }));
    },

    /**
     * Open add lesson modal with pre-filled date/time
     */
    openAddLessonModal: (datetime: Date): void => {
        set({ prefilledLessonDateTime: datetime });
        set((state) => ({
            modals: { ...state.modals, addLesson: true },
        }));
    },

    /**
     * Close modal
     */
    closeModal: (modalName: ModalName): void => {
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
     */
    selectLesson: (lesson: Lesson): void => {
        set({ selectedLesson: lesson });
        get().openModal('editLesson');
    },

    /**
     * Select student for schedule management
     */
    selectStudentForSchedule: (student: Student): void => {
        set({ selectedStudentForSchedule: student });
    },

    /**
     * Initialize app
     */
    initialize: async (): Promise<void> => {
        await get().syncLessons();
        await Promise.all([get().loadStudents(), get().loadLessons()]);
    },

    /**
     * Toggle theme between default and purple
     */
    toggleTheme: (): void => {
        const { theme } = get();
        const newTheme: Theme = theme === 'default' ? 'purple' : 'default';
        localStorage.setItem('theme', newTheme);
        set({ theme: newTheme });
    },
}));

export default useAppStore;
