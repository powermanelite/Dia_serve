import { useState } from 'react';
import type { ScheduledEvent } from '../types';
import './CalendarPage.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const PLANNER_HOURS = [
  '7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
  '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM',
  '7:00 PM','8:00 PM',
];

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ModalState {
  date: string;
  name: string;
  email: string;
  timeSlot: string;
  message: string;
}

const EMPTY_MODAL: ModalState = { date: '', name: '', email: '', timeSlot: PLANNER_HOURS[2], message: '' };

function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<ModalState>>({});

  // Build the calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Events grouped by date
  const eventsByDate = events.reduce<Record<string, ScheduledEvent[]>>((acc, ev) => {
    (acc[ev.date] ??= []).push(ev);
    return acc;
  }, {});

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
    setSelectedDate(null);
  }

  function selectDate(day: number) {
    const dateStr = toDateStr(viewYear, viewMonth, day);
    setSelectedDate(dateStr);
  }

  function openModalForTime(timeSlot: string) {
    if (!selectedDate || selectedDate < todayStr) return;
    setModal({ ...EMPTY_MODAL, date: selectedDate, timeSlot });
    setSubmitted(false);
    setErrors({});
  }

  function validate(): boolean {
    const e: Partial<ModalState> = {};
    if (!modal) return false;
    if (!modal.name.trim()) e.name = 'Name is required';
    if (!modal.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(modal.email)) e.email = 'Invalid email address';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modal || !validate()) return;
    const newEvent: ScheduledEvent = {
      id: `${modal.date}-${Date.now()}`,
      date: modal.date,
      name: modal.name.trim(),
      email: modal.email.trim(),
      timeSlot: modal.timeSlot,
      message: modal.message.trim(),
    };
    setEvents((prev) => [...prev, newEvent]);
    setSubmitted(true);
  }

  const modalDateLabel = modal
    ? new Date(modal.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : '';

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
    : '';

  const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];
  const bookedTimesForSelected = new Set(selectedDateEvents.map((e) => e.timeSlot));
  const isPastSelected = selectedDate ? selectedDate < todayStr : false;

  return (
    <div className="cal-page">
      <div className="cal-page-inner">
        <div className="cal-header">
          <h1 className="cal-page-title">Schedule a Meeting</h1>
          <p className="cal-page-subtitle">
            Select a date to view the hourly planner, then pick a time to schedule.
          </p>
        </div>

        <div className="cal-layout">
          {/* Calendar */}
          <div className="cal-card">
            <div className="cal-nav">
              <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">
                <ChevronLeft />
              </button>
              <span className="cal-month-label">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">
                <ChevronRight />
              </button>
            </div>

            <div className="cal-grid">
              {DAY_NAMES.map((d) => (
                <div key={d} className="cal-day-name">{d}</div>
              ))}
              {cells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} className="cal-cell cal-cell--empty" />;
                const dateStr = toDateStr(viewYear, viewMonth, day);
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;
                const hasEvents = !!eventsByDate[dateStr];
                const isSelected = dateStr === selectedDate;

                let cls = 'cal-cell';
                if (isSelected) cls += ' cal-cell--selected';
                if (isToday) cls += ' cal-cell--today';
                if (isPast) cls += ' cal-cell--past';
                else cls += ' cal-cell--available';

                return (
                  <button
                    key={day}
                    className={cls}
                    onClick={() => selectDate(day)}
                    aria-label={`${MONTH_NAMES[viewMonth]} ${day}`}
                  >
                    {day}
                    {hasEvents && <span className="cal-dot" />}
                  </button>
                );
              })}
            </div>

            <div className="cal-legend">
              <span className="legend-item"><span className="legend-dot legend-dot--available" />Available</span>
              <span className="legend-item"><span className="legend-dot legend-dot--booked" />Has Events</span>
              <span className="legend-item"><span className="legend-dot legend-dot--today" />Today</span>
            </div>
          </div>

          {/* Hourly Planner */}
          <div className="planner-card">
            {selectedDate ? (
              <>
                <div className="planner-header">
                  <h3 className="planner-title">{selectedDateLabel}</h3>
                  {!isPastSelected && (
                    <span className="planner-hint">Click a time slot to schedule</span>
                  )}
                </div>
                <div className="planner-hours">
                  {PLANNER_HOURS.map((hour) => {
                    const eventsAtHour = selectedDateEvents.filter((e) => e.timeSlot === hour);
                    const isBooked = bookedTimesForSelected.has(hour);

                    return (
                      <div key={hour} className={`planner-row${isBooked ? ' planner-row--booked' : ''}`}>
                        <span className="planner-time">{hour}</span>
                        <div
                          className={`planner-slot${isBooked ? ' planner-slot--booked' : ''}${isPastSelected ? ' planner-slot--past' : ''}`}
                          onClick={() => !isBooked && !isPastSelected && openModalForTime(hour)}
                          role={!isBooked && !isPastSelected ? 'button' : undefined}
                          tabIndex={!isBooked && !isPastSelected ? 0 : undefined}
                        >
                          {eventsAtHour.length > 0 ? (
                            eventsAtHour.map((ev) => (
                              <div key={ev.id} className="planner-event">
                                <span className="planner-event-name">{ev.name}</span>
                                <span className="planner-event-msg">{ev.message || ev.email}</span>
                              </div>
                            ))
                          ) : (
                            !isPastSelected && <span className="planner-empty">Available</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="planner-placeholder">
                <CalendarIcon />
                <p>Select a date to view the hourly schedule</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Close">
              <CloseIcon />
            </button>

            {submitted ? (
              <div className="modal-success">
                <div className="success-icon">&#10003;</div>
                <h3>You're all set!</h3>
                <p>
                  Meeting request received for <strong>{modalDateLabel}</strong> at{' '}
                  <strong>{modal.timeSlot}</strong>. I'll confirm shortly.
                </p>
                <button className="btn-primary" onClick={() => setModal(null)}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <h2 className="modal-title">Request a Meeting</h2>
                  <p className="modal-date">{modalDateLabel} &middot; {modal.timeSlot}</p>
                </div>
                <form className="modal-form" onSubmit={handleSubmit} noValidate>
                  <div className="form-row">
                    <label className="form-label">Your Name *</label>
                    <input
                      className={`form-input${errors.name ? ' form-input--error' : ''}`}
                      type="text"
                      placeholder="Jane Smith"
                      value={modal.name}
                      onChange={(e) => setModal({ ...modal, name: e.target.value })}
                    />
                    {errors.name && <span className="form-error">{errors.name}</span>}
                  </div>
                  <div className="form-row">
                    <label className="form-label">Email Address *</label>
                    <input
                      className={`form-input${errors.email ? ' form-input--error' : ''}`}
                      type="email"
                      placeholder="jane@example.com"
                      value={modal.email}
                      onChange={(e) => setModal({ ...modal, email: e.target.value })}
                    />
                    {errors.email && <span className="form-error">{errors.email}</span>}
                  </div>
                  <div className="form-row">
                    <label className="form-label">Message (optional)</label>
                    <textarea
                      className="form-input form-textarea"
                      placeholder="What would you like to discuss?"
                      value={modal.message}
                      onChange={(e) => setModal({ ...modal, message: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <button type="submit" className="btn-primary btn-full">
                    Send Request
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default CalendarPage;
