import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, throwError, of, timer } from 'rxjs';
import { catchError, switchMap, map, retryWhen, delayWhen, take } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { Room, RoomConnectOptions, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, VideoPresets, DisconnectReason, Track, ConnectionState } from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class LivestreamService {
  private readonly API_URL = 'http://localhost:8822/api/v1/livestream';
  private readonly LIVEKIT_URL = 'http://localhost:7880';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;
  
  private activeRoom: Room | null = null;

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

  private getAuthHeaders(): Observable<HttpHeaders> {
    return from(this.keycloakService.getToken()).pipe(
      map(token => {
        if (!token) {
          throw new Error('No authentication token available');
        }
        return new HttpHeaders().set('Authorization', `Bearer ${token}`);
      }),
      catchError(error => {
        console.error('Error getting auth token:', error);
        return throwError(() => new Error('Authentication failed'));
      })
    );
  }

  createSession(skillId: number, immediate: boolean = true): Observable<LivestreamSession> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => this.http.post<LivestreamSession>(
        `${this.API_URL}/start/${skillId}`,
        { immediate },
        { headers }
      ).pipe(
        retryWhen(errors => errors.pipe(
          delayWhen((_, i) => timer(i * this.RETRY_DELAY)),
          take(this.MAX_RETRIES)
        )),
        catchError(this.handleError<LivestreamSession>('Failed to create session'))
      ))
    );
  }

  getSession(sessionId: number): Observable<LivestreamSession> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => this.http.get<LivestreamSession>(
        `${this.API_URL}/details/${sessionId}`,
        { headers }
      ).pipe(
        catchError(this.handleError<LivestreamSession>('Failed to get session'))
      ))
    );
  }

 joinSession(sessionId: number): Observable<string> {
  return this.getAuthHeaders().pipe(
    switchMap(headers => {
      if (!sessionId) {
        return throwError(() => new Error('Session ID is required'));
      }
      
      return this.http.get(
        `${this.API_URL}/${sessionId}/join`,
        { 
          headers,
          responseType: 'text',
          observe: 'response' // Pour obtenir toute la réponse
        }
      ).pipe(
        map(response => {
          if (!response.body) {
            throw new Error('Empty token received from server');
          }
          return response.body.trim();
        }),
        retryWhen(errors => errors.pipe(
          delayWhen((_, i) => timer(i * this.RETRY_DELAY)),
          take(this.MAX_RETRIES)
        )),
        catchError(error => {
          console.error('Failed to join session:', error);
          return throwError(() => new Error(
            error.error?.message || 
            error.message || 
            'Failed to join session'
          ));
        })
      );
    })
  );
}

async connectToRoom(roomName: string, token: string): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      simulcast: true,
      videoCodec: 'vp8',
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  });

  // Configurez les options de connexion
  const connectOptions: RoomConnectOptions = {
    autoSubscribe: true,
    maxRetries: 5, // Augmentez le nombre de tentatives
    peerConnectionTimeout: 20000, // Timeout plus long
    websocketTimeout: 20000,
  };

  try {
    // Ajoutez des logs pour le débogage
    console.log('Connecting to LiveKit with:', {
      url: 'ws://localhost:7880',
      token,
      roomName,
      connectOptions
    });

    await room.connect('ws://localhost:7880', token, connectOptions);

    // Vérifiez la connexion
    if (room.state !== ConnectionState.Connected) {
      throw new Error('Failed to connect to room');
    }

    console.log('Successfully connected to room:', room.name);
    return room;
  } catch (error) {
    console.error('LiveKit connection failed:', {
      error,
      roomName,
      token: token.substring(0, 10) + '...' // Log partiel du token pour sécurité
    });
    throw new Error('Could not connect to the room. Please check your connection and try again.');
  }
}

  async disconnectFromRoom(): Promise<void> {
    if (this.activeRoom) {
      try {
        await this.activeRoom.disconnect();
      } catch (error) {
        console.error('Disconnection error:', error);
      } finally {
        this.activeRoom = null;
      }
    }
  }

  endSession(sessionId: number): Observable<void> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => this.http.post<void>(
        `${this.API_URL}/end/${sessionId}`,
        {},
        { headers }
      ).pipe(
        catchError(this.handleError<void>('Failed to end session'))
      ))
    );
  }

  getSessionBySkillId(skillId: number): Observable<LivestreamSession | null> {
  return this.getAuthHeaders().pipe(
    switchMap(headers => this.http.get<LivestreamSession | null>(
      `${this.API_URL}/skill/${skillId}`,
      { headers }
    ).pipe(
      catchError(error => {
        if (error.status === 403 || error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      })
    ))
  );
}

  startRecording(roomName: string): Observable<void> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => this.http.post<void>(
        `${this.API_URL}/recordings/start`,
        { roomName },
        { headers }
      ).pipe(
        catchError(this.handleError<void>('Failed to start recording'))
      ))
    );
  }

  stopRecording(roomName: string): Observable<void> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => this.http.post<void>(
        `${this.API_URL}/recordings/stop`,
        { roomName },
        { headers }
      ).pipe(
        catchError(this.handleError<void>('Failed to stop recording'))
      ))
    );
  }

  private handleError<T>(message: string): (error: any) => Observable<T> {
    return (error: any): Observable<T> => {
      console.error(`${message}:`, error);
      return throwError(() => new Error(`${message}. ${error.error?.message || error.message}`));
    };
  }
}