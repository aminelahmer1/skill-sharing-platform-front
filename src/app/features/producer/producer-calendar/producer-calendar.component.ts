// producer-calendar.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { CalendarBaseComponent } from '../../shared/calendar-base/calendar-base.component';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { CalendarEvent, CalendarView } from '../../../models/calendar/calendar-event';
import { Subject, takeUntil, finalize } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ProducerLivestreamConfirmationDialogComponent } from './producer-livestream-confirmation-dialog/producer-livestream-confirmation-dialog.component';

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
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
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
    this.loading = true;
    this.error = null;
    this.loadEvents();
  }

  // Dans producer-calendar.component.ts - Remplacer loadEvents()

private loadEvents(): void {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    console.log('Loading grouped events from', startDate, 'to', endDate);

    // Utiliser le nouvel endpoint si disponible, sinon l'ancien
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
          console.log('Grouped events loaded:', events.length);
          this.events = events || [];
          this.calculateStats();
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

  /**
   * Gestion du clic sur un événement
   * - Si session LIVE existante : rejoindre directement (SANS popup)
   * - Si pas de session : créer avec popup de confirmation
   */
  onEventClick(event: CalendarEvent): void {
    if (!event) return;
    
    console.log('Event clicked:', event);
    
    // Vérifier d'abord s'il y a une session active pour cette compétence
    this.calendarService.getSessionBySkillId(event.skillId).subscribe({
      next: (session) => {
        if (session && session.status === 'LIVE') {
          // Session en cours - rejoindre directement SANS confirmation
          console.log('Active session found, joining immediately:', session.id);
          this.joinExistingSession(session.id);
        } else if (event.status === 'ACCEPTED' || event.status === 'SCHEDULED') {
          // Pas de session active mais événement accepté - créer AVEC confirmation
          this.showCreateSessionConfirmation(event);
        } else if (event.status === 'PENDING') {
          // Événement en attente - aller aux demandes
          this.router.navigate(['/producer/requests']);
        } else {
          console.log('Event details:', event);
        }
      },
      error: (error) => {
        console.error('Error checking session status:', error);
        // En cas d'erreur, essayer de créer si l'événement le permet
        if (event.status === 'ACCEPTED' || event.status === 'SCHEDULED') {
          this.showCreateSessionConfirmation(event);
        }
      }
    });
  }

  /**
   * Rejoindre une session existante (SANS popup de confirmation)
   */
  private joinExistingSession(sessionId: number): void {
    console.log('Joining existing session:', sessionId);
    this.showNotification('Connexion à votre livestream en cours...');
    
    setTimeout(() => {
      this.router.navigate(['/producer/livestream', sessionId]);
    }, 500);
  }

  /**
   * Afficher le popup de confirmation pour créer une nouvelle session
   */
  // Dans producer-calendar.component.ts - méthode showCreateSessionConfirmation
private showCreateSessionConfirmation(event: CalendarEvent): void {
  const dialogRef = this.dialog.open(ProducerLivestreamConfirmationDialogComponent, {
    width: '420px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    disableClose: false,
    hasBackdrop: true,
    backdropClass: 'custom-backdrop',
    panelClass: 'custom-dialog-panel',
    data: {
      skillName: event.skillName,
      skillId: event.skillId
    }
  });

  dialogRef.afterClosed().subscribe(confirmed => {
    if (confirmed) {
      this.createAndStartSession(event);
    }
  });
}

  /**
   * Créer et démarrer une nouvelle session
   */
  private createAndStartSession(event: CalendarEvent): void {
    console.log('Creating and starting new session for skill:', event.skillId);
    this.loading = true;
    
    this.calendarService.createSession(event.skillId, true).subscribe({
      next: (session) => {
        console.log('Session created successfully:', session.id);
        this.loading = false;
        this.showNotification('Session créée avec succès ! Redirection...');
        
        // Naviguer vers la session après un court délai
        setTimeout(() => {
          this.router.navigate(['/producer/livestream', session.id]);
        }, 1000);
      },
      error: (error) => {
        console.error('Error creating session:', error);
        this.loading = false;
        this.showNotification('Erreur lors de la création de la session');
      }
    });
  }

  /**
   * Méthode publique pour démarrer une session depuis le template (boutons)
   */
  startLiveSession(event: CalendarEvent): void {
    if (!event) return;
    this.showCreateSessionConfirmation(event);
  }

  private showNotification(message: string): void {
    this.snackBar.open(message, 'Fermer', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  onDateClick(date: Date): void {
    console.log('Date clicked:', date);
  }

  onViewChange(view: CalendarView): void {
    console.log('View changed:', view);
    this.calendarService.updateView(view);
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