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
  const [mapPinRequest, setMapPinRequest] = useState<string | null>(null);
  const [gcalToken, setGcalToken] = useState<string | null>(null);
  const [gcalUser, setGcalUser] = useState<{ name: string; email: string; picture: string } | null>(null);

  function handleAddToCalendar(request: SweepingCalendarRequest) {
    setSweepingRequest(request);
    setActiveTab('calendar');
  }

  function handleViewOnMap(streetName: string) {
    setMapPinRequest(streetName);
    setActiveTab('map');
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
            onViewOnMap={handleViewOnMap}
            gcalToken={gcalToken}
            gcalUser={gcalUser}
            onGcalSignIn={(token, user) => { setGcalToken(token); setGcalUser(user); }}
            onGcalSignOut={() => { setGcalToken(null); setGcalUser(null); setEvents([]); }}
          />
        )}
        {activeTab === 'map' && <MapPage onAddToCalendar={handleAddToCalendar} pinRequest={mapPinRequest} onPinHandled={() => setMapPinRequest(null)} />}
      </main>
    </div>
  );
}

export default App;
