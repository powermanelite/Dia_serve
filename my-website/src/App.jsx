import { useState } from 'react';
import './App.css';
import Calendar from './Calendar';

function App() {
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <div className="App">
      <header>
        <h1>My Website</h1>
        <nav>
          <button 
            onClick={() => setShowCalendar(false)}
            className={!showCalendar ? 'active' : ''}
          >
            About
          </button>
          <button 
            onClick={() => setShowCalendar(true)}
            className={showCalendar ? 'active' : ''}
          >
            Calendar
          </button>
        </nav>
      </header>

      <main>
        {!showCalendar ? (
          <div className="about-page">
            <h2>About Me</h2>
            <p>Welcome to my website! This is the about section.</p>
            <p>You can add your personal information, bio, or any content you'd like here.</p>
          </div>
        ) : (
          <div className="calendar-page">
            <Calendar />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;