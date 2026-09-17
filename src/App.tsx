import { useEffect } from 'react';
import useAppStore from './store/appStore';
import useBalanceSync from './hooks/useBalanceSync';
import useLessonTimers from './hooks/useLessonTimers';
import Header from './components/Header/Header';
import WeekView from './components/Calendar/WeekView';
import FinanceView from './components/Finance/FinanceView';
import AddStudentModal from './components/Modals/AddStudentModal';
import AddLessonModal from './components/Modals/AddLessonModal';
import StudentsListModal from './components/Modals/StudentsListModal';
import EditLessonModal from './components/Modals/EditLessonModal';
import ScheduleModal from './components/Modals/ScheduleModal';
import TaxSettingsModal from './components/Modals/TaxSettingsModal';
import DiscountsModal from './components/Modals/DiscountsModal';
import SyncSettingsModal from './components/Modals/SyncSettingsModal';
import SyncHistoryModal from './components/Modals/SyncHistoryModal';
import WhatsNewModal from './components/Modals/WhatsNewModal';
import { NotificationProvider } from './components/common/NotificationProvider';
import CloudSync from './components/common/CloudSync';

function App() {
  const initialize = useAppStore((state) => state.initialize);
  const studentsError = useAppStore((state) => state.studentsError);
  const lessonsError = useAppStore((state) => state.lessonsError);
  const theme = useAppStore((state) => state.theme);
  const currentView = useAppStore((state) => state.currentView);

  useBalanceSync();
  useLessonTimers();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <NotificationProvider>
      <CloudSync />
      <div className="flex flex-col h-screen bg-gray-50" data-theme={theme}>
        <Header />

        {(studentsError || lessonsError) && (
          <div className="bg-red-50 border-b border-red-200 p-3 text-center">
            <span className="text-red-700 text-sm font-medium">
              ⚠️ {studentsError || lessonsError}
            </span>
          </div>
        )}

        {currentView === 'calendar' ? <WeekView /> : <FinanceView />}

        <AddStudentModal />
        <AddLessonModal />
        <StudentsListModal />
        <EditLessonModal />
        <ScheduleModal />
        <TaxSettingsModal />
        <DiscountsModal />
        <SyncSettingsModal />
        <SyncHistoryModal />
        <WhatsNewModal />
      </div>
    </NotificationProvider>
  );
}

export default App;
