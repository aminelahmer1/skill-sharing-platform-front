import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LivestreamService } from '../../core/services/LiveStream/livestream.service';
import { UserService } from '../../core/services/User/user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { 
  Room, 
  RoomEvent, 
  RemoteParticipant, 
  RemoteTrack, 
  RemoteTrackPublication, 
  Track,
  LocalTrackPublication,
  TrackPublication,
  LocalVideoTrack
} from 'livekit-client';
import { LivestreamSession } from '../../models/LivestreamSession/livestream-session';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';

interface ParticipantInfo {
  participant: RemoteParticipant;
  isProducer: boolean;
  name: string;
  joinedAt: Date;
}

@Component({
  selector: 'app-livestream',
  templateUrl: './livestream.component.html',
  styleUrls: ['./livestream.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule, 
    MatIconModule, 
    MatButtonModule,
    MatCardModule,
    MatBadgeModule,
    MatTooltipModule
  ]
})
export class LivestreamComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mainVideoContainer') mainVideoContainer!: ElementRef;
  @ViewChild('thumbnailContainer') thumbnailContainer!: ElementRef;
  @ViewChild('pipVideoContainer') pipVideoContainer!: ElementRef;

  sessionId!: number;
  session?: LivestreamSession;
  isHost = false;
  isRecording = false;
  participantInfos: ParticipantInfo[] = [];
  isConnected = false;
  isLoading = true;
  error?: string;
  showStartButton = true;
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  isFullscreen = false;
  
  totalParticipants = 0;
  viewerCount = 0;
  streamDuration = 0;
  streamStartTime?: Date;
  
  private mediaElements = new Map<string, HTMLMediaElement>();
  private room?: Room;
  private currentUserId?: number;
  private screenSharePublication?: LocalTrackPublication | null;
  private streamTimer?: any;
  private mainVideoTrack?: RemoteTrack | LocalVideoTrack;
  private cameraTrack?: LocalVideoTrack;

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
      if (isNaN(this.sessionId)) throw new Error('Invalid session ID');
      
      const [currentUser, session] = await Promise.all([
        this.userService.getCurrentUserProfile().toPromise(),
        this.livestreamService.getSession(this.sessionId).toPromise()
      ]);

      if (!currentUser || !session) throw new Error('Failed to load data');
      
      this.session = session;
      this.currentUserId = currentUser.id;
      this.isHost = currentUser.id === session.producerId;
      
      if (session.status !== 'LIVE') {
        this.showNotification('Session is not live');
        this.navigateToSkillsPage();
      }

      this.setupFullscreenListeners();
      
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isLoading = false;
    }
  }

  ngAfterViewInit(): void {
    this.ensureVideoContainers();
  }

  private setupFullscreenListeners(): void {
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  }

  private ensureVideoContainers(): void {
    if (!this.mainVideoContainer?.nativeElement) {
      const wrapper = document.querySelector('.main-video-wrapper');
      if (wrapper) {
        const container = document.createElement('div');
        container.className = 'main-video';
        wrapper.appendChild(container);
        this.mainVideoContainer = { nativeElement: container };
      }
    }

    if (!this.thumbnailContainer?.nativeElement) {
      const wrapper = document.querySelector('.thumbnails-grid');
      if (wrapper) {
        const container = document.createElement('div');
        container.className = 'thumbnails-grid';
        wrapper.appendChild(container);
        this.thumbnailContainer = { nativeElement: container };
      }
    }

    if (!this.pipVideoContainer?.nativeElement) {
      const wrapper = document.querySelector('.pip-container');
      if (wrapper) {
        const container = document.createElement('div');
        container.className = 'pip-video';
        wrapper.appendChild(container);
        this.pipVideoContainer = { nativeElement: container };
      }
    }
  }

  async startStreaming(): Promise<void> {
    try {
      this.ensureVideoContainers();
      
      const token = await firstValueFrom(
        this.livestreamService.joinSession(this.sessionId)
      );

      if (!token) throw new Error('No token received');

      this.room = await this.livestreamService.connectToRoom(
        this.session!.roomName, 
        token
      );

      this.setupRoomListeners();
      await this.setupMedia();
      
      this.isConnected = true;
      this.showStartButton = false;
      this.streamStartTime = new Date();
      this.startStreamTimer();
      
      this.showNotification('Stream started successfully');
      
    } catch (error) {
      console.error('Connection failed:', error);
      this.error = 'Connection failed - please check your network and permissions';
      this.showNotification(this.error);
      this.showStartButton = true;
    }
  }

  private setupRoomListeners(): void {
    if (!this.room) return;

    this.room
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        this.handleTrackSubscribed(track, publication, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        this.handleTrackUnsubscribed(track, publication, participant);
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.handleParticipantConnected(participant);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        this.handleParticipantDisconnected(participant);
      })
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        this.handleLocalTrackPublished(publication);
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        this.handleLocalTrackUnpublished(publication);
      })
      .on(RoomEvent.Disconnected, () => {
        this.handleDisconnect();
      })
      .on(RoomEvent.Reconnecting, () => {
        this.showNotification('Reconnecting...');
      })
      .on(RoomEvent.Reconnected, () => {
        this.showNotification('Reconnected');
      });
  }

  private async setupMedia(): Promise<void> {
    if (!this.room) return;

    try {
      if (this.isHost) {
        // Enable camera and microphone for host
        await this.room.localParticipant.enableCameraAndMicrophone();
        console.log('Host media setup completed');
      } else {
        // Try to enable camera for viewers (optional)
        try {
          await this.room.localParticipant.enableCameraAndMicrophone();
          console.log('Viewer media setup completed');
        } catch (err) {
          console.log('Viewer media access denied, continuing as viewer only');
        }
      }
    } catch (err) {
      console.error('Media access error:', err);
      this.showNotification('Media access denied');
    }
  }

