import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, map, tap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';

// ========================================
// INTERFACES EXISTANTES (pas modifiées)
// ========================================
export interface RatingRequest {
  rating: number;
  comment?: string;
}

export interface RatingResponse {
  exchangeId: number;
  rating: number;
  comment?: string;
  ratingDate: string;
  receiverName: string;
  receiverId: number;
}

export interface ProducerRatingStats {
  producerId: number;
  producerName: string;
  averageRating: number;
  totalRatings: number;
  totalExchanges: number;
  ratingDistribution: RatingDistribution[];
  recentRatings: RecentRating[];
}

export interface RatingDistribution {
  stars: number;
  count: number;
  percentage: number;
}

export interface RecentRating {
  exchangeId: number;
  skillName: string;
  receiverName: string;
  rating: number;
  comment?: string;
  ratingDate: string;
}

export interface SkillRatingStats {
  skillId: number;
  skillName: string;
  averageRating: number;
  totalRatings: number;
  ratings: RatingResponse[];
}

// ========================================
// NOUVELLES INTERFACES POUR DASHBOARD AVANCÉ
// ========================================
export interface ProducerDashboardStats {
  // Métriques principales
  upcomingSessions: number;
  totalSkills: number;
  averageRating: number;
  totalStudents: number;
  
  // Performance
  completionRate: number;
  rebookingRate: number;
  satisfactionRate: number;
  averageResponseTimeHours: number;
  
  // Croissance
  sessionsThisMonth: number;
  sessionsLastMonth: number;
  monthlyGrowthRate: number;
  newStudentsThisMonth: number;
  totalTeachingHours: number;
  
  // Comparaison
  platformRanking: number;
  platformAverageRating: number;
  
  // Données pour graphiques
  monthlyActivity: MonthlyActivityData[];
  skillPerformance: SkillPerformanceData[];
  ratingEvolution: RatingEvolutionData[];
}

export interface MonthlyActivityData {
  year: number;
  month: number;
  monthLabel: string;
  completedSessions: number;
  upcomingSessions: number;
}

export interface SkillPerformanceData {
  skillId: number;
  skillName: string;
  averageRating: number;
  totalSessions: number;
  pendingRequests: number;
  isTopPerforming: boolean;
}

export interface RatingEvolutionData {
  year: number;
  month: number;
  monthLabel: string;
  averageRating: number;
}

export interface ProducerEngagementStats {
  completionRate: number;
  averageSessionDurationHours: number;
  rebookingRate: number;
  uniqueStudents: number;
  totalInteractions: number;
  studentRetentionRate: number;
}

export interface ProducerGrowthStats {
  sessionsThisMonth: number;
  sessionsLastMonth: number;
  monthlyGrowthRate: number;
  newStudentsThisMonth: number;
  totalTeachingHours: number;
  yearOverYearGrowth: number;
}

export interface ProducerQualityStats {
  averageResponseTimeHours: number;
  satisfactionRate: number;
  totalRatings: number;
  averageRating: number;
  ratingDistribution: RatingDistribution[];
  qualityTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

@Injectable({ providedIn: 'root' })
export class RatingService {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/exchanges/ratings';
  
  // Cache existant (pas modifié)
  private producerStatsCache$ = new BehaviorSubject<ProducerRatingStats | null>(null);
  
  // Nouveaux caches pour les statistiques avancées
  private dashboardStatsCache$ = new BehaviorSubject<ProducerDashboardStats | null>(null);
  private cacheExpiry: number = 0;
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  // ========================================
  // MÉTHODES EXISTANTES (code original gardé tel quel)
  // ========================================
  
