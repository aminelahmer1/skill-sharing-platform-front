// hero-receiver.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { Subject, takeUntil, forkJoin, map, catchError, of } from 'rxjs';

@Component({
  selector: 'app-hero-receiver',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero-receiver.component.html',
  styleUrls: ['./hero-receiver.component.css']
})
export class HeroReceiverComponent implements OnInit, OnDestroy {
  @Input() userProfile: any;
  @Input() sessions: any[] = [];

  // Statistiques affichées spécifiques au receveur
  upcomingSessions: number = 0; // Sessions réservées/programmées
  skillsCount: number = 0; // Compétences que je possède/recherche

  // État de chargement
  isLoading: boolean = true;
  error: string | null = null;
  hasDataLoaded: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private calendarService: CalendarService,
    private skillService: SkillService
  ) {}

  ngOnInit() {
    this.loadDynamicStats();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDynamicStats(): void {
    this.isLoading = true;
    this.error = null;

    // Charger en parallèle les statistiques pour le receveur
    forkJoin({
      upcomingSessions: this.loadUpcomingSessions(),
      skillsCount: this.loadSkillsCount()
    }).pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (results) => {
        this.upcomingSessions = results.upcomingSessions;
        this.skillsCount = results.skillsCount;
        this.isLoading = false;
        this.hasDataLoaded = true;
        console.log('All receiver stats loaded:', results);
      },
      error: (error) => {
        console.error('Error loading receiver stats:', error);
        this.error = 'Impossible de charger les statistiques';
        this.isLoading = false;
        this.hasDataLoaded = true;
        // Valeurs par défaut en cas d'erreur
        this.upcomingSessions = 0;
        this.skillsCount = 0;
      }
    });
  }

  private loadUpcomingSessions() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

    // Utiliser la même méthode que le producteur mais filtrer pour le receveur
    return this.calendarService.getProducerEvents(now, endDate).pipe(
      takeUntil(this.destroy$),
      map((events) => {
        return (events || []).filter(event => {
          const eventDate = new Date(event.streamingDate);
          return eventDate > now && 
                 (event.status === 'ACCEPTED' || event.status === 'SCHEDULED');
        }).length;
      }),
      catchError(() => of(0))
    );
  }

  private loadSkillsCount() {
    // Utiliser la même méthode que le producteur
    return this.skillService.getMySkills().pipe(
      takeUntil(this.destroy$),
      map((skills) => {
        if (Array.isArray(skills)) {
          return skills.length;
        }
        return 0;
      }),
      catchError(() => of(0))
    );
  }

  // Refresh des données
  refreshStats() {
    this.loadDynamicStats();
  }
}