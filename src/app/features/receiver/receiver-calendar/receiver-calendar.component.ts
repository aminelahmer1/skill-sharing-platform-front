import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CalendarBaseComponent } from '../../shared/calendar-base/calendar-base.component';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { CalendarEvent, CalendarView } from '../../../models/calendar/calendar-event';
import { Subject, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';

@Component({
  selector: 'app-receiver-calendar',
  standalone: true,
  imports: [CommonModule, CalendarBaseComponent, RouterModule],
  templateUrl: './receiver-calendar.component.html',
  styleUrls: ['./receiver-calendar.component.css']
})
export class ReceiverCalendarComponent implements OnInit, OnDestroy {
  events: CalendarEvent[] = [];
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

  upcomingEvents: CalendarEvent[] = [];
  todayEvents: CalendarEvent[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private calendarService: CalendarService,
    private router: Router,
    private snackBar: MatSnackBar

  ) {}

  ngOnInit(): void {
    console.log('Receiver Calendar - Initialization started');
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    console.log('Receiver Calendar - Destroying component');
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadInitialData(): void {
    this.loading = true;
    this.error = null;
    
    // Charger les événements principaux d'abord
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
          this.events = events || [];
          this.calculateStats();
          this.loadTodayEvents();
          // Charger les événements à venir après
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
              e.status === 'SCHEDULED' || 
              e.status === 'IN_PROGRESS'
            )
            .slice(0, 5);
        },
        error: (error) => {
          console.error('Error loading upcoming events:', error);
          this.upcomingEvents = [];
        }
      });
  }

  private loadTodayEvents(): void {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      this.todayEvents = (this.events || []).filter(event => {
        if (!event || !event.streamingDate) return false;
        
        try {
          const eventDate = new Date(event.streamingDate);
          return eventDate >= today && eventDate < tomorrow;
        } catch {
          return false;
        }
      });

      console.log('Today events:', this.todayEvents.length);
    } catch (error) {
      console.error('Error loading today events:', error);
      this.todayEvents = [];
    }
  }

  private calculateStats(): void {
    const now = new Date();
    
    // Calcul sécurisé des statistiques
    this.stats = {
      totalEnrolled: this.events?.length || 0,
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
      pendingRequests: (this.events || []).filter(e => e.status === 'PENDING').length,
      acceptedSessions: (this.events || []).filter(e => e.status === 'ACCEPTED').length
    };

    console.log('Stats calculated:', this.stats);
  }

  onEventClick(event: CalendarEvent): void {
    if (!event) return;
    
    console.log('Event clicked:', event);
    
    // Chercher une session active pour cette compétence
    this.calendarService.getSessionBySkillId(event.skillId).subscribe({
      next: (session) => {
        if (session && session.status === 'LIVE') {
          // Session en cours - rejoindre
          console.log('Active session found, joining:', session.id);
          this.joinLiveSession(session);
        } else if (event.status === 'COMPLETED') {
          // Session terminée - voir les détails
          this.viewCompletedSession(event);
        } else {
          // Pas de session active
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

    // Vérifier si c'est une LivestreamSession ou un CalendarEvent
    if ('roomName' in eventOrSession) {
      // C'est une LivestreamSession
      const session = eventOrSession as LivestreamSession;
      console.log('Joining live session:', session.id);
      this.router.navigate(['/receiver/livestream', session.id]);
    } else {
      // C'est un CalendarEvent - chercher la session correspondante
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

  // ✅ AJOUT: Méthode showNotification
  private showNotification(message: string): void {
    this.snackBar.open(message, 'Fermer', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }


  viewSessionDetails(event: CalendarEvent): void {
    console.log('Viewing session details:', event);
    // Implémenter l'affichage des détails (modal ou nouvelle page)
  }

  viewCompletedSession(event: CalendarEvent): void {
     console.log('Viewing session details:', event);
  }

  refreshCalendar(): void {
    console.log('Refreshing calendar...');
    this.loadInitialData();
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

  getTimeRemaining(date: string): string {
    if (!date) return '';
    
    try {
      const eventDate = new Date(date);
      const now = new Date();
      const diff = eventDate.getTime() - now.getTime();
      
      if (diff <= 0) return 'Maintenant';
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (days > 0) return `Dans ${days} jour${days > 1 ? 's' : ''}`;
      if (hours > 0) return `Dans ${hours} heure${hours > 1 ? 's' : ''}`;
      
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `Dans ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } catch (error) {
      console.error('Error calculating time remaining:', error);
      return '';
    }
  }
}