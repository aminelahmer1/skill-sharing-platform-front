
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';

interface ExchangeRequest {
  producerId: number;
  receiverId: number;
  skillId: number;
}

interface SkillResponse {
  id: number;
  name: string;
  nbInscrits: number;
  availableQuantity: number;
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

  createExchange(request: ExchangeRequest): Observable<ExchangeResponse> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.post<ExchangeResponse>(this.apiUrl, request, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de la création de l’échange :', error);
        return throwError(() => new Error('Échec de la création de l’échange'));
      })
    );
  }

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

  acceptExchange(id: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${id}/accept`, {}, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors de l\'acceptation de l’échange :', error);
        return throwError(() => new Error('Échec de l\'acceptation de l’échange'));
      })
    );
  }

  rejectExchange(id: number, reason?: string): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        const body = reason ? { reason } : {};
        console.log('Sending reject request with body:', body); 
        return this.http.put<void>(`${this.apiUrl}/${id}/reject`, body, { headers });
      }),
      catchError(error => {
        console.error('Erreur lors du rejet de l’échange :', error);
        return throwError(() => new Error('Échec du rejet de l’échange'));
      })
    );
  }

  getUserExchanges(): Observable<ExchangeResponse[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<ExchangeResponse[]>(`${this.apiUrl}/my-exchanges`, { headers }).pipe(
          catchError(error => {
            console.error('Erreur lors de la récupération des échanges de l’utilisateur :', {
              status: error.status,
              error: error.error
            });
            return throwError(() => new Error('Échec de la récupération des échanges de l’utilisateur'));
          })
        );
      })
    );
  }

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
}
