import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, map, tap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';

// Interfaces pour les DTOs
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

@Injectable({ providedIn: 'root' })
export class RatingService {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/exchanges/ratings';
  
  // Cache pour les statistiques
  private producerStatsCache$ = new BehaviorSubject<ProducerRatingStats | null>(null);
  
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
  
  /**
   * Invalider le cache des statistiques
   */
  invalidateCache(): void {
    this.producerStatsCache$.next(null);
  }
}