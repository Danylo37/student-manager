// ============= RE-EXPORTS =============
export { LessonStatus } from '../utils/lessonStatus';

// ============= DATABASE TYPES =============

export interface Student {
    id: number;
    name: string;
    balance: number;
    created_at: string;
    completed_lessons_count?: number;
}

export interface Lesson {
    id: number;
    student_id: number;
    datetime: string;
    previous_datetime: string | null;
    is_completed: number; // SQLite boolean (0 or 1)
    is_paid: number; // SQLite boolean (0 or 1)
    created_at: string;
    // Joined fields
    student_name?: string;
    balance?: number;
}

export interface Schedule {
    id: number;
    student_id: number;
    day_of_week: number; // 0-6 (Monday-Sunday)
    time: string; // HH:mm format
    is_active: number; // SQLite boolean (0 or 1)
    created_at: string;
}

// ============= API TYPES =============

export interface AddLessonData {
    studentId: number;
    datetime: string;
    isPaid: boolean;
    isCompleted: boolean;
}

export interface UpdateLessonData {
    datetime?: string;
    is_completed?: number;
    is_paid?: number;
}

// ============= ELECTRON API =============

export interface ElectronAPI {
    // Students
    getStudents: () => Promise<Student[]>;
    addStudent: (name: string, balance: number) => Promise<Student>;
    updateBalance: (studentId: number, amount: number) => Promise<void>;
    markUnpaidLessonsPaid: (studentId: number, count: number) => Promise<void>;
    deleteStudent: (studentId: number) => Promise<void>;

    // Lessons
    getLessons: (startDate: string, endDate: string) => Promise<Lesson[]>;
    addLesson: (data: AddLessonData) => Promise<{ id: number }>;
    updateLesson: (id: number, updates: UpdateLessonData) => Promise<void>;
    toggleLessonPayment: (id: number) => Promise<void>;
    deleteLesson: (id: number) => Promise<void>;

    // Schedules
    getSchedules: (studentId: number) => Promise<Schedule[]>;
    addSchedule: (studentId: number, dayOfWeek: number, time: string) => Promise<{ id: number }>;
    deleteSchedule: (scheduleId: number) => Promise<void>;
    toggleScheduleActive: (scheduleId: number) => Promise<void>;
    autoCreateLessons: (studentId: number) => Promise<number>;

    // Sync
    syncLessons: () => Promise<number>;
}

declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

// ============= MODAL TYPES =============

export interface ModalState {
    addStudent: boolean;
    addLesson: boolean;
    studentsList: boolean;
    editLesson: boolean;
    schedule: boolean;
}

export type ModalName = keyof ModalState;

export type Theme = 'default' | 'purple';

// ============= STORE TYPES =============

export interface AppState {
    // Students
    students: Student[];
    studentsLoading: boolean;
    studentsError: string | null;

    // Lessons
    lessons: Lesson[];
    lessonsLoading: boolean;
    lessonsError: string | null;

    // Schedules
    schedules: Schedule[];
    schedulesLoading: boolean;
    schedulesError: string | null;

    // Current week
    currentWeek: Date;

    // Modals
    modals: ModalState;
    selectedLesson: Lesson | null;
    selectedStudentForSchedule: Student | null;
    prefilledLessonDateTime: Date | null;

    // Theme
    theme: Theme;

    // Actions
    loadStudents: () => Promise<void>;
    addStudent: (name: string, balance: number) => Promise<void>;
    deleteStudent: (studentId: number) => Promise<void>;
    updateBalance: (studentId: number, amount: number) => Promise<void>;

    loadLessons: () => Promise<void>;
    addLesson: (data: AddLessonData) => Promise<void>;
    updateLesson: (lessonId: number, updates: UpdateLessonData) => Promise<void>;
    toggleLessonPayment: (lessonId: number) => Promise<void>;
    deleteLesson: (lessonId: number) => Promise<void>;
    syncLessons: () => Promise<void>;

    loadSchedules: (studentId: number) => Promise<void>;
    addSchedule: (studentId: number, dayOfWeek: number, time: string) => Promise<void>;
    deleteSchedule: (scheduleId: number) => Promise<void>;
    toggleScheduleActive: (scheduleId: number) => Promise<void>;
    autoCreateLessons: (studentId: number) => Promise<number>;

    nextWeek: () => void;
    prevWeek: () => void;
    goToToday: () => void;

    openModal: (modalName: ModalName) => void;
    openAddLessonModal: (datetime: Date) => void;
    closeModal: (modalName: ModalName) => void;
    selectLesson: (lesson: Lesson) => void;
    selectStudentForSchedule: (student: Student) => void;

    initialize: () => Promise<void>;
    toggleTheme: () => void;
}
