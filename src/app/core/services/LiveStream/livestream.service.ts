import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, of, throwError, timer } from 'rxjs';
import { catchError, switchMap, map, retryWhen, delayWhen, take } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import {
  Room,
  RoomConnectOptions,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  VideoPresets,
  Track,
  ConnectionState,
  RoomOptions,
  LocalTrackPublication,
  LocalVideoTrack,
  LocalAudioTrack,
  TrackPublishOptions
} from 'livekit-client';

@Injectable({
  providedIn: 'root'
})
export class LivestreamService {
  private readonly API_URL = 'http://localhost:8822/api/v1/livestream';
  private readonly LIVEKIT_URL = 'ws://localhost:7880';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

  private getAuthHeaders(): Observable<HttpHeaders> {
    return from(this.keycloakService.getToken()).pipe(
      map(token => {
        if (!token) throw new Error('Authentication token is missing');
        return new HttpHeaders().set('Authorization', `Bearer ${token}`);
      }),
      catchError(err => {
        console.error('getAuthHeaders failed:', err);
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
      switchMap(headers => this.http.get(
        `${this.API_URL}/${sessionId}/join`,
        { headers, responseType: 'text', observe: 'response' }
      ).pipe(
        map(res => res.body?.trim() || ''),
        retryWhen(errors => errors.pipe(
          delayWhen((_, i) => timer(i * this.RETRY_DELAY)), 
          take(this.MAX_RETRIES)
        ))
      ))
    );
  }

  async connectToRoom(roomName: string, token: string): Promise<Room> {
    console.log('Connecting to room:', roomName);
    
    const roomOptions: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
        videoCodec: 'vp8',
        dtx: true,
        red: true,
        videoEncoding: { 
          maxBitrate: 1_500_000, // Augmenté pour le streaming professionnel
          maxFramerate: 30 
        }
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution, // Résolution HD pour le producer
        facingMode: 'user'
      }
    };

    const room = new Room(roomOptions);

    const connectOptions: RoomConnectOptions = {
      autoSubscribe: true,
      maxRetries: 5,
      peerConnectionTimeout: 30000,
      websocketTimeout: 30000,
      rtcConfig: {
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302'] },
          { urls: ['stun:stun1.l.google.com:19302'] },
          { urls: ['stun:stun2.l.google.com:19302'] },
          { urls: ['stun:global.stun.twilio.com:3478'] }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      }
    };

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await room.connect(this.LIVEKIT_URL, token, connectOptions);
      console.log('Successfully connected to room:', roomName);
      console.log('Local participant:', room.localParticipant.identity);
      console.log('Room participants:', room.remoteParticipants.size);
      
      return room;
    } catch (error) {
      console.error('Failed to connect to room:', error);
      throw new Error(`Connection failed: ${error}`);
    }
  }

  async startScreenShare(room: Room): Promise<LocalTrackPublication | null> {
    try {
      // Fixed: Use proper screen share constraints without unsupported properties
      const screenTracks = await room.localParticipant.createScreenTracks({
        audio: true,
        video: true // Simplified - remove frameRate as it's not supported in this context
      });

      if (screenTracks.length === 0) {
        throw new Error('No screen tracks created');
      }

      const publication = await room.localParticipant.publishTrack(
        screenTracks[0],
        {
          name: 'screen_share',
          source: Track.Source.ScreenShare
        }
      );

      console.log('Screen sharing started');
      return publication;
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  async stopScreenShare(room: Room): Promise<void> {
    try {
      // Fixed: Use proper method to get screen share track
      const screenTracks = Array.from(room.localParticipant.videoTrackPublications.values())
        .filter(pub => pub.source === Track.Source.ScreenShare);
      
      if (screenTracks.length > 0) {
        await room.localParticipant.unpublishTrack(screenTracks[0].track!);
        console.log('Screen sharing stopped');
      }
    } catch (error) {
      console.error('Error stopping screen share:', error);
      throw error;
    }
  }

  async disconnectFromRoom(room: Room): Promise<void> {
    try {
      console.log('Disconnecting from room...');
      await room.disconnect();
      console.log('Successfully disconnected from room');
    } catch (err) {
      console.error('Error during disconnect:', err);
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
      switchMap(headers => this.http.get<LivestreamSession>(
        `${this.API_URL}/skill/${skillId}`,
        { headers }
      ).pipe(
        catchError(error => {
          if (error.status === 403 || error.status === 404) return of(null);
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
    return (error: any) => {
      const fullMessage = `${message}. ${error.error?.message || error.message}`;
      console.error(fullMessage);
      return throwError(() => new Error(fullMessage));
    };
  }
}