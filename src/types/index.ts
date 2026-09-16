export { LessonStatus } from '../utils/lessonStatus';

// # DATABASE TYPES

export interface Student {
  id: number;
  name: string;
  balance: number;
  /** 0 | 1 — payments from this student stay out of the percentage tax base. */
  is_tax_exempt: number;
  created_at: string;
  completed_lessons_count?: number;
  current_price?: number | null; // kopiyky
}

export interface Lesson {
  id: number;
  student_id: number | null; // null if student was deleted
  student_name_cache: string | null;
  datetime: string;
  previous_datetime: string | null;
  is_completed: number;
  is_paid: number;
  /** 0 | 1 — a free 30-minute trial lesson: no student, no price, no balance. */
  is_trial: number;
  price: number | null; // kopiyky; null until lesson completes
  payment_bundle_id: number | null;
  created_at: string;
  // Joined fields
  student_name?: string;
  balance?: number;
  student_current_price?: number | null; // kopiyky
}

export interface Schedule {
  id: number;
  student_id: number;
  day_of_week: number; // 0-6 Monday-Sunday
  time: string; // HH:mm
  is_active: number;
  created_at: string;
}

/** How many lessons a student has booked in a normal week (active slots only). */
export interface WeeklyScheduleCount {
  student_id: number;
  per_week: number;
}

export interface LessonPrice {
  id: number;
  student_id: number;
  price: number; // kopiyky
  valid_from: string;
  created_at: string;
}

/** A bundle of N lessons paid at once with a fixed total price. */
export interface PaymentBundle {
  id: number;
  student_id: number | null;
  total_price: number; // kopiyky
  lessons_count: number;
  lessons_used: number;
  created_at: string;
}

/**
 * Discount bundle rule.
 * student_id = null → global (applies to all students).
 * Example: lessons_count=3, total_price=100000 kopiyky → 3 lessons for 1000.00 ₴
 */
export interface Discount {
  id: number;
  student_id: number | null;
  lessons_count: number;
  total_price: number; // kopiyky
  description: string | null;
  is_active: number;
  created_at: string;
}

/**
 * Tax settings — single row.
 * esv_type: 'none' | 'fixed'
 * esv_fixed: kopiyky/month
 * esv_since: YYYY-MM-DD, the first day of the month ЄСВ is counted from; null while it is off
 * single_tax_rate: percent (єдиний податок, 5.0 = 5% for ФОП group 3)
 * military_tax_rate: percent (e.g. 1.0 = 1%)
 */
export interface TaxSettings {
  id: 1;
  esv_type: 'none' | 'fixed';
  esv_fixed: number; // kopiyky/month
  esv_since: string | null;
  single_tax_enabled: number; // 0 | 1
  single_tax_rate: number; // percent
  military_tax_enabled: number; // 0 | 1
  military_tax_rate: number; // percent
  updated_at: string;
}

export interface EarningsStats {
  total: number; // kopiyky
  lessons_with_price: number;
  lessons_paid: number; // completed, paid and priced — the ones `total` is built from
  lessons_total: number;
}

export interface EarningsByDay {
  day: string; // YYYY-MM-DD
  total: number; // kopiyky
  count: number;
}

export interface EarningsByStudent {
  student_id: number;
  student_name: string;
  total: number; // kopiyky
  count: number;
}

/** Money actually received in a period — the tax base (касовий метод). */
export interface CashStats {
  total: number; // kopiyky
  taxable: number; // kopiyky; the part of total the percentage taxes are charged on
  lessons: number; // lessons bought
  payments: number; // number of payments
}

/** One balance change made by the teacher: who paid, for how many lessons, for how much. */
export interface BalanceHistoryEntry {
  id: number;
  student_id: number | null;
  student_name: string;
  lessons: number; // signed: +N paid, -N removed
  amount: number | null; // kopiyky; null when no price was known
  created_at: string; // ISO (UTC)
}

/** What is still open at a moment: paid ahead vs given and not paid for. */
export interface BalanceTotals {
  advance: number; // kopiyky, always >= 0
  debt: number; // kopiyky, always >= 0
}

// # API TYPES

/** A package written together with a new student: N lessons for a fixed total. */
export interface DiscountInput {
  lessonsCount: number;
  totalPriceKopiyky: number;
}

export interface AddLessonData {
  studentId: number | null; // null for a trial lesson
  datetime: string;
  isCompleted: boolean;
  isTrial?: boolean;
  /** Trial lesson only: the name typed once, kept on the lesson itself. */
  studentName?: string | null;
}

