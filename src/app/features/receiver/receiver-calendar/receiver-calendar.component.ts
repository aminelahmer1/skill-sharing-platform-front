import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CalendarBaseComponent } from '../../shared/calendar-base/calendar-base.component';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { CalendarEvent, CalendarView } from '../../../models/calendar/calendar-event';
import { Subject, takeUntil, finalize, interval, Subscription } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';

// Interface étendue pour les événements avec métadonnées supplémentaires
interface ProcessedCalendarEvent extends CalendarEvent {
  earlyCompleted?: boolean;
  originalTime?: string;
  completedAt?: Date;
}

@Component({
  selector: 'app-receiver-calendar',
  standalone: true,
  imports: [CommonModule, CalendarBaseComponent, RouterModule],
  templateUrl: './receiver-calendar.component.html',
  styleUrls: ['./receiver-calendar.component.css']
})
export class ReceiverCalendarComponent implements OnInit, OnDestroy {
  events: CalendarEvent[] = [];
  processedEvents: ProcessedCalendarEvent[] = [];
  todayEvents: ProcessedCalendarEvent[] = [];
  upcomingEvents: ProcessedCalendarEvent[] = [];
  
  loading = false;
  error: string | null = null;
  
  stats = {
    totalEnrolled: 0,
    upcomingSessions: 0,
    completedSessions: 0,
    liveSessions: 0,
    pendingRequests: 0,
    acceptedSessions: 0
  };

  private destroy$ = new Subject<void>();
  private autoRefreshSubscription?: Subscription;

