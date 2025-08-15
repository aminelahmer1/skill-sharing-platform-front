
export interface CalendarEvent {
  id: number;
  skillId: number;
  skillName: string;
  skillDescription?: string;
  producerId: number;
  producerName: string;
  receiverId: number;
  receiverName: string;
  status: EventStatus;
  streamingDate: string;
  streamingTime: string;
  price?: number;
  categoryName?: string;
  role: 'PRODUCER' | 'RECEIVER';
  eventType: EventType;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export type EventStatus = 
  | 'PENDING' 
  | 'ACCEPTED' 
  | 'SCHEDULED' 
  | 'IN_PROGRESS' 
  | 'COMPLETED' 
  | 'REJECTED' 
  | 'CANCELLED';

export type EventType = 
  | 'pending' 
  | 'accepted' 
  | 'scheduled' 
  | 'live' 
  | 'completed' 
  | 'rejected' 
  | 'cancelled';


export interface CalendarView {
  type: 'month' | 'week' | 'day' | 'list';
  startDate: Date;
  endDate: Date;
  currentDate: Date;
}

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
  dayNumber: number;
  monthName?: string;
}

export interface CalendarWeek {
  weekNumber: number;
  days: CalendarDay[];
}

export interface CalendarMonth {
  month: number;
  year: number;
  weeks: CalendarWeek[];
  name: string;
}

export interface CalendarFilter {
  status?: EventStatus[];
  eventType?: EventType[];
  searchTerm?: string;
  showPastEvents?: boolean;
  showFutureEvents?: boolean;
}