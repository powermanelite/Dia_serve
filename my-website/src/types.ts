export type Tab = 'home' | 'calendar' | 'map';

export interface ScheduledEvent {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  email: string;
  timeSlot: string;    // start time
  endTimeSlot?: string; // end time (exclusive); defaults to 1 hour after start
  message: string;
  isSweeping?: boolean;
  streetName?: string;
}

export interface SweepingCalendarRequest {
  street: string;
  // Each entry is one sweeping side: label (e.g. "East side"), day(s) joined by "/", formatted time range
  sides: Array<{ label: string; day: string; time: string }>;
}