export interface UpdateLessonData {
  datetime?: string;
  is_completed?: number;
  /** Trial lesson only: it has no student, so its name lives on the lesson. */
  student_name_cache?: string;
}

// # ELECTRON API

export interface ElectronAPI {
  // Students
  getStudents: () => Promise<Student[]>;
  /** balance is lessons already paid for: it is recorded as a payment and needs a price. */
  addStudent: (
    name: string,
    balance: number,
    priceKopiyky?: number | null,
    isTaxExempt?: boolean,
    discount?: DiscountInput | null,
  ) => Promise<{ id: number; name: string; balance: number }>;
  updateBalance: (
    studentId: number,
    amount: number,
  ) => Promise<{ lessons: number; amount: number }>;
  payForLessons: (
    studentId: number,
    amount: number,
    totalPriceKopiyky: number | null,
  ) => Promise<void>;
  markUnpaidLessonsPaid: (studentId: number, count: number) => Promise<void>;
  setStudentTaxExempt: (studentId: number, exempt: boolean) => Promise<void>;
  updateStudentName: (studentId: number, name: string) => Promise<void>;
  /** Open slots and their money: what a refund on deletion gives back. */
  getStudentAdvance: (studentId: number) => Promise<{ lessons: number; amount: number }>;
  /** refundAdvance: hand the advance back as a refund, otherwise it stays as income. */
  deleteStudent: (studentId: number, refundAdvance: boolean) => Promise<void>;

  // Lesson prices (all in kopiyky)
  setStudentPrice: (studentId: number, priceKopiyky: number) => Promise<{ id: number }>;
  getStudentCurrentPrice: (studentId: number) => Promise<LessonPrice | null>;
  getStudentPriceHistory: (studentId: number) => Promise<LessonPrice[]>;
  deleteStudentPrice: (priceId: number) => Promise<void>;

  // Discounts (total_price in kopiyky)
  getDiscounts: (studentId: number) => Promise<Discount[]>;
  getGlobalDiscounts: () => Promise<Discount[]>;
  addDiscount: (
    studentId: number | null,
    lessonsCount: number,
    totalPriceKopiyky: number,
    description?: string | null,
  ) => Promise<{ id: number }>;
  deleteDiscount: (discountId: number) => Promise<void>;
  toggleDiscountActive: (discountId: number) => Promise<void>;
  findApplicableDiscount: (studentId: number, count: number) => Promise<Discount | null>;

  // Tax settings
  getTaxSettings: () => Promise<TaxSettings>;
  saveTaxSettings: (settings: Omit<TaxSettings, 'id' | 'updated_at'>) => Promise<void>;

  // Financial stats (totals in kopiyky)
  getEarningsStats: (startDate: string, endDate: string) => Promise<EarningsStats>;
  getEarningsByDay: (startDate: string, endDate: string) => Promise<EarningsByDay[]>;
  getEarningsByStudent: (startDate: string, endDate: string) => Promise<EarningsByStudent[]>;
  getCashStats: (startDate: string, endDate: string) => Promise<CashStats>;
  getCashByDay: (startDate: string, endDate: string) => Promise<EarningsByDay[]>;
  getCashByStudent: (startDate: string, endDate: string) => Promise<EarningsByStudent[]>;
  getBalanceTotals: (asOf: string) => Promise<BalanceTotals>;
  getBalanceHistory: (startDate: string, endDate: string) => Promise<BalanceHistoryEntry[]>;

  // Lessons
  getLessons: (startDate: string, endDate: string) => Promise<Lesson[]>;
  addLesson: (data: AddLessonData) => Promise<{ id: number }>;
  updateLesson: (id: number, updates: UpdateLessonData) => Promise<void>;
  toggleLessonPayment: (id: number) => Promise<void>;
  deleteLesson: (id: number) => Promise<void>;

  // Schedules
  getSchedules: (studentId: number) => Promise<Schedule[]>;
  getWeeklyScheduleCounts: () => Promise<WeeklyScheduleCount[]>;
  addSchedule: (studentId: number, dayOfWeek: number, time: string) => Promise<{ id: number }>;
  deleteSchedule: (scheduleId: number) => Promise<void>;
  toggleScheduleActive: (scheduleId: number) => Promise<void>;
  autoCreateLessons: (studentId: number) => Promise<number>;

  // Sync
  syncLessons: () => Promise<number>;

