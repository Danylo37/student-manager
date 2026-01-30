import { useMemo, useCallback } from 'react';
import useAppStore from '@/store/appStore';
import type { Student } from '@/types';

interface StudentStats {
    total: number;
    lowBalance: number;
    negativeBalance: number;
    totalBalance: number;
}

interface UseStudentsReturn {
    // State
    students: Student[];
    studentsLoading: boolean;
    studentsError: string | null;
    studentsSorted: Student[];
    studentsLowBalance: Student[];
    studentsNegativeBalance: Student[];
    totalStudents: number;
    stats: StudentStats;

    // Actions
    loadStudents: () => Promise<void>;
    addStudent: (name: string, balance: number) => Promise<void>;
    deleteStudent: (studentId: number) => Promise<void>;
    updateBalance: (studentId: number, amount: number) => Promise<void>;

    // Helpers
    getStudentById: (studentId: number) => Student | undefined;
    searchStudents: (query: string) => Student[];
}

/**
 * Hook for working with students
 * Provides convenient methods and computed data
 */
function useStudents(): UseStudentsReturn {
    // Get state from store
    const students = useAppStore((state) => state.students);
    const studentsLoading = useAppStore((state) => state.studentsLoading);
    const studentsError = useAppStore((state) => state.studentsError);

    // Get actions from store
    const loadStudents = useAppStore((state) => state.loadStudents);
    const addStudent = useAppStore((state) => state.addStudent);
    const deleteStudent = useAppStore((state) => state.deleteStudent);
    const updateBalance = useAppStore((state) => state.updateBalance);

    /**
     * Get student by ID
     */
    const getStudentById = useCallback(
        (studentId: number): Student | undefined => {
            return students.find((s) => s.id === studentId);
        },
        [students],
    );

    /**
     * Search students by name
     */
    const searchStudents = useCallback(
        (query: string): Student[] => {
            if (!query || query.trim() === '') {
                return students;
            }

            const lowerQuery = query.toLowerCase().trim();
            return students.filter((student) => student.name.toLowerCase().includes(lowerQuery));
        },
        [students],
    );

    /**
     * Get students sorted by name
     */
    const studentsSorted = useMemo((): Student[] => {
        return [...students].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    }, [students]);

    /**
     * Get students with low balance (< 3)
     */
    const studentsLowBalance = useMemo((): Student[] => {
        return students.filter((s) => s.balance < 3);
    }, [students]);

    /**
     * Get students with negative balance
     */
    const studentsNegativeBalance = useMemo((): Student[] => {
        return students.filter((s) => s.balance < 0);
    }, [students]);

    /**
     * Get total number of students
     */
    const totalStudents = students.length;

    /**
     * Get statistics
     */
    const stats = useMemo((): StudentStats => {
        return {
            total: students.length,
            lowBalance: studentsLowBalance.length,
            negativeBalance: studentsNegativeBalance.length,
            totalBalance: students.reduce((sum, s) => sum + s.balance, 0),
        };
    }, [students, studentsLowBalance, studentsNegativeBalance]);

    return {
        // State
        students,
        studentsLoading,
        studentsError,
        studentsSorted,
        studentsLowBalance,
        studentsNegativeBalance,
        totalStudents,
        stats,

        // Actions
        loadStudents,
        addStudent,
        deleteStudent,
        updateBalance,

        // Helpers
        getStudentById,
        searchStudents,
    };
}

export default useStudents;
