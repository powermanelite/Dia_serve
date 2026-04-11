import { useState } from 'react';
import type { Tab, ScheduledEvent, SweepingCalendarRequest } from './types';
import Home from './components/Home';
import CalendarPage from './components/CalendarPage';
import MapPage from './components/MapPage';
import './App.css';

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'map', label: 'Map' },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [sweepingRequest, setSweepingRequest] = useState<SweepingCalendarRequest | null>(null);
  const [events, setEvents] = useState<ScheduledEvent[]>([]);

  function handleAddToCalendar(request: SweepingCalendarRequest) {
    setSweepingRequest(request);
    setActiveTab('calendar');
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <nav className="header-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-tab${activeTab === tab.id ? ' nav-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'home' && <Home />}
        {activeTab === 'calendar' && (
          <CalendarPage
            events={events}
            onEventsChange={setEvents}
            sweepingRequest={sweepingRequest}
            onSweepingHandled={() => setSweepingRequest(null)}
          />
        )}
        {activeTab === 'map' && <MapPage onAddToCalendar={handleAddToCalendar} />}
      </main>
    </div>
  );
}

export default App;
