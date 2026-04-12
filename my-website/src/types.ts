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
  oddSide: { day?: string; time?: string; raw?: string } | null;
  evenSide: { day?: string; time?: string; raw?: string } | null;
}
