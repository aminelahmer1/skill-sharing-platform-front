import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CalendarBaseComponent } from '../../shared/calendar-base/calendar-base.component';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { CalendarEvent, CalendarView } from '../../../models/calendar/calendar-event';
import { Subject, takeUntil, finalize } from 'rxjs';

@Component({
  selector: 'app-producer-calendar',
  standalone: true,
  imports: [CommonModule, CalendarBaseComponent, RouterModule],
  templateUrl: './producer-calendar.component.html',
  styleUrls: ['./producer-calendar.component.css']
})
export class ProducerCalendarComponent implements OnInit, OnDestroy {
  events: CalendarEvent[] = [];
  loading = false;
  error: string | null = null;
  
  stats = {
    totalSessions: 0,
    upcomingSessions: 0,
    completedSessions: 0,
    liveSessions: 0,
    pendingRequests: 0
  };

  upcomingEvents: CalendarEvent[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private calendarService: CalendarService,
    private router: Router
  ) {}

  ngOnInit(): void {
    console.log('Producer Calendar - Initialization started');
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    console.log('Producer Calendar - Destroying component');
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    // Charger les données de manière séquentielle pour éviter les conflits
    this.loading = true;
    this.error = null;
    
    // D'abord charger les événements principaux
    this.loadEvents();
  }

  private loadEvents(): void {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    console.log('Loading events from', startDate, 'to', endDate);

    this.calendarService.getProducerEvents(startDate, endDate)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          console.log('Events loading completed');
        })
      )
      .subscribe({
        next: (events) => {
          console.log('Events loaded:', events.length);
          this.events = events || [];
          this.calculateStats();
          // Charger les événements à venir après les événements principaux
          this.loadUpcomingEvents();
        },
        error: (error) => {
          console.error('Error loading events:', error);
          this.error = 'Impossible de charger les événements. Veuillez réessayer.';
          this.events = [];
          this.loading = false;
        }
      });
  }

  private loadUpcomingEvents(): void {
    this.calendarService.getUpcomingEvents(7)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (events) => {
          console.log('Upcoming events loaded:', events.length);
          this.upcomingEvents = (events || [])
            .filter(e => 
              e.status === 'ACCEPTED' || 
              e.status === 'SCHEDULED'
            )
            .slice(0, 5);
        },
        error: (error) => {
          console.error('Error loading upcoming events:', error);
          this.upcomingEvents = [];
        }
      });
  }

  private calculateStats(): void {
    const now = new Date();
    
    // Calcul sécurisé des statistiques
    this.stats = {
      totalSessions: this.events?.length || 0,
      upcomingSessions: (this.events || []).filter(e => {
        try {
          return new Date(e.streamingDate) > now && 
                 (e.status === 'ACCEPTED' || e.status === 'SCHEDULED');
        } catch {
          return false;
        }
      }).length,
      completedSessions: (this.events || []).filter(e => e.status === 'COMPLETED').length,
      liveSessions: (this.events || []).filter(e => e.status === 'IN_PROGRESS').length,
      pendingRequests: (this.events || []).filter(e => e.status === 'PENDING').length
    };

    console.log('Stats calculated:', this.stats);
  }

  onEventClick(event: CalendarEvent): void {
    if (!event) return;
    
    console.log('Event clicked:', event);
    
    if (event.status === 'IN_PROGRESS') {
      this.router.navigate(['/producer/livestream', event.id]);
    } else if (event.status === 'PENDING') {
      this.router.navigate(['/producer/requests']);
    } else {
      console.log('Event details:', event);
    }
  }

  onDateClick(date: Date): void {
    console.log('Date clicked:', date);
  }

  onViewChange(view: CalendarView): void {
    console.log('View changed:', view);
    this.calendarService.updateView(view);
  }

  startLiveSession(event: CalendarEvent): void {
    if (!event) return;
    
    if (event.status === 'SCHEDULED' || event.status === 'ACCEPTED') {
      console.log('Starting live session for skill:', event.skillId);
      this.router.navigate(['/producer/livestream', event.skillId], {
        queryParams: { immediate: true }
      });
    }
  }

  viewExchangeDetails(event: CalendarEvent): void {
    if (!event) return;
    
    this.router.navigate(['/producer/requests'], {
      queryParams: { exchangeId: event.id }
    });
  }

  refreshCalendar(): void {
    console.log('Refreshing calendar...');
    this.loadInitialData();
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'PENDING': '#fdcb6e',
      'ACCEPTED': '#fd79a8',
      'SCHEDULED': '#a29bfe',
      'IN_PROGRESS': '#ff6b6b',
      'COMPLETED': '#00b894',
      'REJECTED': '#636e72',
      'CANCELLED': '#dfe6e9'
    };
    return colors[status] || '#dfe6e9';
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
}