private handleLocalTrackPublished(publication: LocalTrackPublication): void {
    if (!publication.track || publication.kind !== Track.Kind.Video) return;

    if (publication.source === Track.Source.ScreenShare) {
        // Gestion du partage d'écran
        const elementId = `local-screen-${publication.trackSid}`;
        const element = this.createMainVideoElement(elementId, true);
        publication.track.attach(element);
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mediaElements.set(elementId, element);
        this.mainVideoTrack = publication.track as LocalVideoTrack;
        
        console.log('Screen share track published');
        
    } else if (publication.source === Track.Source.Camera) {
        // Gestion de la caméra
        this.cameraTrack = publication.track as LocalVideoTrack;
        console.log('Camera track published, isScreenSharing:', this.isScreenSharing);
        
        // Créer l'élément selon le contexte
        if (this.isScreenSharing) {
            // Si on partage l'écran, mettre la caméra en PiP
            setTimeout(() => this.recreateCameraInPiP(), 100);
        } else {
            // Sinon, mettre la caméra en vue principale
            setTimeout(() => this.recreateCameraInMain(), 100);
        }
    }
}


private moveOwnCameraToPiP(): void {
    if (!this.cameraTrack) {
        console.log('No camera track available for PiP');
        return;
    }
    
    // S'assurer que le conteneur PiP existe
    if (!this.pipVideoContainer?.nativeElement) {
        this.ensureVideoContainers();
        if (!this.pipVideoContainer?.nativeElement) {
            console.error('PiP container not available, cannot move camera to PiP');
            return;
        }
    }
    
    // Chercher l'élément vidéo de la caméra locale
    const cameraElement = Array.from(this.mediaElements.entries())
        .find(([id, element]) => {
            return id.startsWith('local-') && 
                   element.tagName === 'VIDEO' && 
                   !id.includes('screen') &&
                   element.srcObject !== null;
        });
    
    if (cameraElement) {
        const [elementId, element] = cameraElement;
        
        // Si l'élément est déjà dans le PiP, ne rien faire
        if (element.parentNode === this.pipVideoContainer.nativeElement) {
            return;
        }
        
        // Retirer de son conteneur actuel
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
        
        // Appliquer le style PiP
        Object.assign(element.style, {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '10px'
        });
        
        // S'assurer que la vidéo locale est muted dans le PiP
        (element as HTMLVideoElement).muted = true;
        
        // Ajouter au conteneur PiP
        try {
            this.clearPipVideo();
            this.pipVideoContainer.nativeElement.appendChild(element);
        } catch (error) {
            console.error('Error moving camera to PiP:', error);
        }
        
    } else {
        // Créer un nouvel élément si nécessaire
        const elementId = `local-camera-pip-${Date.now()}`;
        const element = this.createPiPElement(elementId, true);
        
        try {
            this.cameraTrack.attach(element);
            this.clearPipVideo();
            this.pipVideoContainer.nativeElement.appendChild(element);
            this.mediaElements.set(elementId, element);
        } catch (error) {
            console.error('Error creating new PiP element:', error);
        }
    }
}

  private handleLocalTrackUnpublished(publication: LocalTrackPublication): void {
    if (publication.source === Track.Source.ScreenShare) {
        // Nettoyer les éléments de partage d'écran
        const screenElementIds = Array.from(this.mediaElements.keys())
            .filter(id => id.includes('screen'));
        
        screenElementIds.forEach(id => this.removeMediaElement(id));
        
        this.isScreenSharing = false;
        console.log('Screen share track unpublished');
        
        // NE PAS nettoyer la caméra ici, laisser toggleScreenShare s'en occuper
        
    } else if (publication.source === Track.Source.Camera) {
        // Seulement nettoyer si ce n'est pas lié à un arrêt de partage d'écran
        if (!this.isScreenSharing) {
            this.cleanupCameraElements();
            this.cameraTrack = undefined;
            console.log('Camera track unpublished');
        }
    }
}
private refreshCameraTrack(): void {
    if (!this.room) return;
    
    console.log('Refreshing camera track...');
    
    // Chercher le track de caméra dans les publications locales
    const localVideoTracks = this.room.localParticipant.videoTrackPublications;
    let foundCameraTrack = false;
    
    localVideoTracks.forEach(publication => {
        if (publication.source === Track.Source.Camera && publication.track) {
            this.cameraTrack = publication.track as LocalVideoTrack;
            foundCameraTrack = true;
            console.log('Camera track found and refreshed');
        }
    });
    
    if (!foundCameraTrack) {
        console.log('No camera track found, will attempt reactivation');
        this.cameraTrack = undefined;
    }
}
private async forceCameraReactivation(): Promise<void> {
    if (!this.room) return;
    
    try {
        console.log('Forcing camera reactivation...');
        
        // Désactiver puis réactiver la caméra pour forcer un nouveau track
        await this.room.localParticipant.setCameraEnabled(false);
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.room.localParticipant.setCameraEnabled(true);
        
        // Attendre que le nouveau track soit publié
        setTimeout(() => {
            this.refreshCameraTrack();
            if (this.cameraTrack) {
                this.recreateCameraInMain();
                console.log('Camera successfully reactivated');
            } else {
                console.error('Failed to reactivate camera');
                this.showNotification('Failed to reactivate camera - please try manually');
            }
        }, 800);
        
    } catch (error) {
        console.error('Error forcing camera reactivation:', error);
        this.showNotification('Camera reactivation failed');
    }
}
  

  private handleParticipantConnected(participant: RemoteParticipant): void {
    const participantInfo: ParticipantInfo = {
      participant,
      isProducer: participant.identity === this.session?.producerId.toString(),
      name: participant.identity,
      joinedAt: new Date()
    };
    
    this.participantInfos.push(participantInfo);
    this.updateParticipantCounts();
    
    participant.videoTrackPublications.forEach(publication => {
      if (publication.track) {
        this.handleTrackSubscribed(publication.track, publication, participant);
      }
    });
  }

  private handleParticipantDisconnected(participant: RemoteParticipant): void {
    this.participantInfos = this.participantInfos.filter(
      info => info.participant.sid !== participant.sid
    );
    this.updateParticipantCounts();
    this.cleanupParticipantElements(participant.sid);
  }

  private handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const elementId = `${participant.sid}-${publication.trackSid}`;
    
    if (this.mediaElements.has(elementId)) return;

    const participantInfo = this.participantInfos.find(
      info => info.participant.sid === participant.sid
    );

    if (track.kind === Track.Kind.Video) {
      let element: HTMLVideoElement;
      
      if (track.source === Track.Source.ScreenShare) {
        // Screen share always goes to main view
        element = this.createMainVideoElement(elementId, false);
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mainVideoTrack = track;
      } else if (participantInfo?.isProducer && !this.mainVideoTrack) {
        // Producer's camera goes to main view if no screen share
        element = this.createMainVideoElement(elementId, false);
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mainVideoTrack = track;
      } else {
        // All other videos go to thumbnails
        element = this.createThumbnailElement(
          elementId, 
          false, 
          participantInfo?.isProducer || false
        );
        this.thumbnailContainer.nativeElement.appendChild(element);
      }
      
      track.attach(element);
      this.mediaElements.set(elementId, element);
      
    } else if (track.kind === Track.Kind.Audio) {
      const element = this.createAudioElement(elementId);
      track.attach(element);
      document.body.appendChild(element);
      this.mediaElements.set(elementId, element);
    }
  }

  private handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const elementId = `${participant.sid}-${publication.trackSid}`;
    this.removeMediaElement(elementId);
    
    if (track === this.mainVideoTrack) {
      this.mainVideoTrack = undefined;
      this.findNewMainVideo();
    }
  }

  private createMainVideoElement(id: string, isLocal: boolean): HTMLVideoElement {
    const element = document.createElement('video');
    element.id = id;
    element.autoplay = true;
    element.playsInline = true;
    element.muted = isLocal;
    
    Object.assign(element.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      backgroundColor: '#000'
    });
    
    return element;
  }

  private createPiPElement(id: string, isLocal: boolean): HTMLVideoElement {
    const element = document.createElement('video');
    element.id = id;
    element.autoplay = true;
    element.playsInline = true;
    element.muted = isLocal;
    
    Object.assign(element.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      backgroundColor: '#000',
      borderRadius: '10px'
    });
    
    return element;
  }

  private createThumbnailElement(id: string, isLocal: boolean, isProducer: boolean): HTMLVideoElement {
    const element = document.createElement('video');
    element.id = id;
    element.autoplay = true;
    element.playsInline = true;
    element.muted = isLocal;
    
    Object.assign(element.style, {
      width: '120px',
      height: '90px',
      objectFit: 'cover',
      backgroundColor: '#000',
      border: isProducer ? '3px solid #4CAF50' : '2px solid #ccc',
      borderRadius: '8px',
      margin: '5px',
      cursor: 'pointer'
    });
    
    element.addEventListener('click', () => {
      this.switchToMainVideo(id, element);
    });
    
    return element;
  }

  private createAudioElement(id: string): HTMLAudioElement {
    const element = document.createElement('audio');
    element.id = id;
    element.autoplay = true;
    element.hidden = true;
    return element;
  }

  private clearMainVideo(): void {
    while (this.mainVideoContainer.nativeElement.firstChild) {
      this.mainVideoContainer.nativeElement.removeChild(
        this.mainVideoContainer.nativeElement.firstChild
      );
    }
  }

  
