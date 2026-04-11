export type Tab = 'home' | 'calendar' | 'map';

export interface ScheduledEvent {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  email: string;
  timeSlot: string;
  message: string;
  isSweeping?: boolean;
  streetName?: string;
}

export interface SweepingCalendarRequest {
  street: string;
  oddSide: { day?: string; time?: string; raw?: string } | null;
  evenSide: { day?: string; time?: string; raw?: string } | null;
}
