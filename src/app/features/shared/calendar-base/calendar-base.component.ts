import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent, CalendarMonth, CalendarView, CalendarFilter, EventStatus } from '../../../models/calendar/calendar-event';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { CalendarEventModalComponent } from '../calendar-event-modal/calendar-event-modal.component';

interface ExtendedCalendarEvent extends CalendarEvent {
  isSkillOnly?: boolean;
  hasNoExchange?: boolean;
  availableQuantity?: number;
  nbInscrits?: number;
}

interface EventGroup {
  date: Date;
  events: ExtendedCalendarEvent[];
}

@Component({
  selector: 'app-calendar-base',
  standalone: true,
  imports: [CommonModule, CalendarEventModalComponent],
  templateUrl: './calendar-base.component.html',
  styleUrls: ['./calendar-base.component.css']
})
export class CalendarBaseComponent implements OnInit, OnChanges {
  @Input() userRole: 'PRODUCER' | 'RECEIVER' = 'RECEIVER';
  @Input() events: ExtendedCalendarEvent[] = [];
  @Output() eventClick = new EventEmitter<ExtendedCalendarEvent>();
  @Output() dateClick = new EventEmitter<Date>();
  @Output() viewChange = new EventEmitter<CalendarView>();

  currentView: CalendarView = {
    type: 'month',
    startDate: new Date(),
    endDate: new Date(),
    currentDate: new Date()
  };

  calendarMonth!: CalendarMonth;
  weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  selectedEvent: ExtendedCalendarEvent | null = null;
  showEventModal = false;
  
  // Suppression des filtres - on affiche tout
  filter: CalendarFilter = {
    showPastEvents: true,
    showFutureEvents: true,
    status: []
  };

  filteredEvents: ExtendedCalendarEvent[] = [];

  constructor(private calendarService: CalendarService) {}

  ngOnInit(): void {
    this.initializeCalendar();
    this.filteredEvents = this.events; // Afficher tous les événements
  }

  ngOnChanges(): void {
    this.filteredEvents = this.events; // Afficher tous les événements sans filtre
    this.generateCalendar();
  }

  private initializeCalendar(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.currentView = {
      type: 'month',
      startDate: startOfMonth,
      endDate: endOfMonth,
      currentDate: now
    };
    
    this.generateCalendar();
  }

  private generateCalendar(): void {
    if (this.currentView.type === 'month') {
      this.calendarMonth = this.calendarService.generateMonthCalendar(
        this.currentView.currentDate.getFullYear(),
        this.currentView.currentDate.getMonth(),
        this.filteredEvents
      );
    }
  }

  // Navigation
  navigatePrevious(): void {
    const current = this.currentView.currentDate;
    let newDate: Date;
    
    switch (this.currentView.type) {
      case 'month':
        newDate = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        break;
      case 'week':
        newDate = new Date(current);
        newDate.setDate(current.getDate() - 7);
        break;
      default:
        newDate = new Date(current);
        newDate.setDate(current.getDate() - 1);
    }
    
    this.updateView(newDate);
  }

  navigateNext(): void {
    const current = this.currentView.currentDate;
    let newDate: Date;
    
    switch (this.currentView.type) {
      case 'month':
        newDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      case 'week':
        newDate = new Date(current);
        newDate.setDate(current.getDate() + 7);
        break;
      default:
        newDate = new Date(current);
        newDate.setDate(current.getDate() + 1);
    }
    
    this.updateView(newDate);
  }

  navigateToday(): void {
    this.updateView(new Date());
  }

