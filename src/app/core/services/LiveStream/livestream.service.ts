import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, throwError, of } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { RoomOptions, Room } from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class LivestreamService {
  private apiUrl = 'http://localhost:8822/api/v1/livestream';
  private room: Room | null = null;
  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

  private getHeaders(): Observable<HttpHeaders> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        return of(new HttpHeaders().set('Authorization', `Bearer ${token}`));
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

  getSessionDetails(sessionId: number): Observable<{ producerToken: string, roomName: string }> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.get<LivestreamSession>(`${this.apiUrl}/details/${sessionId}`, { headers }).pipe(
          map(session => ({
            producerToken: session.producerToken,
            roomName: session.roomName
          })),
          catchError(error => {
            console.error('Error fetching session details:', error);
            return throwError(() => new Error('Failed to get session details'));
          })
        );
      })
    );
  }

  // Nouvelle méthode ajoutée pour récupérer les détails d'une session
  getSession(sessionId: number): Observable<LivestreamSession> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.get<LivestreamSession>(`${this.apiUrl}/details/${sessionId}`, { headers }).pipe(
          catchError(error => {
            console.error('Error fetching session:', error);
            return throwError(() => new Error('Failed to get session'));
          })
        );
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

  getSessionBySkillId(skillId: number): Observable<LivestreamSession | null> {
    return this.getHeaders().pipe(
      switchMap(headers => this.http.get<LivestreamSession | null>(
        `${this.apiUrl}/skill/${skillId}`,
        { headers, observe: 'response' }
      )),
      map(response => {
        if (response.status === 204) {
          return null;
        }
        return response.body;
      }),
      catchError(error => {
        if (error.status === 204) {
          return of(null);
        }
        return throwError(() => error);
      })
    );
  }

  getNewToken(sessionId: number): Observable<string> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.get<string>(`${this.apiUrl}/refresh-token/${sessionId}`, { headers }).pipe(
          catchError(error => {
            console.error(`Erreur lors du rafraîchissement du token pour la session ${sessionId}:`, error);
            let message = 'Erreur lors du rafraîchissement du token';
            if (error.status === 500) {
              message = 'Erreur serveur lors du rafraîchissement du token.';
            } else if (error.status === 400) {
              message = 'Identifiant de session invalide pour le rafraîchissement du token.';
            } else if (error.status === 404) {
              message = 'Session introuvable pour le rafraîchissement du token.';
            }
            return throwError(() => new Error(message));
          })
        );
      })
    );
  }
   async connectToRoom(
    roomName: string,
    token: string,
    options: RoomOptions = {}
  ): Promise<Room> {
    // Clean up previous connection if exists
    if (this.room) {
      await this.disconnectFromRoom();
    }

    this.room = new Room(options);
    
    try {
      await this.room.connect(`wss://your-livekit-server`, token);
      return this.room;
    } catch (error) {
      console.error('Failed to connect to LiveKit room:', error);
      throw error;
    }
  }

  async disconnectFromRoom(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  async startRecording(roomName: string): Promise<void> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(
          `${this.apiUrl}/recordings/start`,
          { roomName },
          { headers }
        );
      })
    ).toPromise();
  }

  async stopRecording(roomName: string): Promise<void> {
    return this.getHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(
          `${this.apiUrl}/recordings/stop`,
          { roomName },
          { headers }
        );
      })
    ).toPromise();
  }

}