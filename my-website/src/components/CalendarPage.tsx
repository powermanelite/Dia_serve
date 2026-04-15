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

// Must match the CSS --planner-row-height value (56px)
const ROW_HEIGHT = 56;

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
  endTimeSlot: string;
  message: string;
  recurrence: Recurrence;
  recurrenceCount: number;
  editingId: string | null; // non-null when editing an existing event
  isSweeping?: boolean;
  streetName?: string;
  stopRepeat?: boolean;
}

const EMPTY_MODAL: ModalState = {
  date: '', name: '', email: '',
  timeSlot: PLANNER_HOURS[2], endTimeSlot: PLANNER_HOURS[3],
  message: '', recurrence: 'none', recurrenceCount: 4, editingId: null,
};

const DAY_NAME_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

// ── US Holiday calculation ────────────────────────────────────────

function _dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** nth occurrence of weekday (0=Sun) in a month (0-indexed). n is 1-based. */
function _nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const d = new Date(year, month, 1);
  d.setDate(1 + ((weekday - d.getDay() + 7) % 7) + (n - 1) * 7);
  return d;
}

/** Last occurrence of weekday in a month. */
function _lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  last.setDate(last.getDate() - ((last.getDay() - weekday + 7) % 7));
  return last;
}

/** Shift a fixed holiday to its observed date (Sat → Fri, Sun → Mon). */
function _observed(d: Date): Date {
  const day = d.getDay();
  if (day === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  if (day === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return d;
}

/**
 * Returns a map of YYYY-MM-DD → holiday name for US federal holidays
 * observed by San Francisco and Daly City street sweeping.
 */
function getUSHolidays(year: number): Record<string, string> {
  const h: Record<string, string> = {};
  const add = (d: Date, name: string) => { h[_dateKey(d)] = name; };

  // Fixed-date holidays (adjusted to observed weekday)
  add(_observed(new Date(year, 0,  1)),  "New Year's Day");
  add(_observed(new Date(year, 5, 19)),  'Juneteenth');
  add(_observed(new Date(year, 6,  4)),  'Independence Day');
  add(_observed(new Date(year, 10, 11)), 'Veterans Day');
  add(_observed(new Date(year, 11, 25)), 'Christmas Day');

  // Variable holidays
  add(_nthWeekday(year, 0, 1, 3),   'Martin Luther King Jr. Day'); // 3rd Mon Jan
  add(_nthWeekday(year, 1, 1, 3),   "Presidents' Day");            // 3rd Mon Feb
  add(_lastWeekday(year, 4, 1),     'Memorial Day');                // Last Mon May
  add(_nthWeekday(year, 8, 1, 1),   'Labor Day');                   // 1st Mon Sep
  add(_nthWeekday(year, 9, 1, 2),   'Indigenous Peoples Day');      // 2nd Mon Oct
  add(_nthWeekday(year, 10, 4, 4),  'Thanksgiving');                // 4th Thu Nov

  return h;
}

function getUpcomingDatesForDayInYear(dayName: string): string[] {
  const target = DAY_NAME_MAP[dayName.toLowerCase()];
  if (target === undefined) return [];
  const dates: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Advance to the next occurrence of the target day (0 = today if it matches)
  const diff = (target - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  // Generate all occurrences through Dec 31 of the current year
  const endOfYear = new Date(d.getFullYear(), 11, 31);
  while (d <= endOfYear) {
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

function parseEndTimeSlot(time?: string, startSlot?: string): string | undefined {
  if (time) {
    // Try to parse a range like "8 AM - 10 AM"
    const rangeMatch = time.match(
      /\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i,
    );
    if (rangeMatch) {
      const endHour = rangeMatch[1];
      const endMin = rangeMatch[2] || '00';
      const endAmpm = rangeMatch[3].toUpperCase();
      const candidate = `${endHour}:${endMin} ${endAmpm}`;
      if (PLANNER_HOURS.includes(candidate)) return candidate;
    }
  }
  // Default: 1 hour after start
  if (startSlot) {
    const idx = PLANNER_HOURS.indexOf(startSlot);
    if (idx !== -1 && idx < PLANNER_HOURS.length - 1) return PLANNER_HOURS[idx + 1];
  }
  return undefined;
}

/** Returns every planner hour that falls within [startSlot, endSlot). */
function getCoveredSlots(evs: import('../types').ScheduledEvent[]): Set<string> {
  const covered = new Set<string>();
  for (const ev of evs) {
    const startIdx = PLANNER_HOURS.indexOf(ev.timeSlot);
    if (startIdx === -1) continue;
    const endIdx = ev.endTimeSlot ? PLANNER_HOURS.indexOf(ev.endTimeSlot) : startIdx + 1;
    const actualEnd = endIdx === -1 ? PLANNER_HOURS.length : endIdx;
    for (let i = startIdx; i < actualEnd; i++) covered.add(PLANNER_HOURS[i]);
  }
  return covered;
}

interface CalendarPageProps {
  events: ScheduledEvent[];
  onEventsChange: React.Dispatch<React.SetStateAction<ScheduledEvent[]>>;
  sweepingRequest?: SweepingCalendarRequest | null;
  onSweepingHandled?: () => void;
  onViewOnMap?: (streetName: string) => void;
}

function CalendarPage({ events, onEventsChange, sweepingRequest, onSweepingHandled, onViewOnMap }: CalendarPageProps) {
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

    for (const { label, day, time } of sweepingRequest.sides) {
      if (!day) continue;
      // Handle slash-separated days like "Monday/Thursday"
      const dayNames = day.split('/').map((d) => d.trim());
      for (const dayName of dayNames) {
        const dates = getUpcomingDatesForDayInYear(dayName);
        const timeSlot = parseTimeSlot(time || undefined);
        const endTimeSlot = parseEndTimeSlot(time || undefined, timeSlot);
        for (const date of dates) {
          // Skip if already scheduled
          if (newEvents.some((e) => e.date === date && e.timeSlot === timeSlot && e.streetName === sweepingRequest.street)) continue;
          newEvents.push({
            id: `sweep-${sweepingRequest.street}-${label}-${date}-${Date.now()}`,
            date,
            name: `Street Sweeping: ${sweepingRequest.street}`,
            email: '',
            timeSlot,
            endTimeSlot,
            message: `${label} - ${dayName} ${time}`.trim(),
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
      setSweepingBanner(`Added ${newEvents.length} sweeping events for ${sweepingRequest.street} (through end of ${new Date().getFullYear()})`);
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

  // Holidays for the currently viewed year
  const holidays = getUSHolidays(viewYear);

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
    const startIdx = PLANNER_HOURS.indexOf(timeSlot);
    const endTimeSlot =
      startIdx < PLANNER_HOURS.length - 1
        ? PLANNER_HOURS[startIdx + 1]
        : PLANNER_HOURS[startIdx];
    setModal({ ...EMPTY_MODAL, date: selectedDate, timeSlot, endTimeSlot });
    setSubmitted(false);
    setErrors({});
  }

  function openModalForEdit(ev: ScheduledEvent) {
    const startIdx = PLANNER_HOURS.indexOf(ev.timeSlot);
    const defaultEnd =
      ev.endTimeSlot ??
      (startIdx < PLANNER_HOURS.length - 1 ? PLANNER_HOURS[startIdx + 1] : ev.timeSlot);
    setModal({
      date: ev.date,
      name: ev.name,
      email: ev.email,
      timeSlot: ev.timeSlot,
      endTimeSlot: defaultEnd,
      message: ev.message,
      recurrence: 'none',
      recurrenceCount: 4,
      editingId: ev.id,
      isSweeping: ev.isSweeping,
      streetName: ev.streetName,
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
    if (!modal.email.trim()) e.email = modal.isSweeping ? 'An email address is required to save street sweeping events' : 'Email is required';
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modal || !validate()) return;

    const dates = getRecurringDates(modal.date, modal.recurrence, modal.recurrenceCount);
    const newEvents: ScheduledEvent[] = dates.map((date, i) => ({
      id: i === 0 && modal.editingId ? modal.editingId : `${date}-${modal.timeSlot}-${Date.now()}-${Math.random()}`,
      date,
      name: modal.name.trim(),
      email: modal.email.trim(),
      timeSlot: modal.timeSlot,
      endTimeSlot: modal.endTimeSlot !== modal.timeSlot ? modal.endTimeSlot : undefined,
      message: modal.message.trim(),
      ...(modal.isSweeping && { isSweeping: true, streetName: modal.streetName }),
    }));

    if (modal.editingId) {
      onEventsChange((prev) => {
        let updated = prev.filter((ev) => ev.id !== modal.editingId);
        if (modal.stopRepeat && modal.streetName) {
          updated = updated.filter(
            (e) => !(e.isSweeping && e.streetName === modal.streetName && e.timeSlot === modal.timeSlot && e.date > modal.date)
          );
        }
        return [...updated, ...newEvents];
      });
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
  const coveredSlotsForSelected = getCoveredSlots(selectedDateEvents);
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
                const holidayName = holidays[dateStr];

                let cls = 'cal-cell';
                if (isSelected) cls += ' cal-cell--selected';
                if (isToday) cls += ' cal-cell--today';
                if (isPast) cls += ' cal-cell--past';
                else cls += ' cal-cell--available';
                if (holidayName) cls += ' cal-cell--holiday';

                return (
                  <button
                    key={day}
                    className={cls}
                    onClick={() => selectDate(day)}
                    aria-label={`${MONTH_NAMES[viewMonth]} ${day}${holidayName ? ` — ${holidayName}` : ''}`}
                    title={holidayName}
                  >
                    {day}
                    {holidayName && <span className="cal-holiday-dot" />}
                    {hasEvents && <span className={`cal-dot${hasSweeping ? ' cal-dot--sweep' : ''}`} />}
                  </button>
                );
              })}
            </div>

            <div className="cal-legend">
              <span className="legend-item"><span className="legend-dot legend-dot--available" />Available</span>
              <span className="legend-item"><span className="legend-dot legend-dot--today" />Today</span>
              <span className="legend-item"><span className="legend-dot legend-dot--holiday" />Holiday</span>
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
                {selectedDate && holidays[selectedDate] && (
                  <div className="holiday-notice">
                    <span className="holiday-notice-name">{holidays[selectedDate]}</span>
                    <span className="holiday-notice-msg">No street sweeping</span>
                  </div>
                )}
                <div className="planner-grid">
                  {/* Background rows – one per hour, clickable when open */}
                  {PLANNER_HOURS.map((hour) => {
                    const isCovered = coveredSlotsForSelected.has(hour);
                    const clickable = !isCovered && !isPastSelected;
                    return (
                      <div key={hour} className="planner-bg-row">
                        <span className="planner-time">{hour}</span>
                        <div
                          className={`planner-bg-slot${isPastSelected ? ' planner-bg-slot--past' : ''}${isCovered ? ' planner-bg-slot--covered' : ''}`}
                          onClick={() => clickable && openModalForTime(hour)}
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                        />
                      </div>
                    );
                  })}

                  {/* Absolute event blocks – span from start to end time */}
                  <div className="planner-events-layer">
                    {selectedDateEvents.map((ev) => {
                      const startIdx = PLANNER_HOURS.indexOf(ev.timeSlot);
                      if (startIdx === -1) return null;
                      const rawEndIdx = ev.endTimeSlot
                        ? PLANNER_HOURS.indexOf(ev.endTimeSlot)
                        : startIdx + 1;
                      const endIdx = rawEndIdx === -1 ? PLANNER_HOURS.length : rawEndIdx;
                      const spanRows = Math.max(endIdx - startIdx, 1);
                      const top = startIdx * ROW_HEIGHT + 2;
                      const height = spanRows * ROW_HEIGHT - 4;
                      const timeLabel = ev.endTimeSlot && ev.endTimeSlot !== ev.timeSlot
                        ? `${ev.timeSlot} – ${ev.endTimeSlot}`
                        : ev.timeSlot;

                      return (
                        <div
                          key={ev.id}
                          className={`planner-event${ev.isSweeping ? ' planner-event--sweep' : ''}`}
                          style={{ top, height }}
                        >
                          <div className="planner-event-content">
                            <span className="planner-event-name">{ev.name}</span>
                            <span className="planner-event-time">{timeLabel}</span>
                            {ev.message && <span className="planner-event-msg">{ev.message}</span>}
                          </div>
                          {!isPastSelected && (
                            <div className="planner-event-actions">
                              {ev.isSweeping && ev.streetName && onViewOnMap && (
                                <button
                                  className="planner-event-btn planner-event-btn--map"
                                  onClick={(e) => { e.stopPropagation(); onViewOnMap(ev.streetName!); }}
                                  aria-label="View on map"
                                  title="View on map"
                                >
                                  <MapPinIcon />
                                </button>
                              )}
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
                      );
                    })}
                  </div>
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
                  <strong>
                    {modal.timeSlot}
                    {modal.endTimeSlot && modal.endTimeSlot !== modal.timeSlot && ` – ${modal.endTimeSlot}`}
                  </strong>.
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
                  <p className="modal-date">
                    {modalDateLabel} &middot; {modal.timeSlot}
                    {modal.endTimeSlot && modal.endTimeSlot !== modal.timeSlot && ` – ${modal.endTimeSlot}`}
                  </p>
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
                    {modal.isSweeping && !errors.email && (
                      <span className="form-hint">Required — used to send sweeping reminders.</span>
                    )}
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
                  {PLANNER_HOURS.indexOf(modal.timeSlot) < PLANNER_HOURS.length - 1 && (
                    <div className="form-row">
                      <label className="form-label">End Time</label>
                      <select
                        className="form-input"
                        value={modal.endTimeSlot}
                        onChange={(e) => setModal({ ...modal, endTimeSlot: e.target.value })}
                      >
                        {PLANNER_HOURS.slice(PLANNER_HOURS.indexOf(modal.timeSlot) + 1).map((hour) => (
                          <option key={hour} value={hour}>{hour}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {modal.isSweeping ? (
                    <div className="form-row">
                      <label className="form-label">Recurrence</label>
                      <label className="recurrence-option">
                        <input
                          type="checkbox"
                          checked={!!modal.stopRepeat}
                          onChange={() => setModal({ ...modal, stopRepeat: !modal.stopRepeat })}
                        />
                        Stop repeating after this date
                      </label>
                    </div>
                  ) : (
                    <>
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
                    </>
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


function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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