  private updateView(date: Date): void {
    let startDate: Date;
    let endDate: Date;
    
    switch (this.currentView.type) {
      case 'month':
        startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        break;
      case 'week':
        const weekStart = this.getWeekStart(date);
        startDate = new Date(weekStart);
        endDate = new Date(weekStart);
        endDate.setDate(endDate.getDate() + 6);
        break;
      default:
        startDate = new Date(date);
        endDate = new Date(date);
    }
    
    this.currentView = {
      ...this.currentView,
      startDate,
      endDate,
      currentDate: date
    };
    
    this.viewChange.emit(this.currentView);
    this.generateCalendar();
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  // Changement de vue
  changeViewType(type: 'month' | 'week' | 'day' | 'list'): void {
    // Ignorer la vue semaine
    if (type === 'week') {
      return;
    }
    this.currentView.type = type;
    this.updateView(this.currentView.currentDate);
  }

  // Gestion des événements
  onEventClicked(event: ExtendedCalendarEvent, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedEvent = event;
    this.showEventModal = true;
    this.eventClick.emit(event);
  }

  onDayClicked(date: Date): void {
    this.dateClick.emit(date);
  }

  closeEventModal(): void {
    this.showEventModal = false;
    this.selectedEvent = null;
  }

  showDayEvents(date: Date, event: MouseEvent): void {
    event.stopPropagation();
    // Afficher tous les événements du jour dans une modal ou une vue détaillée
    const dayEvents = this.getEventsForDay(date);
    console.log('Events for', date, ':', dayEvents);
  }

  // Méthodes pour la vue semaine
  getCurrentWeekDays(): Date[] {
    const days: Date[] = [];
    const start = this.getWeekStart(this.currentView.currentDate);
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    
    return days;
  }

  getEventTopPosition(event: ExtendedCalendarEvent): number {
    if (!event.streamingTime) return 0;
    const [hours, minutes] = event.streamingTime.split(':').map(Number);
    const startHour = 8; // Commence à 8h
    return ((hours - startHour) * 60 + minutes) * (60 / 60); // 60px par heure
  }

  getEventHeight(event: ExtendedCalendarEvent): number {
    // Par défaut 1 heure (60px)
    return 60;
  }

  // Grouper les événements par date pour la vue liste
  groupEventsByDate(events: ExtendedCalendarEvent[]): EventGroup[] {
    const groups: Map<string, EventGroup> = new Map();
    
    events.forEach(event => {
      const date = new Date(event.streamingDate);
      const dateKey = date.toDateString();
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: date,
          events: []
        });
      }
      
      groups.get(dateKey)!.events.push(event);
    });
    
    // Trier par date
    return Array.from(groups.values()).sort((a, b) => 
      a.date.getTime() - b.date.getTime()
    );
  }

  // Utilitaires
  getEventsForDay(date: Date): ExtendedCalendarEvent[] {
    return this.filteredEvents.filter(event => {
      const eventDate = new Date(event.streamingDate);
      return eventDate.getDate() === date.getDate() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getFullYear() === date.getFullYear();
    });
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  // Méthode pour vérifier si c'est une skill sans échange
  isSkillWithoutExchange(event: ExtendedCalendarEvent): boolean {
    return event.hasNoExchange === true || event.isSkillOnly === true || 
           (event.receiverName === 'Aucun inscrit' && event.receiverId === 0);
  }

  getEventStatusClass(status: string): string {
    switch (status) {
      case 'PENDING': return 'event-pending';
      case 'ACCEPTED': return 'event-accepted';
      case 'SCHEDULED': return 'event-scheduled';
      case 'IN_PROGRESS': return 'event-live';
      case 'COMPLETED': return 'event-completed';
      case 'REJECTED': return 'event-rejected';
      case 'CANCELLED': return 'event-cancelled';
      default: return '';
    }
  }

  getEventTitle(event: ExtendedCalendarEvent): string {
    // Vérifier si c'est une skill sans échange
    if (this.isSkillWithoutExchange(event)) {
      return `${event.skillName} - Aucune inscription`;
    }
    
    if (this.userRole === 'PRODUCER') {
      return `${event.skillName} - ${event.receiverName}`;
    } else {
      return `${event.skillName} - ${event.producerName}`;
    }
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    return `${hours}h${minutes}`;
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'PENDING': 'En attente',
      'ACCEPTED': 'Accepté',
      'SCHEDULED': 'Planifié',
      'IN_PROGRESS': 'En direct',
      'COMPLETED': 'Terminé',
      'REJECTED': 'Refusé',
      'CANCELLED': 'Annulé'
    };
    return labels[status] || status;
  }

  get currentMonthYear(): string {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return `${months[this.currentView.currentDate.getMonth()]} ${this.currentView.currentDate.getFullYear()}`;
  }
}