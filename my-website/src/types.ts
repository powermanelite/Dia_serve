export type Tab = 'home' | 'calendar' | 'map';

export interface ScheduledEvent {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  email: string;
  timeSlot: string;
  message: string;
}