  constructor(
    private calendarService: CalendarService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    console.log('Receiver Calendar - Initialization started');
    this.loadInitialData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    console.log('Receiver Calendar - Destroying component');
    if (this.autoRefreshSubscription) {
      this.autoRefreshSubscription.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    this.loading = true;
    this.error = null;
    this.loadEvents();
  }

 private loadEvents(): void {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  console.log('Loading receiver events from', startDate, 'to', endDate);

  this.calendarService.getReceiverEvents(startDate, endDate)
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
        
        // FILTRER LES ÉVÉNEMENTS REFUSÉS ET ANNULÉS
        this.events = (events || []).filter(event => 
          event.status !== 'REJECTED' && event.status !== 'CANCELLED'
        );
        
        console.log('Events after filtering rejected/cancelled:', this.events.length);
        
        this.processedEvents = this.processEventsForDisplay(this.events);
        this.calculateStats();
        this.loadTodayEvents();
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

  private processEventsForDisplay(events: CalendarEvent[]): ProcessedCalendarEvent[] {
    const now = new Date();
    
    return events.map(event => {
      const processedEvent: ProcessedCalendarEvent = { ...event };
      
      // Détecter les sessions terminées précocement
      if (event.status === 'COMPLETED' && event.streamingDate) {
        const eventDate = new Date(event.streamingDate);
        if (eventDate > now) {
          processedEvent.earlyCompleted = true;
          processedEvent.originalTime = event.streamingTime;
          processedEvent.completedAt = new Date(event.updatedAt || now);
        }
      }
      
      return processedEvent;
    });
  }

  private loadTodayEvents(): void {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      this.todayEvents = this.processedEvents.filter(event => {
        if (!event || !event.streamingDate) return false;
        
        try {
          const eventDate = new Date(event.streamingDate);
          // Inclure TOUS les événements du jour, même COMPLETED
          return eventDate >= today && eventDate < tomorrow;
        } catch {
          return false;
        }
      });

      // Trier par statut prioritaire
      this.todayEvents.sort((a, b) => {
        const statusPriority: { [key: string]: number } = {
          'IN_PROGRESS': 1,
          'SCHEDULED': 2,
          'ACCEPTED': 3,
          'COMPLETED': 4,
          'PENDING': 5
        };
        return (statusPriority[a.status] || 6) - (statusPriority[b.status] || 6);
      });

      console.log('Today events:', this.todayEvents.length);
    } catch (error) {
      console.error('Error loading today events:', error);
      this.todayEvents = [];
    }
  }

 private loadUpcomingEvents(): void {
  this.calendarService.getUpcomingEvents(7)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (events) => {
        console.log('Upcoming events loaded:', events.length);
        
        // Filtrer les refusés/annulés ET ne garder que les acceptés/planifiés/en cours
        this.upcomingEvents = this.processEventsForDisplay(
          (events || []).filter(e => 
            e.status !== 'REJECTED' && 
            e.status !== 'CANCELLED' &&
            (e.status === 'ACCEPTED' || 
             e.status === 'SCHEDULED' || 
             e.status === 'IN_PROGRESS')
          )
        ).slice(0, 5);
      },
      error: (error) => {
        console.error('Error loading upcoming events:', error);
        this.upcomingEvents = [];
      }
    });
}

  private calculateStats(): void {
  const now = new Date();
  
  // Utiliser this.events qui a déjà filtré les REJECTED/CANCELLED
  this.stats = {
    totalEnrolled: this.events?.length || 0,
    upcomingSessions: this.events.filter(e => {
      try {
        return new Date(e.streamingDate) > now && 
               (e.status === 'ACCEPTED' || e.status === 'SCHEDULED');
      } catch {
        return false;
      }
    }).length,
    completedSessions: this.events.filter(e => e.status === 'COMPLETED').length,
    liveSessions: this.events.filter(e => e.status === 'IN_PROGRESS').length,
    pendingRequests: this.events.filter(e => e.status === 'PENDING').length,
    acceptedSessions: this.events.filter(e => e.status === 'ACCEPTED').length
  };

  console.log('Stats calculated:', this.stats);
}

  private startAutoRefresh(): void {
    // Rafraîchir toutes les 30 secondes
    this.autoRefreshSubscription = interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Auto-refreshing calendar events');
        this.loadEvents();
      });
  }

  // Méthodes utilitaires
  isEarlyCompleted(event: ProcessedCalendarEvent): boolean {
    return event.earlyCompleted === true;
  }

  getEventStatusLabel(event: ProcessedCalendarEvent): string {
    if (event.earlyCompleted) {
      return 'Terminé plus tôt';
    }
    
    const labels: { [key: string]: string } = {
      'PENDING': 'En attente',
      'ACCEPTED': 'Accepté',
      'SCHEDULED': 'Planifié',
      'IN_PROGRESS': 'En direct',
      'COMPLETED': 'Terminé',
      'REJECTED': 'Refusé',
      'CANCELLED': 'Annulé'
    };
    return labels[event.status] || event.status;
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

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'PENDING': '#fdcb6e',
      'ACCEPTED': '#74b9ff',
      'SCHEDULED': '#a29bfe',
      'IN_PROGRESS': '#0984e3',
      'COMPLETED': '#00b894',
      'REJECTED': '#636e72',
      'CANCELLED': '#dfe6e9'
    };
    return colors[status] || '#dfe6e9';
  }

  getTimeRemaining(date: string): string {
    if (!date) return '';
    
    try {
      const eventDate = new Date(date);
      const now = new Date();
      const diff = eventDate.getTime() - now.getTime();
      
      if (diff <= 0) return 'Maintenant';
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) return `Dans ${days} jour${days > 1 ? 's' : ''}`;
      if (hours > 0) return `Dans ${hours} heure${hours > 1 ? 's' : ''}`;
      return `Dans ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } catch (error) {
      console.error('Error calculating time remaining:', error);
      return '';
    }
  }

  // Event handlers
  onEventClick(event: CalendarEvent): void {
    if (!event) return;
    
    console.log('Event clicked:', event);
    
    if (event.status === 'COMPLETED') {
      this.viewCompletedSession(event);
      return;
    }
    
    this.calendarService.getSessionBySkillId(event.skillId).subscribe({
      next: (session) => {
        if (session && session.status === 'LIVE') {
          console.log('Active session found, joining:', session.id);
          this.joinLiveSession(session);
        } else {
          this.showNotification('Aucune session active pour cette compétence');
          console.log('No active session for skill:', event.skillId);
        }
      },
      error: (error) => {
        console.error('Error checking session status:', error);
        this.showNotification('Erreur lors de la vérification de la session');
      }
    });
  }

  onDateClick(date: Date): void {
    console.log('Date clicked:', date);
  }

  onViewChange(view: CalendarView): void {
    console.log('View changed:', view);
    this.calendarService.updateView(view);
  }

  joinLiveSession(eventOrSession: CalendarEvent | LivestreamSession): void {
    if (!eventOrSession) return;

    if ('roomName' in eventOrSession) {
      const session = eventOrSession as LivestreamSession;
      console.log('Joining live session:', session.id);
      this.router.navigate(['/receiver/livestream', session.id]);
    } else {
      const event = eventOrSession as CalendarEvent;
      console.log('Looking for session for skill:', event.skillId);
      
      this.calendarService.getSessionBySkillId(event.skillId).subscribe({
        next: (session) => {
          if (session && session.status === 'LIVE') {
            this.joinLiveSession(session);
          } else {
            this.showNotification('Aucune session active');
          }
        },
        error: (error) => {
          console.error('Error finding session:', error);
          this.showNotification('Erreur lors de la recherche de session');
        }
      });
    }
  }

  viewSessionDetails(event: CalendarEvent): void {
    console.log('Viewing session details:', event);
  }

  viewCompletedSession(event: CalendarEvent): void {
    console.log('Viewing completed session:', event);
    this.showNotification('Cette session est terminée');
  }

  refreshCalendar(): void {
    console.log('Refreshing calendar...');
    this.loadInitialData();
  }

  private showNotification(message: string): void {
    this.snackBar.open(message, 'Fermer', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

}