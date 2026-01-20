import React, { useEffect } from 'react';
import useAppStore from './store/appStore';
import useBalanceSync from './hooks/useBalanceSync';
import Header from './components/Header/Header';
import WeekView from './components/Calendar/WeekView';

/**
 * Main application component
 */
function App() {
    const initialize = useAppStore((state) => state.initialize);

    // Auto-sync completed lessons
    useBalanceSync();

    // Initialize app on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header with actions and navigation */}
            <Header />
            {/* Main calendar view */}
            <WeekView />
        </div>
    );
}

export default App;