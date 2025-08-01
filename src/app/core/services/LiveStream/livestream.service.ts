import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, of, throwError, timer, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, map, retryWhen, delayWhen, take, timeout } from 'rxjs/operators';
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
  TrackPublishOptions,
  RoomEvent,
  ConnectionQuality,
  Participant
} from 'livekit-client';

interface ConnectionMetrics {
  connectionTime: number;
  lastConnected: Date;
  reconnectionAttempts: number;
  qualityLevel: 'excellent' | 'good' | 'fair' | 'poor';
}

@Injectable({
  providedIn: 'root'
})
export class LivestreamService {
  private readonly API_URL = 'http://localhost:8822/api/v1/livestream';
  private readonly LIVEKIT_URL = 'ws://localhost:7880';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;
  private readonly CONNECTION_TIMEOUT = 45000;
  private readonly HEARTBEAT_INTERVAL = 30000;

  // État de connexion
  private connectionState$ = new BehaviorSubject<ConnectionState>(ConnectionState.Disconnected);
  private connectionMetrics: ConnectionMetrics = {
    connectionTime: 0,
    lastConnected: new Date(),
    reconnectionAttempts: 0,
    qualityLevel: 'excellent'
  };

  // Cache des tokens
  private tokenCache = new Map<string, { token: string; expires: Date }>();

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {
    this.setupConnectionMonitoring();
  }

  private setupConnectionMonitoring(): void {
    setInterval(() => {
      this.cleanTokenCache();
    }, 60000);
  }

  private cleanTokenCache(): void {
    const now = new Date();
    for (const [key, value] of this.tokenCache.entries()) {
      if (value.expires < now) {
        this.tokenCache.delete(key);
      }
    }
  }

  // 🔧 Headers d'authentification
  private getAuthHeaders(): Observable<HttpHeaders> {
    return from(this.keycloakService.getToken()).pipe(
      map(token => {
        if (!token) throw new Error('Authentication token is missing');
        return new HttpHeaders().set('Authorization', `Bearer ${token}`);
      }),
      timeout(5000),
      catchError(err => {
        console.error('Authentication failed:', err);
        return throwError(() => new Error('Authentication failed - please login again'));
      })
    );
  }

  private handleHttpError<T>(operation: string): (error: HttpErrorResponse) => Observable<T> {
    return (error: HttpErrorResponse) => {
      let errorMessage = `${operation} failed`;
      
      if (error.status === 0) {
        errorMessage = 'Network error - check your connection';
      } else if (error.status === 401) {
        errorMessage = 'Authentication expired - please refresh';
      } else if (error.status === 403) {
        errorMessage = 'Access denied - insufficient permissions';
      } else if (error.status === 404) {
        errorMessage = 'Resource not found';
      } else if (error.status >= 500) {
        errorMessage = 'Server error - please try again later';
      } else if (error.error?.message) {
        errorMessage = `${operation} failed: ${error.error.message}`;
      }

      console.error(`${operation} error:`, {
        status: error.status,
        message: error.message,
        url: error.url
      });

      return throwError(() => new Error(errorMessage));
    };
  }

  // ============================================================================
  // ===== SESSION MANAGEMENT =====
  // ============================================================================

