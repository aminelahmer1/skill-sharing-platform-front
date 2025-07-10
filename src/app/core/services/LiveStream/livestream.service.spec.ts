// src/app/core/services/livestream.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';

@Injectable({
  providedIn: 'root'
})
export class LivestreamService {
  private apiUrl = 'http://localhost:8822/api/v1/livestream';

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

  private getHeaders(): Observable<HttpHeaders> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        return new Observable<HttpHeaders>(observer => {
          observer.next(new HttpHeaders().set('Authorization', `Bearer ${token}`));
          observer.complete();
        });
      })
    );
  }

  createSession(skillId: number): Observable<LivestreamSession> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.post<LivestreamSession>(`${this.apiUrl}/start/${skillId}`, {}, { headers });
      })
    );
  }

  getSession(sessionId: number): Observable<LivestreamSession> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.get<LivestreamSession>(`${this.apiUrl}/${sessionId}`, { headers });
      })
    );
  }

  joinSession(sessionId: number): Observable<string> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.get<string>(`${this.apiUrl}/${sessionId}/join`, { headers });
      })
    );
  }

  endSession(sessionId: number): Observable<void> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(`${this.apiUrl}/end/${sessionId}`, {}, { headers });
      })
    );
  }
}