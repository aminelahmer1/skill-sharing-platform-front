import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LivestreamService } from '../../core/services/LiveStream/livestream.service';
import { UserService } from '../../core/services/User/user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Track } from 'livekit-client';
import { LivestreamSession } from '../../models/LivestreamSession/livestream-session';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-livestream',
  templateUrl: './livestream.component.html',
  styleUrls: ['./livestream.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule, 
    MatIconModule, 
    MatButtonModule
  ]
})
export class LivestreamComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('videoContainer', { static: true }) videoContainer!: ElementRef;

  sessionId!: number;
  session?: LivestreamSession;
  isHost = false;
  isRecording = false;
  participants: RemoteParticipant[] = [];
  isConnected = false;
  isLoading = true;
  error?: string;
  showStartButton = true;

  private mediaElements = new Map<string, HTMLMediaElement>();
  private room?: Room;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private livestreamService: LivestreamService,
    private userService: UserService,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.sessionId = Number(this.route.snapshot.paramMap.get('sessionId'));
      if (isNaN(this.sessionId)) {
        throw new Error('Invalid session ID');
      }

      await this.initializeSession();
    } catch (error) {
      this.handleInitializationError(error);
    } finally {
      this.isLoading = false;
    }
  }

ngAfterViewInit(): void {
  if (!this.videoContainer?.nativeElement) {
    const wrapper = document.querySelector('.video-wrapper');
    if (wrapper) {
      const container = document.createElement('div');
      container.className = 'video-container';
      container.style.width = '100%';
      container.style.height = '500px';
      container.style.backgroundColor = '#000';
      wrapper.appendChild(container);
      this.videoContainer = { nativeElement: container };
    } else {
      console.error('Video wrapper not found');
    }
  }
}
private createFallbackVideoContainer(): void {
    const container = document.createElement('div');
    container.className = 'video-container';
    document.querySelector('.video-wrapper')?.appendChild(container);
    this.videoContainer = { nativeElement: container };
  }

  
  private async initializeSession(): Promise<void> {
    const [currentUser, session] = await Promise.all([
      this.userService.getCurrentUserProfile().toPromise(),
      this.livestreamService.getSession(this.sessionId).toPromise()
    ]);

    if (!currentUser || !session) {
      throw new Error('Failed to load user or session data');
    }

    this.session = session;
    this.isHost = currentUser.id === session.producerId;

    if (session.status !== 'LIVE') {
      this.showNotification('Session is not live');
      this.navigateToSkillsPage();
      return;
    }
  }

 async startStreaming(): Promise<void> {
  try {
    // 1. Vérifier que le conteneur vidéo est prêt
    if (!this.videoContainer?.nativeElement) {
      this.createFallbackVideoContainer();
      if (!this.videoContainer?.nativeElement) {
        throw new Error('Video container could not be initialized');
      }
    }

    // 2. Obtenir le token
    const token = this.isHost && this.session?.producerToken 
      ? this.session.producerToken 
      : await this.livestreamService.joinSession(this.sessionId).toPromise();

    if (!token) throw new Error('No token received');

    // 3. Connecter au serveur LiveKit
    this.room = await this.livestreamService.connectToRoom(
      this.session!.roomName, 
      token
    );

    // 4. Configurer les listeners
    this.setupRoomListeners();
    this.isConnected = true;
    this.showStartButton = false;

    // 5. Activer la caméra/micro si hôte
    if (this.isHost) {
      await this.room.localParticipant.enableCameraAndMicrophone();
      this.setupLocalVideo();
    }

    console.log('Successfully connected to LiveKit server');

  } catch (error) {
    console.error('LiveKit connection failed:', error);
    this.error = 'Échec de la connexion au serveur';
    this.showNotification(this.error);
    
    // Réafficher le bouton pour réessayer
    this.showStartButton = true;
  }
}


  private setupVideoContainer(): void {
    if (!this.videoContainer?.nativeElement) {
      console.error('Video container still not available');
      return;
    }
    
    const container = this.videoContainer.nativeElement;
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '500px';
    container.style.backgroundColor = '#000';
    container.style.overflow = 'hidden';
  }

  private setupRoomListeners(): void {
  if (!this.room) return;

  this.room
    .on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('Participant connected:', participant.identity);
      this.participants = [...this.participants, participant];
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('Participant disconnected:', participant.identity);
      this.participants = this.participants.filter(p => p.sid !== participant.sid);
      this.cleanupParticipantElements(participant.sid);
    })
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('Track subscribed from:', participant.identity);
      this.handleTrackSubscribed(track, publication, participant);
    })
    .on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from LiveKit server');
      this.handleDisconnect();
    });
}

  private setupLocalVideo(): void {
    if (!this.room || !this.videoContainer?.nativeElement) return;

    const videoPublications = this.room.localParticipant.videoTrackPublications;
    videoPublications.forEach(publication => {
      if (publication.track) {
        const elementId = `local-${publication.trackSid}`;
        const element = this.createVideoElement(elementId, true);
        publication.track.attach(element);
        this.videoContainer.nativeElement.appendChild(element);
        this.mediaElements.set(elementId, element);
      }
    });
  }

  private handleLocalTrackPublished(publication: any): void {
    if (publication.track && this.videoContainer?.nativeElement) {
      const elementId = `local-${publication.trackSid}`;
      const element = this.createVideoElement(elementId, true);
      publication.track.attach(element);
      this.videoContainer.nativeElement.appendChild(element);
      this.mediaElements.set(elementId, element);
    }
  }

  private handleParticipantConnected(participant: RemoteParticipant): void {
    this.participants = [...this.participants, participant];
  }

  private handleParticipantDisconnected(participant: RemoteParticipant): void {
    this.participants = this.participants.filter(p => p.sid !== participant.sid);
    this.cleanupParticipantElements(participant.sid);
  }

  private handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    try {
      const elementId = `${participant.sid}-${publication.trackSid}`;
      
      if (this.mediaElements.has(elementId)) {
        return;
      }

      const element = track.kind === Track.Kind.Video 
        ? this.createVideoElement(elementId, false)
        : this.createAudioElement(elementId);

      track.attach(element);
      this.videoContainer.nativeElement.appendChild(element);
      this.mediaElements.set(elementId, element);
    } catch (error) {
      console.error('Error handling track subscription:', error);
    }
  }

  private createVideoElement(id: string, isLocal: boolean): HTMLVideoElement {
    const element = document.createElement('video');
    element.id = id;
    element.autoplay = true;
    element.playsInline = true;
    element.muted = isLocal;
    
    if (isLocal) {
      element.style.position = 'absolute';
      element.style.width = '30%';
      element.style.height = '30%';
      element.style.bottom = '20px';
      element.style.right = '20px';
      element.style.zIndex = '2';
      element.style.border = '2px solid white';
      element.style.borderRadius = '8px';
    } else {
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover';
    }
    
    return element;
  }

  private createAudioElement(id: string): HTMLAudioElement {
    const element = document.createElement('audio');
    element.id = id;
    element.autoplay = true;
    element.hidden = true;
    return element;
  }

  private handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const elementId = `${participant.sid}-${publication.trackSid}`;
    this.removeMediaElement(elementId);
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.cleanupAllMediaElements();
    this.showNotification('Disconnected from the session');
  }

  private cleanupParticipantElements(participantSid: string): void {
    Array.from(this.mediaElements.keys())
      .filter(key => key.startsWith(participantSid))
      .forEach(key => this.removeMediaElement(key));
  }

  private removeMediaElement(elementId: string): void {
    const element = this.mediaElements.get(elementId);
    if (element) {
      element.remove();
      this.mediaElements.delete(elementId);
    }
  }

  private cleanupAllMediaElements(): void {
    this.mediaElements.forEach(element => element.remove());
    this.mediaElements.clear();
  }

  async startRecording(): Promise<void> {
    if (!this.isHost || !this.session || !this.room) return;

    try {
      await this.livestreamService.startRecording(this.session.roomName).toPromise();
      this.isRecording = true;
      this.showNotification('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      this.showNotification('Failed to start recording');
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isHost || !this.session || !this.room) return;

    try {
      await this.livestreamService.stopRecording(this.session.roomName).toPromise();
      this.isRecording = false;
      this.showNotification('Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      this.showNotification('Failed to stop recording');
    }
  }

  async endSession(): Promise<void> {
    if (!this.isHost) return;

    try {
      if (this.isRecording) {
        await this.stopRecording();
      }
      
      await this.livestreamService.disconnectFromRoom();
      await this.livestreamService.endSession(this.sessionId).toPromise();
      
      this.showNotification('Session ended successfully');
      this.navigateToSkillsPage();
    } catch (error) {
      console.error('Error ending session:', error);
      this.showNotification('Failed to end session');
    }
  }

  private handleInitializationError(error: any): void {
    console.error('Initialization error:', error);
    this.error = 'Failed to initialize livestream';
    this.showNotification(this.error);
    this.router.navigate(['/']);
  }

  private showNotification(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 5000 });
  }

  private navigateToSkillsPage(): void {
    this.router.navigate([this.isHost ? '/producer/skills' : '/receiver/skills']);
  }

  async ngOnDestroy(): Promise<void> {
    try {
      if (this.isRecording) {
        await this.stopRecording();
      }
      await this.livestreamService.disconnectFromRoom();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}