import { useEffect } from 'react';
import useAppStore from './store/appStore';
import useBalanceSync from './hooks/useBalanceSync';
import useLessonTimers from './hooks/useLessonTimers';
import Header from './components/Header/Header';
import WeekView from './components/Calendar/WeekView';
import AddStudentModal from './components/Modals/AddStudentModal';
import AddLessonModal from './components/Modals/AddLessonModal';
import StudentsListModal from './components/Modals/StudentsListModal';
import EditLessonModal from './components/Modals/EditLessonModal';
import ScheduleModal from './components/Modals/ScheduleModal';

/**
 * Main application component
 */
function App() {
    const initialize = useAppStore((state) => state.initialize);
    const studentsError = useAppStore((state) => state.studentsError);
    const lessonsError = useAppStore((state) => state.lessonsError);
    const theme = useAppStore((state) => state.theme);

    // Backup sync (in case the app was closed)
    useBalanceSync();

    // Reactive timers for each lesson
    useLessonTimers();

    // Initialize app on mount
    useEffect(() => {
        void initialize();
    }, [initialize]);

    return (
        <div className="flex flex-col h-screen bg-gray-50" data-theme={theme}>
            {/* Header with actions and navigation */}
            <Header />

            {/* Error messages */}
            {(studentsError || lessonsError) && (
                <div className="bg-red-50 border-b border-red-200 p-3 text-center">
                    <span className="text-red-700 text-sm font-medium">
                        ⚠️ {studentsError || lessonsError}
                    </span>
                </div>
            )}

            {/* Main calendar view */}
            <WeekView />

            {/* Modals */}
            <AddStudentModal />
            <AddLessonModal />
            <StudentsListModal />
            <EditLessonModal />
            <ScheduleModal />
        </div>
    );
}

export default App;