private clearPipVideo(): void {
    if (!this.pipVideoContainer?.nativeElement) {
        console.warn('PiP video container not available, ensuring containers...');
        this.ensureVideoContainers();
        if (!this.pipVideoContainer?.nativeElement) {
            console.error('Failed to create PiP container');
            return;
        }
    }
    
    while (this.pipVideoContainer.nativeElement.firstChild) {
        this.pipVideoContainer.nativeElement.removeChild(
            this.pipVideoContainer.nativeElement.firstChild
        );
    }
}

  private switchToMainVideo(elementId: string, element: HTMLVideoElement): void {
    if (this.mainVideoTrack) {
      const currentMainElement = this.mainVideoContainer.nativeElement.querySelector('video');
      if (currentMainElement) {
        this.moveToThumbnails(currentMainElement);
      }
    }
    
    this.moveToMainVideo(elementId, element);
  }

  private moveToMainVideo(elementId: string, element: HTMLVideoElement): void {
    if (element.parentNode === this.thumbnailContainer.nativeElement) {
      this.thumbnailContainer.nativeElement.removeChild(element);
    }
    
    Object.assign(element.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      margin: '0',
      cursor: 'default'
    });
    
    this.clearMainVideo();
    this.mainVideoContainer.nativeElement.appendChild(element);
  }

  private moveToThumbnails(element: HTMLVideoElement): void {
    if (element.parentNode === this.mainVideoContainer.nativeElement) {
      this.mainVideoContainer.nativeElement.removeChild(element);
    }
    
    Object.assign(element.style, {
      width: '120px',
      height: '90px',
      objectFit: 'cover',
      margin: '5px',
      cursor: 'pointer'
    });
    
    this.thumbnailContainer.nativeElement.appendChild(element);
  }

  private findNewMainVideo(): void {
    const thumbnailVideo = this.thumbnailContainer.nativeElement.querySelector('video');
    if (thumbnailVideo) {
      const elementId = thumbnailVideo.id;
      this.moveToMainVideo(elementId, thumbnailVideo);
    }
  }

  private updateParticipantCounts(): void {
    this.totalParticipants = this.participantInfos.length;
    this.viewerCount = this.participantInfos.filter(info => !info.isProducer).length;
  }

  private startStreamTimer(): void {
    this.streamTimer = setInterval(() => {
      if (this.streamStartTime) {
        this.streamDuration = Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000);
      }
    }, 1000);
  }

  private stopStreamTimer(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = undefined;
    }
  }

  get formattedDuration(): string {
    const hours = Math.floor(this.streamDuration / 3600);
    const minutes = Math.floor((this.streamDuration % 3600) / 60);
    const seconds = this.streamDuration % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

async toggleScreenShare(): Promise<void> {
    if (!this.room || !this.isHost) return;

    try {
        if (this.isScreenSharing) {
            // Arrêter le partage d'écran
            await this.livestreamService.stopScreenShare(this.room);
            this.isScreenSharing = false;
            this.showNotification('Screen sharing stopped');
            
            // Nettoyer le PiP
            this.clearPipVideo();
            
            // S'assurer que la webcam est activée
            if (this.isVideoOff) {
                await this.room.localParticipant.setCameraEnabled(true);
                this.isVideoOff = false;
            }
            
            // Attendre que les tracks soient correctement gérés
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Récupérer le track de caméra et le remettre en vue principale
            this.refreshCameraTrack();
            setTimeout(() => {
                if (this.cameraTrack) {
                    this.recreateCameraInMain();
                } else {
                    // Si pas de track, forcer la réactivation de la caméra
                    this.forceCameraReactivation();
                }
            }, 200);
            
        } else {
            // Démarrer le partage d'écran
            this.screenSharePublication = await this.livestreamService.startScreenShare(this.room);
            this.isScreenSharing = true;
            this.showNotification('Screen sharing started');
            
            // Attendre que le partage d'écran soit publié
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Déplacer la webcam vers le PiP
            if (this.cameraTrack) {
                this.recreateCameraInPiP();
            }
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
        this.showNotification('Failed to toggle screen share');
    }
}

private recreateCameraInPiP(): void {
    if (!this.cameraTrack) return;

    // Nettoyer tous les éléments de caméra existants
    this.cleanupCameraElements();
    
    // Créer un nouvel élément pour le PiP
    const elementId = `local-camera-pip-${Date.now()}`;
    const element = this.createPiPElement(elementId, true);
    
    try {
        // Détacher le track de tous les éléments existants puis l'attacher au nouveau
        this.cameraTrack.detach();
        this.cameraTrack.attach(element);
        
        // Placer dans le PiP
        this.clearPipVideo();
        this.pipVideoContainer.nativeElement.appendChild(element);
        this.mediaElements.set(elementId, element);
        
        console.log('Camera recreated in PiP');
    } catch (error) {
        console.error('Error recreating camera in PiP:', error);
    }
}
private cleanupCameraElements(): void {
    // Trouver et supprimer tous les éléments de caméra locale
    const cameraElementIds = Array.from(this.mediaElements.keys())
        .filter(id => id.startsWith('local-camera') || 
                     (id.startsWith('local-') && !id.includes('screen')));
    
    cameraElementIds.forEach(id => {
        const element = this.mediaElements.get(id);
        if (element) {
            // Détacher le track avant de supprimer l'élément
            if (this.cameraTrack) {
                try {
                    this.cameraTrack.detach(element);
                } catch (e) {
                    console.log('Track already detached');
                }
            }
            element.remove();
            this.mediaElements.delete(id);
        }
    });
}
private recreateCameraInMain(): void {
    if (!this.cameraTrack) return;

    // Nettoyer tous les éléments de caméra existants
    this.cleanupCameraElements();
    
    // Créer un nouvel élément pour la vue principale
    const elementId = `local-camera-main-${Date.now()}`;
    const element = this.createMainVideoElement(elementId, true);
    
    try {
        // Détacher le track de tous les éléments existants puis l'attacher au nouveau
        this.cameraTrack.detach();
        this.cameraTrack.attach(element);
        
        // Placer dans la vue principale
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mediaElements.set(elementId, element);
        this.mainVideoTrack = this.cameraTrack;
        
        console.log('Camera recreated in main view');
    } catch (error) {
        console.error('Error recreating camera in main:', error);
    }
}
  async toggleMute(): Promise<void> {
    if (!this.room) return;
    this.isMuted = !this.isMuted;
    await this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);
    this.showNotification(this.isMuted ? 'Microphone muted' : 'Microphone unmuted');
  }

 async toggleVideo(): Promise<void> {
    if (!this.room) return;
    
    this.isVideoOff = !this.isVideoOff;
    
    if (this.isVideoOff) {
        // Désactiver la caméra
        this.cleanupCameraElements();
        await this.room.localParticipant.setCameraEnabled(false);
        this.cameraTrack = undefined;
        this.showNotification('Camera off');
    } else {
        // Activer la caméra
        await this.room.localParticipant.setCameraEnabled(true);
        this.showNotification('Camera on');
        
        // Attendre que le track soit publié puis le placer correctement
        setTimeout(() => {
            if (this.cameraTrack) {
                if (this.isScreenSharing) {
                    this.recreateCameraInPiP();
                } else {
                    this.recreateCameraInMain();
                }
            }
        }, 500);
    }
}


  async toggleFullscreen(): Promise<void> {
    if (!this.isConnected) return;

    try {
      if (this.isFullscreen) {
        await document.exitFullscreen();
      } else {
        const element = this.mainVideoContainer.nativeElement;
        if (element) {
          await element.requestFullscreen();
        }
      }
      this.isFullscreen = !this.isFullscreen;
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      this.showNotification('Failed to toggle fullscreen');
    }
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
    // Détacher tous les tracks avant de supprimer les éléments
    this.mediaElements.forEach((element, id) => {
        if (this.cameraTrack && id.includes('camera')) {
            try {
                this.cameraTrack.detach(element);
            } catch (e) {
                console.log('Track already detached');
            }
        }
        element.remove();
    });
    
    this.mediaElements.clear();
    this.mainVideoTrack = undefined;
    this.cameraTrack = undefined;
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
      if (this.room) {
        await this.livestreamService.disconnectFromRoom(this.room);
      }
      await this.livestreamService.endSession(this.sessionId).toPromise();
      this.stopStreamTimer();
      this.navigateToSkillsPage();
    } catch (error) {
      console.error('Error ending session:', error);
      this.showNotification('Failed to end session');
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.cleanupAllMediaElements();
    this.stopStreamTimer();
    this.showNotification('Disconnected from session');
  }

  private showNotification(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000 });
  }

  public navigateToSkillsPage(): void {
    this.router.navigate([this.isHost ? '/producer/skills' : '/receiver/skills']);
  }

  private handleError(error: any): void {
    console.error('Error:', error);
    this.error = 'Initialization failed';
    this.showNotification(this.error);
  }

  async ngOnDestroy(): Promise<void> {
    if (this.room) {
      await this.livestreamService.disconnectFromRoom(this.room);
    }
    this.cleanupAllMediaElements();
    this.stopStreamTimer();
    document.removeEventListener('fullscreenchange', () => {});
  }
}