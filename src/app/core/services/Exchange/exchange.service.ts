import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { UserResponse } from '../../../models/user-response';

interface ExchangeRequest {
  producerId: number;
  receiverId: number;
  skillId: number;
}

export interface SkillResponse {
  id: number;
  name: string;
  description: string;
  availableQuantity: number;
  price: number;
  nbInscrits: number;
  categoryId: number;
  categoryName: string;
  categoryDescription: string;
  userId: number;
  pictureUrl: string;
  streamingDate: string;
  streamingTime: string;
}

export interface ExchangeResponse {
  id: number;
  producerId: number;
  receiverId: number;
  skillId: number;
  createdAt: string;
  updatedAt?: string;
  producerRating?: number;
  status: string;
  streamingDate?: string;
  rejectionReason?: string;
  skillName: string;
  receiverName: string;
  skillIdField: number;
}

@Injectable({ providedIn: 'root' })
export class ExchangeService {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/exchanges';
  private skillApiUrl = 'http://localhost:8822/api/v1/skills';

  /**
   * Récupère les receveurs acceptés pour une compétence donnée
   */
  getAcceptedReceiversForSkill(skillId: number): Observable<UserResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<UserResponse[]>(`${this.apiUrl}/skill/${skillId}/accepted-receivers`, { headers });
      }),
      catchError(error => {
        console.error('Error fetching accepted receivers:', error);
        return throwError(() => new Error('Failed to fetch accepted receivers'));
      })
    );
  }
  
  /**
   * Récupère les compétences acceptées pour le receveur connecté
   */
  getAcceptedSkills(): Observable<SkillResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<SkillResponse[]>(`${this.apiUrl}/accepted-skills`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des compétences acceptées :', error);
        return throwError(() => new Error('Échec de la récupération des compétences acceptées'));
      })
    );
  }

  /**
   * Vérifie si une session a été complétée pour une compétence donnée
   * @param skillId L'ID de la compétence
   * @returns Observable<boolean> true si une session a été complétée, false sinon
   */
  isSessionCompletedForSkill(skillId: number): Observable<boolean> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ExchangeResponse[]>(`${this.apiUrl}/skill/${skillId}`, { headers }).pipe(
          map(exchanges => {
            // Vérifier si au moins un échange a le statut COMPLETED
            const isCompleted = exchanges.some(exchange => exchange.status === 'COMPLETED');
            console.log(`Skill ${skillId} session completed status:`, isCompleted);
            return isCompleted;
          }),
          catchError(error => {
            console.error('Error checking session completion status:', error);
            // En cas d'erreur, on considère qu'il n'y a pas de session complétée
            return of(false);
          })
        );
      }),
      catchError(error => {
        console.error('Error getting token for session check:', error);
        return of(false);
      })
    );
  }

  /**
   * Crée un nouvel échange
   */
  createExchange(request: ExchangeRequest): Observable<ExchangeResponse> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.post<ExchangeResponse>(this.apiUrl, request, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la création de l\'échange :', error);
        return throwError(() => new Error('Échec de la création de l\'échange'));
      })
    );
  }

  /**
   * Récupère les échanges en attente pour le producteur connecté
   */
  getPendingExchangesForProducer(): Observable<ExchangeResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ExchangeResponse[]>(`${this.apiUrl}/pending`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des échanges en attente :', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          details: error.error
        });
        return throwError(() => new Error('Échec de la récupération des échanges en attente'));
      })
    );
  }

  /**
   * Accepte un échange
   */
  acceptExchange(id: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${id}/accept`, {}, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de l\'acceptation de l\'échange :', error);
        return throwError(() => new Error('Échec de l\'acceptation de l\'échange'));
      })
    );
  }

  /**
   * Rejette un échange avec une raison optionnelle
   */
  rejectExchange(id: number, reason?: string): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        const body = reason ? { reason } : {};
        console.log('Sending reject request with body:', body); 
        return this.http.put<void>(`${this.apiUrl}/${id}/reject`, body, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors du rejet de l\'échange :', error);
        return throwError(() => new Error('Échec du rejet de l\'échange'));
      })
    );
  }

  /**
   * Récupère tous les échanges de l'utilisateur connecté
   */
  getUserExchanges(): Observable<ExchangeResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ExchangeResponse[]>(`${this.apiUrl}/my-exchanges`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des échanges de l\'utilisateur :', {
          status: error.status,
          error: error.error
        });
        return throwError(() => new Error('Échec de la récupération des échanges de l\'utilisateur'));
      })
    );
  }

  /**
   * Récupère les échanges pour une compétence spécifique
   */
  getExchangesBySkillId(skillId: number): Observable<ExchangeResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ExchangeResponse[]>(`${this.apiUrl}/skill/${skillId}`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération des échanges pour la compétence :', error);
        // Retourner un tableau vide en cas d'erreur pour ne pas bloquer l'application
        return of([]);
      })
    );
  }

  /**
   * Accepte tous les échanges en attente pour une compétence
   */
  acceptAllPendingExchanges(skillId: number): Observable<ExchangeResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<ExchangeResponse[]>(`${this.apiUrl}/${skillId}/accept-all`, {}, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de l\'acceptation de tous les échanges :', error);
        return throwError(() => new Error('Échec de l\'acceptation de tous les échanges'));
      })
    );
  }

  /**
   * Met à jour le statut d'un échange
   */
  updateExchangeStatus(id: number, status: string): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${id}/status`, null, { 
          headers,
          params: { status }
        });
      }),
      catchError(error => {
        console.error('Erreur lors de la mise à jour du statut de l\'échange :', error);
        return throwError(() => new Error('Échec de la mise à jour du statut'));
      })
    );
  }

  /**
   * Récupère une compétence par son ID
   */
  getSkillById(skillId: number): Observable<SkillResponse> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<SkillResponse>(`${this.skillApiUrl}/${skillId}`, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la récupération de la compétence :', error);
        return throwError(() => new Error('Échec de la récupération de la compétence'));
      })
    );
  }

  /**
   * Évalue un échange terminé
   */
  rateExchange(exchangeId: number, rating: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${exchangeId}/rate`, { rating }, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de l\'évaluation de l\'échange :', error);
        return throwError(() => new Error('Échec de l\'évaluation'));
      })
    );
  }

  /**
   * Annule un échange
   */
  cancelExchange(exchangeId: number, reason?: string): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        const body = reason ? { reason } : {};
        return this.http.put<void>(`${this.apiUrl}/${exchangeId}/cancel`, body, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de l\'annulation de l\'échange :', error);
        return throwError(() => new Error('Échec de l\'annulation'));
      })
    );
  }
}