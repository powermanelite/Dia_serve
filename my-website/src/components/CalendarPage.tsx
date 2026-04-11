import { useState, useEffect } from 'react';
import type { ScheduledEvent, SweepingCalendarRequest } from '../types';
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

type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
];

interface ModalState {
  date: string;
  name: string;
  email: string;
  timeSlot: string;
  message: string;
  recurrence: Recurrence;
  recurrenceCount: number;
  editingId: string | null; // non-null when editing an existing event
}

const EMPTY_MODAL: ModalState = {
  date: '', name: '', email: '', timeSlot: PLANNER_HOURS[2],
  message: '', recurrence: 'none', recurrenceCount: 4, editingId: null,
};

const DAY_NAME_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function getUpcomingDatesForDay(dayName: string, weeks: number = 4): string[] {
  const target = DAY_NAME_MAP[dayName.toLowerCase()];
  if (target === undefined) return [];
  const dates: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Advance to the next occurrence
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  for (let i = 0; i < weeks; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

function parseTimeSlot(time?: string): string {
  if (!time) return PLANNER_HOURS[2];
  // Try to match the start hour to a planner slot (e.g. "8 AM - 10 AM" → "8:00 AM")
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return PLANNER_HOURS[2];
  const hour = match[1];
  const min = match[2] || '00';
  const ampm = match[3].toUpperCase();
  const candidate = `${hour}:${min} ${ampm}`;
  return PLANNER_HOURS.find((h) => h === candidate) ?? PLANNER_HOURS[2];
}

interface CalendarPageProps {
  events: ScheduledEvent[];
  onEventsChange: React.Dispatch<React.SetStateAction<ScheduledEvent[]>>;
  sweepingRequest?: SweepingCalendarRequest | null;
  onSweepingHandled?: () => void;
}

function CalendarPage({ events, onEventsChange, sweepingRequest, onSweepingHandled }: CalendarPageProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<ModalState>>({});
  const [sweepingBanner, setSweepingBanner] = useState<string | null>(null);

  // Handle incoming sweeping request from Map page
  useEffect(() => {
    if (!sweepingRequest) return;

    const newEvents: ScheduledEvent[] = [];
    const sides = [
      { label: 'Odd side', side: sweepingRequest.oddSide },
      { label: 'Even side', side: sweepingRequest.evenSide },
    ];

    for (const { label, side } of sides) {
      if (!side?.day) continue;
      // Handle slash-separated days like "Monday/Thursday"
      const dayNames = side.day.split('/').map((d) => d.trim());
      for (const dayName of dayNames) {
        const dates = getUpcomingDatesForDay(dayName);
        const timeSlot = parseTimeSlot(side.time ?? undefined);
        for (const date of dates) {
          // Skip if already scheduled
          if (newEvents.some((e) => e.date === date && e.timeSlot === timeSlot && e.streetName === sweepingRequest.street)) continue;
          newEvents.push({
            id: `sweep-${sweepingRequest.street}-${label}-${date}-${Date.now()}`,
            date,
            name: `Street Sweeping: ${sweepingRequest.street}`,
            email: '',
            timeSlot,
            message: `${label} - ${dayName} ${side.time || ''}`.trim(),
            isSweeping: true,
            streetName: sweepingRequest.street,
          });
        }
      }
    }

    if (newEvents.length > 0) {
      onEventsChange((prev) => {
        // Remove existing sweeping events for this street to avoid duplicates
        const filtered = prev.filter((e) => !(e.isSweeping && e.streetName === sweepingRequest.street));
        return [...filtered, ...newEvents];
      });
      // Navigate to the first event's month
      const firstDate = new Date(newEvents[0].date + 'T00:00:00');
      setViewYear(firstDate.getFullYear());
      setViewMonth(firstDate.getMonth());
      setSelectedDate(newEvents[0].date);
      setSweepingBanner(`Added ${newEvents.length} sweeping events for ${sweepingRequest.street} (next 4 weeks)`);
    }

    onSweepingHandled?.();
  }, [sweepingRequest, onSweepingHandled]);

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

  function openModalForEdit(ev: ScheduledEvent) {
    setModal({
      date: ev.date,
      name: ev.name,
      email: ev.email,
      timeSlot: ev.timeSlot,
      message: ev.message,
      recurrence: 'none',
      recurrenceCount: 4,
      editingId: ev.id,
    });
    setSubmitted(false);
    setErrors({});
  }

  function deleteEvent(id: string) {
    onEventsChange((prev) => prev.filter((e) => e.id !== id));
    setModal(null);
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

  function getRecurringDates(startDate: string, recurrence: Recurrence, count: number): string[] {
    if (recurrence === 'none') return [startDate];
    const dates: string[] = [];
    const d = new Date(startDate + 'T00:00:00');
    for (let i = 0; i < count; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
      if (recurrence === 'daily') d.setDate(d.getDate() + 1);
      else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
      else if (recurrence === 'biweekly') d.setDate(d.getDate() + 14);
      else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    }
    return dates;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modal || !validate()) return;

    const dates = getRecurringDates(modal.date, modal.recurrence, modal.recurrenceCount);
    const newEvents: ScheduledEvent[] = dates.map((date, i) => ({
      id: i === 0 && modal.editingId ? modal.editingId : `${date}-${modal.timeSlot}-${Date.now()}-${Math.random()}`,
      date,
      name: modal.name.trim(),
      email: modal.email.trim(),
      timeSlot: modal.timeSlot,
      message: modal.message.trim(),
    }));

    if (modal.editingId) {
      // Replace the original event with updated + any new recurring events
      onEventsChange((prev) => [
        ...prev.filter((ev) => ev.id !== modal.editingId),
        ...newEvents,
      ]);
    } else {
      onEventsChange((prev) => [...prev, ...newEvents]);
    }
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

        {sweepingBanner && (
          <div className="sweep-banner">
            <span>{sweepingBanner}</span>
            <button className="sweep-banner-close" onClick={() => setSweepingBanner(null)}>&times;</button>
          </div>
        )}

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
                const dateEvents = eventsByDate[dateStr];
                const hasEvents = !!dateEvents;
                const hasSweeping = dateEvents?.some((e) => e.isSweeping) ?? false;
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
                    {hasEvents && <span className={`cal-dot${hasSweeping ? ' cal-dot--sweep' : ''}`} />}
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
                              <div key={ev.id} className={`planner-event${ev.isSweeping ? ' planner-event--sweep' : ''}`}>
                                <div className="planner-event-content">
                                  <span className="planner-event-name">{ev.name}</span>
                                  <span className="planner-event-msg">{ev.message || ev.email}</span>
                                </div>
                                {!isPastSelected && (
                                  <div className="planner-event-actions">
                                    <button
                                      className="planner-event-btn planner-event-btn--edit"
                                      onClick={(e) => { e.stopPropagation(); openModalForEdit(ev); }}
                                      aria-label="Edit event"
                                      title="Edit"
                                    >
                                      <EditIcon />
                                    </button>
                                    <button
                                      className="planner-event-btn planner-event-btn--delete"
                                      onClick={(e) => { e.stopPropagation(); deleteEvent(ev.id); }}
                                      aria-label="Delete event"
                                      title="Delete"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                )}
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
                  <strong>{modal.timeSlot}</strong>.
                  {modal.recurrence !== 'none' && (
                    <> Repeating {RECURRENCE_OPTIONS.find((o) => o.value === modal.recurrence)?.label.toLowerCase()} for {modal.recurrenceCount} occurrences.</>
                  )}
                  {' '}I'll confirm shortly.
                </p>
                <button className="btn-primary" onClick={() => setModal(null)}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <h2 className="modal-title">{modal.editingId ? 'Edit Event' : 'Request a Meeting'}</h2>
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
                  <div className="form-row">
                    <label className="form-label">Repeat</label>
                    <select
                      className="form-input"
                      value={modal.recurrence}
                      onChange={(e) => setModal({ ...modal, recurrence: e.target.value as Recurrence })}
                    >
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {modal.recurrence !== 'none' && (
                    <div className="form-row">
                      <label className="form-label">Number of occurrences</label>
                      <input
                        className="form-input"
                        type="number"
                        min={2}
                        max={52}
                        value={modal.recurrenceCount}
                        onChange={(e) => setModal({ ...modal, recurrenceCount: Math.max(2, Math.min(52, Number(e.target.value))) })}
                      />
                      <span className="form-hint">
                        {modal.recurrence === 'daily' && `${modal.recurrenceCount} days`}
                        {modal.recurrence === 'weekly' && `${modal.recurrenceCount} weeks`}
                        {modal.recurrence === 'biweekly' && `${modal.recurrenceCount * 2} weeks`}
                        {modal.recurrence === 'monthly' && `${modal.recurrenceCount} months`}
                      </span>
                    </div>
                  )}
                  <button type="submit" className="btn-primary btn-full">
                    {modal.editingId ? 'Save Changes' : 'Send Request'}
                  </button>
                  {modal.editingId && (
                    <button
                      type="button"
                      className="btn-danger btn-full"
                      onClick={() => deleteEvent(modal.editingId!)}
                    >
                      Delete Event
                    </button>
                  )}
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

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
