// hero-producer.component.ts - SIMPLIFIÉ SANS ID UTILISATEUR
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService } from '../../../core/services/calendar/calendar.service';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { RatingService } from '../../../core/services/Rating/rating.service';
import { Subject, takeUntil, forkJoin, map, catchError, of, tap } from 'rxjs';

@Component({
  selector: 'app-hero-producer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero-producer.component.html',
  styleUrls: ['./hero-producer.component.css']
})
export class HeroProducerComponent implements OnInit, OnDestroy {
  @Input() userProfile: any;
  @Input() sessions: any[] = []; // Garder l'input sessions

  // Statistiques affichées
  upcomingSessions: number = 0; // Calculé dynamiquement depuis le calendrier
  skillsCount: number = 0; // Calculé dynamiquement depuis les compétences
  averageRating: number = 0; // Calculé dynamiquement depuis les ratings

  // État de chargement
  isLoading: boolean = true;
  error: string | null = null;
  hasDataLoaded: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private calendarService: CalendarService,
    private skillService: SkillService,
    private ratingService: RatingService
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

    // Charger en parallèle les trois statistiques
    forkJoin({
      upcomingSessions: this.loadUpcomingSessions(),
      skillsCount: this.loadSkillsCount(),
      averageRating: this.loadAverageRating()
    }).pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (results) => {
        this.upcomingSessions = results.upcomingSessions;
        this.skillsCount = results.skillsCount;
        this.averageRating = results.averageRating;
        this.isLoading = false;
        this.hasDataLoaded = true;
        console.log('All stats loaded:', results);
      },
      error: (error) => {
        console.error('Error loading stats:', error);
        this.error = 'Impossible de charger les statistiques';
        this.isLoading = false;
        this.hasDataLoaded = true;
        // Valeurs par défaut en cas d'erreur
        this.upcomingSessions = 0;
        this.skillsCount = 0;
        this.averageRating = 0;
      }
    });
  }

  private loadUpcomingSessions() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

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
    return this.skillService.getMySkills().pipe(
      takeUntil(this.destroy$),
      map((skills) => (skills || []).length),
      catchError(() => of(0))
    );
  }

 private loadAverageRating() {
  console.log('🔍 Starting to load average rating...');
  
  return this.ratingService.getMyRatingStats().pipe(
    takeUntil(this.destroy$),
    tap((ratingStats) => {
      console.log('✅ Full rating stats received:', ratingStats);
      console.log('📊 Average rating:', ratingStats?.averageRating);
      console.log('📊 Total ratings:', ratingStats?.totalRatings);
      console.log('📊 Total exchanges:', ratingStats?.totalExchanges);
    }),
    map((ratingStats) => {
      const rating = ratingStats?.averageRating || 0;
      console.log('🎯 Final rating to display:', rating);
      return rating;
    }),
    catchError((error) => {
      console.error('❌ Error loading rating stats:', error);
      console.error('Error response:', error.error);
      return of(0);
    })
  );
}

  // Méthode pour l'affichage des étoiles avec données dynamiques
  getStarDisplay(): string {
    if (this.isLoading) return '...';
    if (this.averageRating === 0) return 'N/A';
    return this.averageRating.toFixed(1);
  }

  // Refresh des données
  refreshStats() {
    this.loadDynamicStats();
  }

  
}