  /**
   * Soumettre un rating pour un échange
   */
  submitRating(exchangeId: number, request: RatingRequest): Observable<RatingResponse> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.post<RatingResponse>(
          `${this.apiUrl}/${exchangeId}`,
          request,
          { headers }
        );
      }),
      tap(() => {
        // Invalider le cache après soumission
        this.producerStatsCache$.next(null);
        // AJOUT: invalider aussi les nouveaux caches
        this.invalidateAdvancedCaches();
      }),
      catchError(error => {
        console.error('Erreur lors de la soumission du rating:', error);
        return throwError(() => new Error('Échec de la soumission de l\'évaluation'));
      })
    );
  }
  
  /**
   * Mettre à jour un rating existant
   */
  updateRating(exchangeId: number, request: RatingRequest): Observable<RatingResponse> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<RatingResponse>(
          `${this.apiUrl}/${exchangeId}`,
          request,
          { headers }
        );
      }),
      tap(() => {
        // Invalider le cache après mise à jour
        this.producerStatsCache$.next(null);
        // AJOUT: invalider aussi les nouveaux caches
        this.invalidateAdvancedCaches();
      }),
      catchError(error => {
        console.error('Erreur lors de la mise à jour du rating:', error);
        return throwError(() => new Error('Échec de la mise à jour de l\'évaluation'));
      })
    );
  }
  
  /**
   * Récupérer le rating d'un échange spécifique
   */
  getRatingForExchange(exchangeId: number): Observable<RatingResponse | null> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<RatingResponse>(
          `${this.apiUrl}/${exchangeId}`,
          { headers }
        );
      }),
      catchError(error => {
        if (error.status === 204) {
          return [null]; // Pas encore de rating
        }
        console.error('Erreur lors de la récupération du rating:', error);
        return throwError(() => new Error('Échec de la récupération de l\'évaluation'));
      })
    );
  }
  
  /**
   * Récupérer les statistiques de rating d'un producteur
   */
  getProducerRatingStats(producerId: number, useCache: boolean = true): Observable<ProducerRatingStats> {
    // Retourner le cache si disponible et demandé
    if (useCache && this.producerStatsCache$.value && this.producerStatsCache$.value.producerId === producerId) {
      return this.producerStatsCache$.asObservable().pipe(
        map(stats => stats!)
      );
    }
    
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerRatingStats>(
          `${this.apiUrl}/producer/${producerId}/stats`,
          { headers }
        );
      }),
      tap(stats => {
        // Mettre en cache les statistiques
        this.producerStatsCache$.next(stats);
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques'));
      })
    );
  }
  
  /**
   * Récupérer ses propres statistiques (pour producteur connecté)
   */
  getMyRatingStats(): Observable<ProducerRatingStats> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerRatingStats>(
          `${this.apiUrl}/my-stats`,
          { headers }
        );
      }),
      tap(stats => {
        // Mettre en cache les statistiques
        this.producerStatsCache$.next(stats);
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération de mes statistiques:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques'));
      })
    );
  }
  
  /**
   * Récupérer les statistiques d'une compétence
   */
  getSkillRatingStats(skillId: number): Observable<SkillRatingStats> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<SkillRatingStats>(
          `${this.apiUrl}/skill/${skillId}/stats`,
          { headers }
        );
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques de la compétence:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques'));
      })
    );
  }
  
  /**
   * Récupérer les échanges complétés non notés
   */
  getUnratedCompletedExchanges(): Observable<any[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<any[]>(
          `${this.apiUrl}/unrated`,
          { headers }
        );
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des échanges non notés:', error);
        return throwError(() => new Error('Échec de la récupération des échanges'));
      })
    );
  }
  
  /**
   * Vérifier si un échange a été noté
   */
  hasReceiverRated(exchangeId: number): Observable<boolean> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<boolean>(
          `${this.apiUrl}/${exchangeId}/has-rated`,
          { headers }
        );
      }),
      catchError(error => {
        console.error('Erreur lors de la vérification du rating:', error);
        return [false];
      })
    );
  }
  
  // ========================================
  // NOUVELLES MÉTHODES POUR DASHBOARD AVANCÉ
  // ========================================
  
  /**
   * Récupérer les statistiques complètes du dashboard
   */
  getDashboardStats(useCache: boolean = true): Observable<ProducerDashboardStats> {
    const now = Date.now();
    
    // Retourner le cache si valide et demandé
    if (useCache && this.dashboardStatsCache$.value && now < this.cacheExpiry) {
      return this.dashboardStatsCache$.asObservable().pipe(
        map(stats => stats!)
      );
    }
    
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerDashboardStats>(`${this.apiUrl}/producer/dashboard`, { headers });
      }),
      tap(stats => {
        this.dashboardStatsCache$.next(stats);
        this.cacheExpiry = now + this.CACHE_DURATION;
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques dashboard:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques'));
      })
    );
  }
  
  /**
   * Récupérer les statistiques d'engagement
   */
  getEngagementStats(): Observable<ProducerEngagementStats> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerEngagementStats>(`${this.apiUrl}/producer/engagement`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques d\'engagement:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques d\'engagement'));
      })
    );
  }
  
  /**
   * Récupérer les statistiques de croissance
   */
  getGrowthStats(): Observable<ProducerGrowthStats> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerGrowthStats>(`${this.apiUrl}/producer/growth`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques de croissance:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques de croissance'));
      })
    );
  }
  
  /**
   * Récupérer les statistiques de qualité
   */
  getQualityStats(): Observable<ProducerQualityStats> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ProducerQualityStats>(`${this.apiUrl}/producer/quality`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des statistiques de qualité:', error);
        return throwError(() => new Error('Échec de la récupération des statistiques de qualité'));
      })
    );
  }
  
  /**
   * Récupérer les données d'activité mensuelle
   */
  getMonthlyActivity(): Observable<MonthlyActivityData[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<MonthlyActivityData[]>(`${this.apiUrl}/producer/activity/monthly`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération de l\'activité mensuelle:', error);
        return throwError(() => new Error('Échec de la récupération de l\'activité mensuelle'));
      })
    );
  }
  
  /**
   * Récupérer les performances par compétence
   */
  getSkillsPerformance(): Observable<SkillPerformanceData[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<SkillPerformanceData[]>(`${this.apiUrl}/producer/skills/performance`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des performances par compétence:', error);
        return throwError(() => new Error('Échec de la récupération des performances'));
      })
    );
  }
  
  /**
   * Récupérer l'évolution des notes
   */
  getRatingEvolution(): Observable<RatingEvolutionData[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<RatingEvolutionData[]>(`${this.apiUrl}/producer/ratings/evolution`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération de l\'évolution des notes:', error);
        return throwError(() => new Error('Échec de la récupération de l\'évolution des notes'));
      })
    );
  }
  
  // ========================================
  // MÉTHODES UTILITAIRES (originales gardées)
  // ========================================
  
  /**
   * Calculer le nombre d'étoiles pleines pour l'affichage
   */
  getStarArray(rating: number): boolean[] {
    const stars: boolean[] = [];
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }
  
  /**
   * Obtenir la couleur selon la note moyenne
   */
  getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#4CAF50'; // Vert - Excellent
    if (rating >= 3.5) return '#8BC34A'; // Vert clair - Très bon
    if (rating >= 2.5) return '#FFC107'; // Orange - Moyen
    if (rating >= 1.5) return '#FF9800'; // Orange foncé - Faible
    return '#F44336'; // Rouge - Très faible
  }
  
  /**
   * Obtenir le label textuel pour une note
   */
  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Très bon';
    if (rating >= 2.5) return 'Bon';
    if (rating >= 1.5) return 'Moyen';
    if (rating >= 1) return 'Faible';
    return 'Non noté';
  }
  
  // ========================================
  // NOUVELLES MÉTHODES UTILITAIRES POUR DASHBOARD
  // ========================================
  
  /**
   * Obtenir l'icône selon le taux de croissance
   */
  getGrowthIcon(growthRate: number): string {
    if (growthRate > 0) return '📈';
    if (growthRate < 0) return '📉';
    return '➡️';
  }
  
  /**
   * Obtenir la couleur selon le taux de croissance
   */
  getGrowthColor(growthRate: number): string {
    if (growthRate > 10) return '#00b894';
    if (growthRate > 0) return '#8BC34A';
    if (growthRate < -10) return '#e17055';
    if (growthRate < 0) return '#FF9800';
    return '#74b9ff';
  }
  
  /**
   * Obtenir l'icône selon la tendance qualité
   */
  getQualityTrendIcon(trend: string): string {
    switch (trend) {
      case 'IMPROVING': return '⬆️';
      case 'DECLINING': return '⬇️';
      default: return '➡️';
    }
  }
  
  /**
   * Obtenir la couleur selon la tendance qualité
   */
  getQualityTrendColor(trend: string): string {
    switch (trend) {
      case 'IMPROVING': return '#00b894';
      case 'DECLINING': return '#e17055';
      default: return '#74b9ff';
    }
  }
  
  /**
   * Obtenir le niveau de performance selon la note
   */
  getPerformanceLevel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 4.0) return 'Très bon';
    if (rating >= 3.5) return 'Bon';
    if (rating >= 3.0) return 'Moyen';
    return 'À améliorer';
  }
  
  /**
   * Formatter le temps de réponse
   */
  formatResponseTime(hours: number): string {
    if (hours < 1) {
      return `${Math.round(hours * 60)} min`;
    }
    if (hours < 24) {
      return `${Math.round(hours)} h`;
    }
    return `${Math.round(hours / 24)} j`;
  }
  
  /**
   * Formatter le taux de croissance
   */
  formatGrowthRate(rate: number): string {
    const sign = rate > 0 ? '+' : '';
    return `${sign}${rate.toFixed(1)}%`;
  }
  
  // ========================================
  // GESTION DE CACHE (modifiée et étendue)
  // ========================================
  
  /**
   * Invalider le cache des statistiques de base (méthode existante)
   */
  invalidateCache(): void {
    this.producerStatsCache$.next(null);
  }
  
  /**
   *  Invalider les caches des statistiques avancées
   */
  private invalidateAdvancedCaches(): void {
    this.dashboardStatsCache$.next(null);
    this.cacheExpiry = 0;
  }
  
  /**
   *  Invalider tous les caches
   */
  invalidateAllCaches(): void {
    this.producerStatsCache$.next(null);
    this.invalidateAdvancedCaches();
  }
  
  /**
   *  Forcer le rechargement des données du dashboard
   */
  refreshDashboardStats(): Observable<ProducerDashboardStats> {
    this.invalidateAdvancedCaches();
    return this.getDashboardStats(false);
  }
}