  // Cloud sync
  getSyncSettings: () => Promise<SyncSettings>;
  /** An empty secret keeps the stored one; an empty url switches the sync off. */
  saveSyncSettings: (settings: { url: string; secret: string | null }) => Promise<SyncSettings>;
  getSyncStatus: () => Promise<SyncStatus>;
  syncNow: () => Promise<SyncStatus>;
  /** Intents from the phone were applied; students and lessons need a reload. */
  onSyncChanged: (callback: (event: { applied: number }) => void) => () => void;
  onSyncStatus: (callback: (status: SyncStatus) => void) => () => void;

  // Updates
  getReleaseNotes: () => Promise<ReleaseNotes | null>;
}

export interface ReleaseNotes {
  version: string;
  notes: string;
}

export interface SyncSettings {
  url: string;
  hasSecret: boolean;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  error: string | null;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

// # MODAL & STORE TYPES

export interface ModalState {
  addStudent: boolean;
  addLesson: boolean;
  studentsList: boolean;
  editLesson: boolean;
  schedule: boolean;
  taxSettings: boolean;
  discounts: boolean;
  syncSettings: boolean;
}

export type ModalName = keyof ModalState;
export type Theme = 'default' | 'purple';
export type AppView = 'calendar' | 'finance';

export interface AppState {
  students: Student[];
  studentsLoading: boolean;
  studentsError: string | null;

  lessons: Lesson[];
  lessonsLoading: boolean;
  lessonsError: string | null;
  /** Counter bumped on every lessons reload; a refetch signal for views with own queries. */
  dataVersion: number;

  schedules: Schedule[];
  schedulesLoading: boolean;
  schedulesError: string | null;

  currentWeek: Date;
  currentView: AppView;

  modals: ModalState;
  selectedLesson: Lesson | null;
  selectedStudentForSchedule: Student | null;
  selectedStudentForDiscounts: Student | null;
  prefilledLessonDateTime: Date | null;
  prefilledLessonStudentId: number | null;
  /** The open modal was reached from the students list, so it offers a way back. */
  returnToStudentsList: boolean;

  theme: Theme;
  taxSettings: TaxSettings | null;
  syncStatus: SyncStatus | null;

  // Actions — Students
  loadStudents: () => Promise<void>;
  addStudent: (
    name: string,
    balance: number,
    priceKopiyky?: number | null,
    isTaxExempt?: boolean,
    discount?: DiscountInput | null,
  ) => Promise<Student>;
  deleteStudent: (studentId: number, refundAdvance: boolean) => Promise<void>;
  updateBalance: (studentId: number, amount: number) => Promise<number>;
  setStudentTaxExempt: (studentId: number, exempt: boolean) => Promise<void>;
  updateStudentName: (studentId: number, name: string) => Promise<void>;

  // Actions — Lessons
  loadLessons: () => Promise<void>;
  addLesson: (data: AddLessonData) => Promise<void>;
  updateLesson: (lessonId: number, updates: UpdateLessonData) => Promise<void>;
  toggleLessonPayment: (lessonId: number) => Promise<void>;
  deleteLesson: (lessonId: number) => Promise<void>;
  syncLessons: () => Promise<void>;

  // Actions — Schedules
  loadSchedules: (studentId: number) => Promise<void>;
  addSchedule: (studentId: number, dayOfWeek: number, time: string) => Promise<void>;
  deleteSchedule: (scheduleId: number) => Promise<void>;
  toggleScheduleActive: (scheduleId: number) => Promise<void>;
  autoCreateLessons: (studentId: number) => Promise<number>;

  // Actions — Navigation
  nextWeek: () => void;
  prevWeek: () => void;
  goToToday: () => void;

  // Actions — View
  setView: (view: AppView) => void;

  // Actions — Modals
  openModal: (modalName: ModalName) => void;
  openAddLessonModal: (datetime: Date | null, studentId?: number) => void;
  setReturnToStudentsList: (value: boolean) => void;
  closeModal: (modalName: ModalName) => void;
  selectLesson: (lesson: Lesson) => void;
  selectStudentForSchedule: (student: Student) => void;
  selectStudentForDiscounts: (student: Student) => void;

  // Actions — Tax settings
  loadTaxSettings: () => Promise<void>;
  saveTaxSettings: (settings: Omit<TaxSettings, 'id' | 'updated_at'>) => Promise<void>;

  // Actions — Cloud sync
  setSyncStatus: (status: SyncStatus) => void;

  // App lifecycle
  initialize: () => Promise<void>;
  toggleTheme: () => void;
}