  createSession(skillId: number, immediate: boolean = true): Observable<LivestreamSession> {
    if (!skillId || skillId <= 0) {
      return throwError(() => new Error('Invalid skill ID'));
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.post<LivestreamSession>(
          `${this.API_URL}/start/${skillId}`,
          { immediate },
          { headers }
        ).pipe(
          timeout(15000),
          retryWhen(errors => errors.pipe(
            delayWhen((_, i) => timer(Math.min(1000 * Math.pow(2, i), 10000))),
            take(this.MAX_RETRIES)
          )),
          map(session => {
            this.validateSession(session);
            return session;
          }),
          catchError(this.handleHttpError<LivestreamSession>('Create session'))
        );
      })
    );
  }

  private validateSession(session: LivestreamSession): void {
    if (!session.id || !session.roomName) {
      throw new Error('Invalid session data received');
    }
    if (!session.producerToken) {
      throw new Error('Producer token missing from session');
    }
  }

  getSession(sessionId: number): Observable<LivestreamSession> {
    if (!sessionId || sessionId <= 0) {
      return throwError(() => new Error('Invalid session ID'));
    }

    const cacheKey = `session_${sessionId}`;
    const cached = this.tokenCache.get(cacheKey);
    
    if (cached && cached.expires > new Date()) {
      return of(JSON.parse(cached.token) as LivestreamSession);
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.get<LivestreamSession>(
          `${this.API_URL}/${sessionId}`,
          { headers }
        ).pipe(
          timeout(10000),
          map(session => {
            this.validateSession(session);
            this.tokenCache.set(cacheKey, {
              token: JSON.stringify(session),
              expires: new Date(Date.now() + 300000)
            });
            return session;
          }),
          catchError(this.handleHttpError<LivestreamSession>('Get session'))
        );
      })
    );
  }

  joinSession(sessionId: number): Observable<string> {
    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.get(
          `${this.API_URL}/${sessionId}/join`,
          { 
            headers,
            responseType: 'text',
            observe: 'response'
          }
        ).pipe(
          timeout(10000),
          map(res => {
            const token = res.body?.trim() || '';
            console.log('Received viewer token length:', token.length);
            
            if (!this.validateJWTFormat(token)) {
              throw new Error('Invalid viewer token format');
            }
            
            return token;
          }),
          retryWhen(errors => errors.pipe(
            delayWhen((_, i) => timer(i * this.RETRY_DELAY)),
            take(this.MAX_RETRIES)
          ))
        );
      })
    );
  }

  getSessionBySkillId(skillId: number): Observable<LivestreamSession | null> {
    if (!skillId || skillId <= 0) {
      return throwError(() => new Error('Invalid skill ID'));
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.get<LivestreamSession>(
          `${this.API_URL}/skill/${skillId}`,
          { headers }
        ).pipe(
          timeout(10000),
          catchError(error => {
            if (error.status === 404 || error.status === 204) {
              return of(null);
            }
            return throwError(() => error);
          })
        );
      })
    );
  }

  endSession(sessionId: number): Observable<void> {
    if (!sessionId || sessionId <= 0) {
      return throwError(() => new Error('Invalid session ID'));
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(
          `${this.API_URL}/end/${sessionId}`,
          {},
          { headers }
        ).pipe(
          timeout(15000),
          map(() => {
            this.tokenCache.delete(`session_${sessionId}`);
            console.log('Session ended and cache cleared');
          }),
          catchError(this.handleHttpError<void>('End session'))
        );
      })
    );
  }

  // ============================================================================
  // ===== LIVEKIT CONNECTION =====
  // ============================================================================

  async connectToRoom(roomName: string, token: string, isProducer: boolean = false): Promise<Room> {
    const role = isProducer ? 'PRODUCER' : 'VIEWER';
    console.log(`Connecting to room: ${roomName} as ${role}`);

    if (!this.validateJWTFormat(token)) {
      throw new Error('Invalid JWT token format');
    }

    const startTime = Date.now();
    
    try {
      await this.testNetworkConnectivity();

      const room = new Room(this.getRoomOptions(isProducer));
      const connectOptions = this.getConnectionOptions(isProducer);

      this.setupConnectionEventHandlers(room);
      await this.performConnectionWithRetry(room, roomName, token, connectOptions);
      await this.validateConnection(room);

      this.connectionMetrics.connectionTime = Date.now() - startTime;
      this.connectionMetrics.lastConnected = new Date();
      this.connectionMetrics.reconnectionAttempts = 0;

      console.log(`Successfully connected as ${role} in ${this.connectionMetrics.connectionTime}ms`);
      this.connectionState$.next(ConnectionState.Connected);

      return room;

    } catch (error) {
      this.connectionMetrics.reconnectionAttempts++;
      console.error(`Connection failed as ${role}:`, error);
      throw new Error(`${role} connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateJWTFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      console.error('Token is empty or not a string');
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT format - should have 3 parts');
      return false;
    }

    try {
      const header = JSON.parse(atob(parts[0]));
      const payload = JSON.parse(atob(parts[1]));
      
      if (!payload.video || !payload.video.room) {
        console.error('Token missing required video/room claims');
        return false;
      }

      if (payload.exp && Date.now() / 1000 > payload.exp) {
        console.error('Token has expired');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error parsing JWT token:', error);
      return false;
    }
  }

  private getRoomOptions(isProducer: boolean): RoomOptions {
    return {
      adaptiveStream: !isProducer,
      dynacast: isProducer,
      publishDefaults: isProducer ? {
        simulcast: false,
        videoCodec: 'vp8',
        dtx: true,
        red: false,
        videoEncoding: {
          maxBitrate: 1_200_000,
          maxFramerate: 30
        }
      } : undefined,
      videoCaptureDefaults: isProducer ? {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user'
      } : undefined
    };
  }

  private getConnectionOptions(isProducer: boolean): RoomConnectOptions {
    return {
      autoSubscribe: true,
      maxRetries: isProducer ? 3 : 2,
      peerConnectionTimeout: this.CONNECTION_TIMEOUT,
      websocketTimeout: this.CONNECTION_TIMEOUT,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 6,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      }
    };
  }

  private setupConnectionEventHandlers(room: Room): void {
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log('Connection state changed:', state);
      this.connectionState$.next(state);
    });

    room.on(RoomEvent.Reconnecting, () => {
      console.log('Room reconnecting...');
      this.connectionMetrics.reconnectionAttempts++;
    });

    room.on(RoomEvent.Reconnected, () => {
      console.log('Room reconnected successfully');
      this.connectionMetrics.reconnectionAttempts = 0;
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.log('Room disconnected:', reason);
      this.connectionState$.next(ConnectionState.Disconnected);
    });
  }

  private async performConnectionWithRetry(
    room: Room, 
    roomName: string, 
    token: string, 
    options: RoomConnectOptions
  ): Promise<void> {
    const maxAttempts = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Connection attempt ${attempt}/${maxAttempts}`);
        
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        const connectionPromise = room.connect(this.LIVEKIT_URL, token, options);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
        );

        await Promise.race([connectionPromise, timeoutPromise]);
        return;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Connection failed');
        console.warn(`Connection attempt ${attempt} failed:`, lastError.message);
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
      }
    }
  }

  private async validateConnection(room: Room): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (room.state !== ConnectionState.Connected) {
      throw new Error(`Connection validation failed - room state: ${room.state}`);
    }

    if (!room.engine || room.engine.isClosed) {
      throw new Error('Connection engine is not available');
    }

    console.log('Connection validated successfully');
  }

  async disconnectFromRoom(room: Room): Promise<void> {
    try {
      console.log('Disconnecting from room...');
      
      if (room.state === ConnectionState.Disconnected) {
        console.log('Room already disconnected');
        return;
      }

      const localTracks = Array.from(room.localParticipant.trackPublications.values());
      const unpublishPromises = localTracks.map(async (trackPub) => {
        if (trackPub.track) {
          try {
            await room.localParticipant.unpublishTrack(trackPub.track);
          } catch (error) {
            console.warn('Error unpublishing track:', error);
          }
        }
      });

      await Promise.race([
        Promise.all(unpublishPromises),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      await room.disconnect();
      
      this.connectionState$.next(ConnectionState.Disconnected);
      console.log('Successfully disconnected from room');

    } catch (error) {
      console.error('Error during disconnect:', error);
      this.connectionState$.next(ConnectionState.Disconnected);
    }
  }

  // ============================================================================
  // ===== SCREEN SHARING =====
  // ============================================================================

  async startScreenShare(room: Room): Promise<LocalTrackPublication | null> {
    try {
      console.log('Starting screen share...');
      
      if (room.state !== ConnectionState.Connected) {
        throw new Error('Room is not connected');
      }

      const existingScreenShare = Array.from(room.localParticipant.videoTrackPublications.values())
        .find(pub => pub.source === Track.Source.ScreenShare);
      
      if (existingScreenShare) {
        console.log('Screen share already active');
        return existingScreenShare;
      }

      const screenTracks = await room.localParticipant.createScreenTracks({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: {
          displaySurface: 'monitor'
        }
      });

      if (screenTracks.length === 0) {
        throw new Error('No screen tracks created - user may have cancelled');
      }

      const videoTrack = screenTracks.find(track => track.kind === Track.Kind.Video);
      if (!videoTrack) {
        throw new Error('No video track found in screen share');
      }

      const publication = await room.localParticipant.publishTrack(videoTrack, {
        name: 'screen_share',
        source: Track.Source.ScreenShare,
        simulcast: false,
        dtx: false
      });

      const audioTrack = screenTracks.find(track => track.kind === Track.Kind.Audio);
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          name: 'screen_share_audio',
          source: Track.Source.ScreenShareAudio,
          dtx: false
        });
      }

      console.log('Screen sharing started successfully');
      return publication;

    } catch (error) {
      console.error('Error starting screen share:', error);
      if (error instanceof Error && error.message.includes('cancelled')) {
        throw new Error('Screen sharing was cancelled by user');
      }
      throw error;
    }
  }

  async stopScreenShare(room: Room): Promise<void> {
    try {
      console.log('Stopping screen share...');
      
      const screenTracks = Array.from(room.localParticipant.videoTrackPublications.values())
        .filter(pub => pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio);
      
      if (screenTracks.length === 0) {
        console.log('No screen share tracks to stop');
        return;
      }

      const unpublishPromises = screenTracks.map(async (trackPub) => {
        if (trackPub.track) {
          await room.localParticipant.unpublishTrack(trackPub.track);
        }
      });

      await Promise.all(unpublishPromises);
      console.log('Screen sharing stopped successfully');

    } catch (error) {
      console.error('Error stopping screen share:', error);
      throw error;
    }
  }

  // ============================================================================
  // ===== RECORDING =====
  // ============================================================================

  startRecording(roomName: string): Observable<void> {
    if (!roomName) {
      return throwError(() => new Error('Room name is required'));
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(
          `${this.API_URL}/recordings/start`,
          { roomName },
          { headers }
        ).pipe(
          timeout(15000),
          retryWhen(errors => errors.pipe(
            delayWhen((_, i) => timer(i * 1000)),
            take(2)
          )),
          catchError(this.handleHttpError<void>('Start recording'))
        );
      })
    );
  }

  stopRecording(roomName: string): Observable<void> {
    if (!roomName) {
      return throwError(() => new Error('Room name is required'));
    }

    return this.getAuthHeaders().pipe(
      switchMap(headers => {
        return this.http.post<void>(
          `${this.API_URL}/recordings/stop`,
          { roomName },
          { headers }
        ).pipe(
          timeout(15000),
          retryWhen(errors => errors.pipe(
            delayWhen((_, i) => timer(i * 1000)),
            take(2)
          )),
          catchError(this.handleHttpError<void>('Stop recording'))
        );
      })
    );
  }

  // ============================================================================
  // ===== CONNECTIVITY TESTS =====
  // ============================================================================

  private async testNetworkConnectivity(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.LIVEKIT_URL.replace('ws://', 'http://'), {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 404) {
        throw new Error(`Server not reachable: ${response.status}`);
      }

      console.log('Network connectivity test passed');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Network timeout - check your internet connection');
      }
      console.warn('Network connectivity test failed:', error);
    }
  }

  async testConnection(): Promise<{success: boolean, latency: number, details: string}> {
    const startTime = Date.now();
    
    try {
      console.log('Testing comprehensive connectivity...');
      
      const backendTest = await this.testBackendConnectivity();
      const livekitTest = await this.testLivekitConnectivity();
      const webrtcTest = await this.testWebRTCConnectivity();
      
      const latency = Date.now() - startTime;
      
      if (backendTest && livekitTest && webrtcTest) {
        return {
          success: true,
          latency,
          details: `All services reachable (${latency}ms)`
        };
      } else {
        return {
          success: false,
          latency,
          details: `Services: Backend(${backendTest}), LiveKit(${livekitTest}), WebRTC(${webrtcTest})`
        };
      }

    } catch (error) {
      console.error('Connectivity test failed:', error);
      return {
        success: false,
        latency: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testBackendConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.API_URL}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 404;
    } catch (error) {
      console.warn('Backend connectivity test failed:', error);
      return false;
    }
  }

  private async testLivekitConnectivity(): Promise<boolean> {
    try {
      const wsUrl = this.LIVEKIT_URL;
      
      return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            try {
              ws.close();
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        };
        
        ws.onopen = () => {
          cleanup();
          resolve(true);
        };

        ws.onerror = () => {
          cleanup();
          resolve(false);
        };

        setTimeout(() => {
          cleanup();
          resolve(false);
        }, 5000);
      });
    } catch (error) {
      console.warn('LiveKit connectivity test failed:', error);
      return false;
    }
  }

  private async testWebRTCConnectivity(): Promise<boolean> {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      return new Promise((resolve) => {
        let resolved = false;
        
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            pc.close();
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            cleanup();
            resolve(true);
          } else if (pc.iceConnectionState === 'failed') {
            cleanup();
            resolve(false);
          }
        };

        pc.createDataChannel('test');
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
        }).catch(() => {
          cleanup();
          resolve(false);
        });

        setTimeout(() => {
          cleanup();
          resolve(pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
        }, 10000);
      });
    } catch (error) {
      console.warn('WebRTC connectivity test failed:', error);
      return false;
    }
  }

  // ============================================================================
  // ===== GETTERS =====
  // ============================================================================

  getConnectionState(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  isConnected(): boolean {
    return this.connectionState$.value === ConnectionState.Connected;
  }

  getQualityLevel(): 'excellent' | 'good' | 'fair' | 'poor' {
    return this.connectionMetrics.qualityLevel;
  }

  // ============================================================================
  // ===== CLEANUP =====
  // ============================================================================

  cleanup(): void {
    this.tokenCache.clear();
    
    this.connectionMetrics = {
      connectionTime: 0,
      lastConnected: new Date(),
      reconnectionAttempts: 0,
      qualityLevel: 'excellent'
    };
    
    this.connectionState$.next(ConnectionState.Disconnected);
    
    console.log('LivestreamService cleaned up');
  }
}