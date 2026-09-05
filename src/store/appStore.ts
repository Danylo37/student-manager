import { create } from 'zustand';
import { getWeekStart, getWeekRange } from '../utils/dateHelpers';
import type {
  Student,
  Lesson,
  TaxSettings,
  AddLessonData,
  Theme,
  AppView,
  AppState,
} from '@/types';

const useAppStore = create<AppState>((set, get) => ({
  // # State
  students: [],
  studentsLoading: false,
  studentsError: null,

  lessons: [],
  lessonsLoading: false,
  lessonsError: null,

  // Bumped on every lessons reload. Views that query the DB themselves
  // (Finance) watch it to refetch after a sync or any lesson change.
  dataVersion: 0,

  schedules: [],
  schedulesLoading: false,
  schedulesError: null,

  currentWeek: getWeekStart(new Date()),
  currentView: 'calendar' as AppView,

  modals: {
    addStudent: false,
    addLesson: false,
    studentsList: false,
    editLesson: false,
    schedule: false,
    taxSettings: false,
    discounts: false,
  },

  selectedLesson: null,
  selectedStudentForSchedule: null,
  selectedStudentForDiscounts: null,
  prefilledLessonDateTime: null,

  theme: (localStorage.getItem('theme') as Theme) || 'default',
  taxSettings: null,
  taxStart: null,

  // # Students

  loadStudents: async () => {
    set({ studentsLoading: true, studentsError: null });
    try {
      const students = await window.electron.getStudents();
      set({ students, studentsLoading: false });
    } catch (error) {
      set({
        studentsError: error instanceof Error ? error.message : 'Error',
        studentsLoading: false,
      });
    }
  },

  addStudent: async (name, balance, priceKopiyky) => {
    await window.electron.addStudent(name, balance, priceKopiyky ?? null);
    await get().loadStudents();
  },

  deleteStudent: async (studentId) => {
    await window.electron.deleteStudent(studentId);
    await get().loadStudents();
    await get().loadLessons();
  },

  updateBalance: async (studentId, amount) => {
    if (amount > 0) {
      // payForLessons: backend auto-detects applicable discount or current price,
      // creates payment bundle, marks unpaid lessons as paid.
      await window.electron.payForLessons(studentId, amount, null);
    } else if (amount < 0) {
      await window.electron.updateBalance(studentId, amount);
    }
    await get().loadStudents();
    await get().loadLessons();
  },

  setStudentTaxExempt: async (studentId, exempt) => {
    await window.electron.setStudentTaxExempt(studentId, exempt);
    await get().loadStudents();
  },

  // # Lessons

  loadLessons: async () => {
    set({ lessonsLoading: true, lessonsError: null });
    try {
      const { currentWeek } = get();
      const { start, end } = getWeekRange(currentWeek);
      const lessons = await window.electron.getLessons(start, end);
      set((state) => ({ lessons, lessonsLoading: false, dataVersion: state.dataVersion + 1 }));
      // The first paid lesson with a price starts the tax clock, and any lesson
      // change can create it, so keep the anchor in sync.
      void get().refreshTaxStart();
    } catch (error) {
      set({
        lessonsError: error instanceof Error ? error.message : 'Error',
        lessonsLoading: false,
      });
    }
  },

  addLesson: async (lessonData: AddLessonData) => {
    await window.electron.addLesson(lessonData);
    await get().loadLessons();
    await get().loadStudents();
  },

  updateLesson: async (lessonId, updates) => {
    await window.electron.updateLesson(lessonId, updates);
    await get().loadLessons();
    await get().loadStudents();
  },

  toggleLessonPayment: async (lessonId) => {
    await window.electron.toggleLessonPayment(lessonId);
    await get().loadLessons();
    await get().loadStudents();
  },

  deleteLesson: async (lessonId) => {
    await window.electron.deleteLesson(lessonId);
    await get().loadLessons();
    await get().loadStudents();
  },

  syncLessons: async () => {
    await window.electron.syncLessons();
    await get().loadLessons();
    await get().loadStudents();
  },

  // # Schedules

  loadSchedules: async (studentId) => {
    set({ schedulesLoading: true, schedulesError: null });
    try {
      const schedules = await window.electron.getSchedules(studentId);
      set({ schedules, schedulesLoading: false });
    } catch (error) {
      set({
        schedulesError: error instanceof Error ? error.message : 'Error',
        schedulesLoading: false,
      });
    }
  },

  addSchedule: async (studentId, dayOfWeek, time) => {
    await window.electron.addSchedule(studentId, dayOfWeek, time);
    await get().loadSchedules(studentId);
  },

  deleteSchedule: async (scheduleId) => {
    const studentId = get().selectedStudentForSchedule?.id;
    await window.electron.deleteSchedule(scheduleId);
    if (studentId) await get().loadSchedules(studentId);
  },

  toggleScheduleActive: async (scheduleId) => {
    const studentId = get().selectedStudentForSchedule?.id;
    await window.electron.toggleScheduleActive(scheduleId);
    if (studentId) await get().loadSchedules(studentId);
  },

  autoCreateLessons: async (studentId) => {
    const created = await window.electron.autoCreateLessons(studentId);
    await get().loadLessons();
    await get().loadStudents();
    return created;
  },

  // # Tax settings

  loadTaxSettings: async () => {
    try {
      const taxSettings = await window.electron.getTaxSettings();
      set({ taxSettings });
    } catch (error) {
      console.error('Failed to load tax settings:', error);
    }
    await get().refreshTaxStart();
  },

  /**
   * Refresh the date of the first paid lesson with a price. Fixed taxes start
   * from that month, so an install without prices yet stays untaxed.
   */
  refreshTaxStart: async () => {
    try {
      const dateRange = await window.electron.getEarningsDateRange();
      set({ taxStart: dateRange?.min_date ?? null });
    } catch (error) {
      console.error('Failed to load tax start date:', error);
    }
  },

  saveTaxSettings: async (settings: Omit<TaxSettings, 'id' | 'updated_at'>) => {
    await window.electron.saveTaxSettings(settings);
    await get().loadTaxSettings();
  },

  // # Navigation

  nextWeek: () => {
    const next = new Date(get().currentWeek);
    next.setDate(next.getDate() + 7);
    set({ currentWeek: getWeekStart(next) });
    void get().loadLessons();
  },

  prevWeek: () => {
    const prev = new Date(get().currentWeek);
    prev.setDate(prev.getDate() - 7);
    set({ currentWeek: getWeekStart(prev) });
    void get().loadLessons();
  },

  goToToday: () => {
    set({ currentWeek: getWeekStart(new Date()) });
    void get().loadLessons();
  },

  setView: (view) => set({ currentView: view }),

  // # Modals

  openModal: (modalName) => set((state) => ({ modals: { ...state.modals, [modalName]: true } })),

  openAddLessonModal: (datetime) => {
    set({ prefilledLessonDateTime: datetime });
    set((state) => ({ modals: { ...state.modals, addLesson: true } }));
  },

  closeModal: (modalName) => {
    set((state) => ({ modals: { ...state.modals, [modalName]: false } }));
    if (modalName === 'editLesson') set({ selectedLesson: null });
    if (modalName === 'schedule') set({ selectedStudentForSchedule: null, schedules: [] });
    if (modalName === 'discounts') set({ selectedStudentForDiscounts: null });
    if (modalName === 'addLesson') set({ prefilledLessonDateTime: null });
  },

  selectLesson: (lesson: Lesson) => {
    set({ selectedLesson: lesson });
    get().openModal('editLesson');
  },

  selectStudentForSchedule: (student: Student) => set({ selectedStudentForSchedule: student }),

  selectStudentForDiscounts: (student: Student) => {
    set({ selectedStudentForDiscounts: student });
    get().openModal('discounts');
  },

  // # App lifecycle

  initialize: async () => {
    await get().syncLessons();
    await Promise.all([get().loadStudents(), get().loadLessons(), get().loadTaxSettings()]);
  },

  toggleTheme: () => {
    const newTheme: Theme = get().theme === 'default' ? 'purple' : 'default';
    localStorage.setItem('theme', newTheme);
    set({ theme: newTheme });
  },
}));

export default useAppStore;
