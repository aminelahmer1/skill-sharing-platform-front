import { ActivatedRoute, Router } from '@angular/router';
import { LivestreamService } from '../../core/services/LiveStream/livestream.service';
import { ChatService, ChatMessage, TypingIndicator } from '../../core/services/Chat/chat.service';
import { RecordingService, RecordingStatus } from '../../core/services/Recording/recording.service';
import { UserService } from '../../core/services/User/user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RatingDialogComponent } from '../RatingDialog/rating-dialog/rating-dialog.component';
import { ExchangeService } from '../../core/services/Exchange/exchange.service';
import { EndSessionDialogComponent } from '../receiver/EndSessionDialog/end-session-dialog/end-session-dialog.component';

import { 
  Room, 
  RoomEvent, 
  RemoteParticipant, 
  RemoteTrack, 
  RemoteTrackPublication, 
  Track,
  LocalTrackPublication,
  TrackPublication,
  LocalVideoTrack,
  ConnectionState,
  ConnectionQuality,
  Participant
} from 'livekit-client';
import { LivestreamSession } from '../../models/LivestreamSession/livestream-session';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subject, takeUntil, debounceTime, distinctUntilChanged, interval, take } from 'rxjs';
import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog } from '@angular/material/dialog';
interface TopThumbnailInfo {
  id: string;
  element: HTMLVideoElement;
  wrapper: HTMLElement;
  participantInfo: ParticipantInfo;
  track?: RemoteTrack | LocalVideoTrack;
  isMainContent?: boolean;
}
interface ReceiverThumbnailInfo {
  id: string;
  element: HTMLVideoElement;
  wrapper: HTMLElement;
  participantInfo: ParticipantInfo;
  track?: RemoteTrack | LocalVideoTrack;
  isActive: boolean; 
}
interface ParticipantInfo {
  participant: RemoteParticipant | any; 
  isProducer: boolean;
  name: string;
  displayName: string;
  joinedAt: Date;
  userId?: number;
  isLocal?: boolean;
}

interface MediaElementInfo {
  element: HTMLMediaElement;
  trackId: string;
  participantId?: string;
  isLocal: boolean;
  source?: Track.Source;
}

// Interface pour les publications LiveKit
interface LiveKitPublication {
  track?: any;
  trackSid: string;
  source?: Track.Source;
}

@Component({
  selector: 'app-livestream',
  templateUrl: './livestream.component.html',
  styleUrls: ['./livestream.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressSpinnerModule, 
    MatIconModule, 
    MatButtonModule,
    MatCardModule,
    MatBadgeModule,
    MatTooltipModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,      
    MatExpansionModule 
  ]
})
export class LivestreamComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mainVideoContainer') mainVideoContainer!: ElementRef;
  @ViewChild('topThumbnailContainer') topThumbnailContainer!: ElementRef;  @ViewChild('pipVideoContainer') pipVideoContainer!: ElementRef;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  private exchangeId?: number;
public  skillName?: string;
private producerName?: string;
private sessionEndedByProducer = false;

  // =====  SYSTÈMES DE MINIATURES =====
private topThumbnails = new Map<string, TopThumbnailInfo>();
     receiverThumbnails = new Map<string, ReceiverThumbnailInfo>();

    showReceiverThumbnails = true;
  hasNewParticipant = false;
  newParticipantName = '';

  // ===== PROPRIÉTÉS PRINCIPALES =====
  sessionId!: number;
  session?: LivestreamSession;
  isHost = false;
  participantInfos: ParticipantInfo[] = [];
  isConnected = false;
  isLoading = true;
  error?: string;
  showStartButton = true;
  
  // ===== ENVIRONMENT CONFIGURATION =====
  private readonly isDevelopment = !window.location.hostname.includes('production');
   currentMainVideoSource: 'producer-camera' | 'producer-screen' | 'none' = 'none';
  private producerMainVideoTrackId?: string;
  private receiverTracksBlacklist = new Set<string>(); // Tracks à ne jamais afficher en mainVideo
  
  // ===== ÉTATS MÉDIA =====
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  isFullscreen = false;
  
  // ===== CHAT =====
  chatMessages: ChatMessage[] = [];
  newChatMessage = '';
  isChatConnected = false;
  isChatLoading = true;
  typingIndicators: TypingIndicator[] = [];
  showChat = true;
  unreadChatCount = 0;
  chatConnectionStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING' = 'DISCONNECTED';
  
  // ===== RECORDING =====
  recordingStatus: RecordingStatus = { isRecording: false };
  isRecordingProcessing = false;
  
  // ===== STATISTIQUES  =====
  totalParticipants = 0; // Compte seulement les spectateurs
  viewerCount = 0;
  streamDuration = 0;
  streamStartTime?: Date;
  
  // ===== RÉFÉRENCES PRIVÉES =====
   mediaElements = new Map<string, MediaElementInfo>();
  private room?: Room;
  private currentUserId?: number;
  private currentUsername?: string;
  private screenSharePublication?: LocalTrackPublication | null;
  private streamTimer?: any;
  private mainVideoTrack?: RemoteTrack | LocalVideoTrack;
  private cameraTrack?: LocalVideoTrack;
  private destroy$ = new Subject<void>();
  private reconnectionAttempts = 0;
  private readonly MAX_RECONNECTION_ATTEMPTS = 3;
  
  // ===== CHAT TYPING =====
  private typingSubject = new Subject<void>();
  private isTyping = false;
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;
  private chatReconnectAttempts = 0;
  private readonly MAX_CHAT_RECONNECT_ATTEMPTS = 5;
  private chatReconnectTimer?: any;
  private lastFocusState = true;
  
hasProducerThumbnail(): boolean {
  const producerParticipant = this.findRemoteProducerParticipant();
  if (!producerParticipant) return false;
  
  // Vérifier si le producteur a une caméra ET un partage d'écran actifs
  const hasScreenShare = this.findProducerRemoteScreenShare(producerParticipant);
  const hasCamera = this.findProducerRemoteCamera(producerParticipant);
  
  // On affiche la miniature seulement si les deux sont actifs
  return !!(hasScreenShare && hasCamera);
}

private createOrUpdateReceiverThumbnail(participantInfo: ParticipantInfo, track?: RemoteTrack | LocalVideoTrack): void {
 const thumbnailId = this.generateReceiverThumbnailId(participantInfo);
 
 console.log(`📹 Create/Update receiver thumbnail: ${thumbnailId}, hasTrack: ${!!track}`);
 
 const existingThumbnail = this.receiverThumbnails.get(thumbnailId);
 
 if (existingThumbnail) {
   this.updateExistingReceiverThumbnail(existingThumbnail, track);
 } else {
   // Toujours créer dans la section du haut
   this.createNewReceiverThumbnailInTop(participantInfo, track);
 }
}

private createNewReceiverThumbnailInTop(participantInfo: ParticipantInfo, track?: RemoteTrack | LocalVideoTrack): void {
 const thumbnailId = this.generateReceiverThumbnailId(participantInfo);
 
 console.log(`📹 Creating receiver thumbnail in top section: ${thumbnailId}`);

 // Créer l'élément vidéo
 const videoElement = this.createSimpleThumbnailElement(thumbnailId, participantInfo);
 
 // Créer le wrapper
 const wrapper = this.createSimpleThumbnailWrapper(videoElement, participantInfo);
 
 const isActive = !!track;
 
 if (isActive && track) {
   try {
     track.attach(videoElement);
     this.showActiveCameraState(wrapper);
   } catch (error) {
     console.error(`❌ Error attaching track to ${thumbnailId}:`, error);
     this.showCameraOffState(wrapper);
   }
 } else {
   // Afficher l'état caméra fermée
   this.showCameraOffState(wrapper);
 }

 // Ajouter au conteneur du haut dans la section receivers
 this.addReceiverToTopSection(wrapper);

 // Créer l'objet info et enregistrer
 const thumbnailInfo: ReceiverThumbnailInfo = {
   id: thumbnailId,
   element: videoElement,
   wrapper: wrapper,
   participantInfo: participantInfo,
   track: track,
   isActive: isActive
 };

 this.receiverThumbnails.set(thumbnailId, thumbnailInfo);
 
 this.mediaElements.set(thumbnailId, {
   element: videoElement,
   trackId: track?.sid || 'receiver-camera-off',
   participantId: participantInfo.isLocal ? 'local' : participantInfo.participant.sid,
   isLocal: participantInfo.isLocal || false,
   source: Track.Source.Camera
 });

 console.log(`✅ Receiver thumbnail created in top section: ${thumbnailId}`);
}
private createSimpleThumbnailElement(id: string, participantInfo: ParticipantInfo): HTMLVideoElement {
  const element = document.createElement('video');
  element.id = id;
  element.autoplay = true;
  element.playsInline = true;
  element.muted = true;
  
  // Style uniforme avec les autres miniatures du haut
  Object.assign(element.style, {
    width: '160px', // Augmenté de 120px à 160px
    height: '120px', // Augmenté de 90px à 120px
    objectFit: 'cover',
    backgroundColor: '#000',
    borderRadius: '8px',
    cursor: participantInfo.isProducer ? 'pointer' : 'default',
    border: participantInfo.isProducer ? '2px solid #4CAF50' : '2px solid #2196F3',
    transition: 'border-color 0.2s ease'
  });
  
  return element;
}

//  Méthode simplifiée pour créer le wrapper
private createSimpleThumbnailWrapper(videoElement: HTMLVideoElement, participantInfo: ParticipantInfo): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = participantInfo.isProducer ? 'producer-thumbnail' : 'receiver-thumbnail';
  wrapper.id = `wrapper-${videoElement.id}`;
  
  Object.assign(wrapper.style, {
    position: 'relative',
    display: 'inline-block',
    margin: '0 4px'
  });

  wrapper.appendChild(videoElement);

  // Créer le label avec le nom correct
  const label = document.createElement('div');
  label.className = 'thumbnail-label';
  
  // IMPORTANT: Utiliser displayName au lieu de l'ID
  let displayText = '';
  if (participantInfo.isLocal) {
    displayText = 'Vous';
  } else if (participantInfo.isProducer) {
    displayText = 'Producteur';
  } else {
    // Utiliser le displayName qui a été chargé depuis la DB
    displayText = participantInfo.displayName || participantInfo.name || 'Participant';
  }
  
  label.textContent = displayText;
  
  Object.assign(label.style, {
    position: 'absolute',
    bottom: '2px',
    left: '2px',
    right: '2px',
    background: participantInfo.isProducer ? 'rgba(76, 175, 80, 0.9)' : 'rgba(33, 150, 243, 0.9)',
    color: 'white',
    fontSize: '9px',
    textAlign: 'center',
    padding: '1px 3px',
    borderRadius: '0 0 6px 6px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  });

  wrapper.appendChild(label);

  return wrapper;
}

//  Méthode pour ajouter dans la section receivers du haut
private addReceiverToTopSection(wrapper: HTMLElement): void {
  // Chercher ou créer le groupe receivers dans le conteneur du haut
  let receiversGroup = document.querySelector('#receivers-thumbnail-wrapper');
  
  if (!receiversGroup) {
    // Si le groupe n'existe pas encore, le créer dans le conteneur principal
    const container = this.topThumbnailContainer?.nativeElement;
    if (container) {
      receiversGroup = document.createElement('div');
      receiversGroup.id = 'receivers-thumbnail-wrapper';
      receiversGroup.className = 'receivers-thumbnails-group';
      
      const label = document.createElement('div');
      label.className = 'thumbnail-group-label';
      label.textContent = 'Spectateurs';
      label.style.cssText = 'font-size: 11px; color: #666; margin: 0 8px;';
      
      receiversGroup.appendChild(label);
      container.appendChild(receiversGroup);
    }
  }
  
  if (receiversGroup) {
    receiversGroup.appendChild(wrapper);
  }
}

// 7. Méthode pour afficher l'état caméra fermée
private showCameraOffState(wrapper: HTMLElement): void {
 const videoElement = wrapper.querySelector('video');
 if (videoElement) {
   videoElement.style.opacity = '0.5';
   
   // Ajouter un overlay simple
   let overlay = wrapper.querySelector('.camera-off-indicator') as HTMLElement;
   if (!overlay) {
     overlay = document.createElement('div');
     overlay.className = 'camera-off-indicator';
     overlay.innerHTML = '📷';
     overlay.style.cssText = `
       position: absolute;
       top: 50%;
       left: 50%;
       transform: translate(-50%, -50%);
       font-size: 20px;
       opacity: 0.8;
       pointer-events: none;
     `;
     wrapper.appendChild(overlay);
   }
 }
}

private showActiveCameraState(wrapper: HTMLElement): void {
 const videoElement = wrapper.querySelector('video');
 if (videoElement) {
   videoElement.style.opacity = '1';
 }
 
 // Retirer l'overlay caméra fermée s'il existe
 const overlay = wrapper.querySelector('.camera-off-indicator');
 if (overlay) {
   overlay.remove();
 }
}
private getThumbnailDisplayName(participantInfo: ParticipantInfo): string {
  if (participantInfo.isLocal) {
    return 'Vous';
  } else if (participantInfo.isProducer) {
    return 'Producteur';
  } else {
    return participantInfo.displayName || participantInfo.name || 'Participant';
  }
}

// 9. Modifier createProducerCameraThumbnailDuringScreenShare pour utiliser la section du haut
private createProducerCameraThumbnailDuringScreenShare(producerParticipant: RemoteParticipant): void {
  const cameraTrack = this.findTrackBySource(producerParticipant, Track.Source.Camera);
  
  if (!cameraTrack) {
    console.log('📹 No producer camera track found for thumbnail');
    return;
  }

  const existingThumbnailId = `producer-camera-thumbnail-${producerParticipant.sid}`;
  
  // IMPORTANT: Vérifier dans le DOM aussi, pas seulement dans mediaElements
  const existingElement = document.getElementById(existingThumbnailId);
  if (existingElement) {
    console.log('📹 Producer camera thumbnail already exists in DOM, removing old one');
    if (existingElement.parentElement) {
      existingElement.parentElement.remove();
    }
    this.mediaElements.delete(existingThumbnailId);
  }

  console.log('📹 Creating producer camera thumbnail in top section');
  
  // Créer l'élément vidéo
  const element = this.createSimpleThumbnailElement(existingThumbnailId, {
    participant: producerParticipant,
    isProducer: true,
    name: producerParticipant.identity,
    displayName: 'Producteur',
    joinedAt: new Date(),
    isLocal: false
  } as ParticipantInfo);
  
  // Attacher la track
  try {
    cameraTrack.track.attach(element);
  } catch (error) {
    console.error('❌ Error attaching camera track:', error);
    return;
  }
  
  // Créer le wrapper
  const wrapper = this.createSimpleThumbnailWrapper(element, {
    participant: producerParticipant,
    isProducer: true,
    name: producerParticipant.identity,
    displayName: 'Producteur',
    joinedAt: new Date(),
    isLocal: false
  } as ParticipantInfo);
  
  // Ajouter dans la section producer du haut
  this.addProducerToTopSection(wrapper);
  
  // Enregistrer
  this.mediaElements.set(existingThumbnailId, {
    element,
    trackId: cameraTrack.trackSid,
    participantId: producerParticipant.sid,
    isLocal: false,
    source: Track.Source.Camera
  });
  
  console.log('✅ Producer camera thumbnail created in top section');
}


// 10. Méthode pour ajouter le producer dans la section du haut
private addProducerToTopSection(wrapper: HTMLElement): void {
  let producerGroup = document.querySelector('#producer-thumbnail-wrapper');
  
  if (!producerGroup) {
    const container = this.topThumbnailContainer?.nativeElement;
    if (container) {
      producerGroup = document.createElement('div');
      producerGroup.id = 'producer-thumbnail-wrapper';
      producerGroup.className = 'producer-thumbnails-group';
      
      const label = document.createElement('div');
      label.className = 'thumbnail-group-label';
      label.textContent = 'Producteur';
      label.style.cssText = 'font-size: 11px; color: #4CAF50; font-weight: 600; margin: 0 8px;';
      
      producerGroup.appendChild(label);
      
      // Ajouter en premier dans le conteneur
      container.insertBefore(producerGroup, container.firstChild);
    }
  }
  
  if (producerGroup) {
    // Nettoyer les anciennes miniatures avant d'ajouter la nouvelle
    const oldThumbnails = producerGroup.querySelectorAll('.producer-thumbnail');
    oldThumbnails.forEach(old => old.remove());
    
    // Ajouter la nouvelle miniature
    producerGroup.appendChild(wrapper);
    console.log('✅ Producer thumbnail added to top section');
  }
}

// 11. Nettoyer les anciens conteneurs flottants (appelé dans ngOnInit)
private cleanupFloatingContainers(): void {
  // Supprimer l'ancien conteneur flottant des receivers
  const floatingReceivers = document.getElementById('receiver-thumbnails-container');
  if (floatingReceivers) {
    floatingReceivers.remove();
  }
  
  // Supprimer l'ancien conteneur permanent producer
  const permanentProducer = document.getElementById('permanent-producer-thumbnails');
  if (permanentProducer) {
    permanentProducer.remove();
  }
  
  // Supprimer tout conteneur flottant
  const floatingThumbnails = document.getElementById('floating-producer-thumbnails');
  if (floatingThumbnails) {
    floatingThumbnails.remove();
  }
}



 private updateExistingReceiverThumbnail(thumbnailInfo: ReceiverThumbnailInfo, track?: RemoteTrack | LocalVideoTrack): void {
    console.log(`🔄 Updating receiver thumbnail: ${thumbnailInfo.id}`);
    
    const wasActive = thumbnailInfo.isActive;
    const isNowActive = !!track;
    
    // Si l'état change
    if (wasActive !== isNowActive) {
      if (isNowActive && track) {
        // Activation de la caméra
        try {
          if (thumbnailInfo.track) {
            thumbnailInfo.track.detach(thumbnailInfo.element);
          }
          track.attach(thumbnailInfo.element);
          this.showActiveCameraState(thumbnailInfo.wrapper);
          thumbnailInfo.track = track;
          thumbnailInfo.isActive = true;
          
          console.log(`📹 Receiver camera activated: ${thumbnailInfo.id}`);
        } catch (error) {
          console.error('Error activating receiver camera:', error);
          this.showInactiveCameraState(thumbnailInfo.wrapper);
        }
      } else {
        // Désactivation de la caméra
        if (thumbnailInfo.track) {
          try {
            thumbnailInfo.track.detach(thumbnailInfo.element);
          } catch (error) {
            console.warn('Track already detached');
          }
        }
        this.showInactiveCameraState(thumbnailInfo.wrapper);
        thumbnailInfo.track = undefined;
        thumbnailInfo.isActive = false;
        
        console.log(`📹 Receiver camera deactivated: ${thumbnailInfo.id}`);
      }
    }
  }

 

 

  // ===== CRÉATION DU LABEL AVEC NOM =====
  private createReceiverThumbnailLabel(participantInfo: ParticipantInfo): HTMLElement {
    const label = document.createElement('div');
    label.className = 'receiver-thumbnail-label';
    
    // Style identique au label PiP du producer
    Object.assign(label.style, {
      position: 'absolute',
      bottom: '4px',
      left: '4px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      background: 'rgba(33, 150, 243, 0.9)', // Bleu pour receivers
      color: 'white',
      padding: '2px 6px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '500',
      backdropFilter: 'blur(4px)',
      zIndex: '2',
      maxWidth: 'calc(100% - 16px)',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    });

    // Icône et texte
    const icon = document.createElement('mat-icon');
    icon.textContent = 'videocam';
    icon.style.fontSize = '12px';
    icon.style.width = '12px';
    icon.style.height = '12px';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = this.getReceiverDisplayName(participantInfo);

    label.appendChild(icon);
    label.appendChild(nameSpan);

    return label;
  }

  // ===== CRÉATION DE L'OVERLAY CAMÉRA FERMÉE =====
  private createCameraOffOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'camera-off-overlay';
    
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'none', // Masqué par défaut
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '8px',
      color: '#f44336',
      fontSize: '12px',
      fontWeight: '500',
      zIndex: '3'
    });

    // Icône caméra fermée
    const cameraOffIcon = document.createElement('div');
    cameraOffIcon.innerHTML = '📷'; // Ou utiliser mat-icon videocam_off
    cameraOffIcon.style.fontSize = '24px';
    cameraOffIcon.style.opacity = '0.8';

    // Texte
    const text = document.createElement('div');
    text.textContent = 'Caméra fermée';
    text.style.textAlign = 'center';

    overlay.appendChild(cameraOffIcon);
    overlay.appendChild(text);

    return overlay;
  }

 

  private showInactiveCameraState(wrapper: HTMLElement): void {
    const overlay = wrapper.querySelector('.camera-off-overlay') as HTMLElement;
    const label = wrapper.querySelector('.receiver-thumbnail-label') as HTMLElement;
    const icon = label?.querySelector('mat-icon');
    
    if (overlay) {
      overlay.style.display = 'flex';
    }
    
    if (icon) {
      icon.textContent = 'videocam_off';
    }
    
    if (label) {
      label.style.background = 'rgba(244, 67, 54, 0.9)'; // Rouge pour inactif
    }
  }

 

 

  // ===== UTILITAIRES =====
  private generateReceiverThumbnailId(participantInfo: ParticipantInfo): string {
    if (participantInfo.isLocal) {
      return `local-receiver-thumbnail-${this.currentUserId || 'unknown'}`;
    } else {
      return `remote-receiver-thumbnail-${participantInfo.participant.sid}`;
    }
  }

  private getReceiverDisplayName(participantInfo: ParticipantInfo): string {
    if (participantInfo.isLocal) {
      return 'Vous';
    } else {
      return participantInfo.displayName || participantInfo.name || 'Participant';
    }
  }


  // ===== EVENT HANDLERS =====
  private handleFullscreenChange = (): void => {
    this.isFullscreen = !!document.fullscreenElement;
    this.cdr.detectChanges();
  };

 private handleVideoClick(event: Event): void {
  const element = event.target as HTMLVideoElement;
  const elementId = element.id;

  const mediaInfo = this.mediaElements.get(elementId);
  if (!mediaInfo) return;

  // 🔒 Empêcher les vidéos des receivers d’être affichées en grand
  if (!this.isHost && mediaInfo.isLocal) {
    console.log('❌ Receiver cannot switch own video to main');
    this.showNotification('Votre caméra reste en miniature', 'warning');
    return;
  }

  if (this.receiverTracksBlacklist.has(elementId)) {
    console.log('❌ Receiver video click ignored');
    this.showNotification('Seules les vidéos du producteur peuvent être affichées en grand', 'error');
    return;
  }

  // ✅ Autoriser uniquement les vidéos du producer
  const isProducerVideo = mediaInfo.isLocal && this.isHost ||
    (!mediaInfo.isLocal && this.isProducerTrack(elementId));

  if (!isProducerVideo) {
    this.showNotification('Seules les vidéos du producteur peuvent être affichées en grand', 'error');
    return;
  }

  this.switchToMainVideo(elementId, element);
}

async startStreaming(): Promise<void> {
  if (this.isLoading || this.isConnected) return;

  this.isLoading = true;
  this.error = undefined;
  this.showStartButton = false;

  try {
    console.log(`🎬 Starting as ${this.isHost ? 'PRODUCER' : 'RECEIVER'}`);
    
    // S'assurer que le chat est connecté avant le stream
    if (!this.isChatConnected) {
      console.log('🔥 Ensuring chat connection before stream...');
      await this.connectChatAutomatically();
    }
    
    const { token, role } = await this.getConnectionToken();
    await this.connectToRoom(token, role);
    await this.setupMediaWithRetry();
    
    // Finalisation selon le rôle
    this.finalizeConnectionByRole();
    
    console.log(`✅ ${role.toUpperCase()} connected successfully`);

  } catch (error) {
    console.error(`❌ Connection failed:`, error);
    this.handleConnectionError(error);
  } finally {
    this.isLoading = false;
    this.cdr.detectChanges();
  }}
  private handleKeyboardShortcut = (event: KeyboardEvent): void => {
    if (!this.isConnected) return;

    if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
      event.preventDefault();
      this.toggleMute();
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'V') {
      event.preventDefault();
      this.toggleVideo();
    }

    if (this.isHost && (event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
      event.preventDefault();
      this.toggleScreenShare();
    }

    // Toggle chat with 'C' key
    if (event.key === 'c' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        this.toggleChat();
      }
    }

    // Debug shortcuts (Development seulement)
    if (this.isDevelopment) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        this.logCurrentState();
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        this.forceRedetermineMainVideo();
      }
    }
  };
  reconnectChat(): void {
  console.log('🔄 Manual chat reconnection...');
  this.chatReconnectAttempts++;
  this.chatConnectionStatus = 'RECONNECTING';
  this.cdr.detectChanges();
  
  try {
    // Nettoyer l'ancienne connexion
    this.chatService.leaveSession(this.sessionId);
    
    // Réinitialiser le statut
    this.isChatConnected = false;
    
    // Forcer une nouvelle connexion après un court délai
    setTimeout(async () => {
      try {
        await this.chatService.connectWebSocket();
        await this.waitForChatConnection();
        
        if (this.isChatConnected) {
          await this.chatService.joinSession(this.sessionId);
          this.showNotification('Chat reconnecté avec succès', 'success');
          this.chatReconnectAttempts = 0;
        } else {
          throw new Error('Connection failed');
        }
      } catch (error) {
        console.error('❌ Manual reconnection failed:', error);
        this.showNotification('Échec de la reconnexion chat', 'error');
        this.scheduleChatReconnection();
      }
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error in manual reconnection:', error);
    this.showNotification('Erreur de reconnexion chat', 'error');
    this.scheduleChatReconnection();
  }
}
 private scheduleChatReconnection(): void {
    if (this.chatReconnectAttempts >= this.MAX_CHAT_RECONNECT_ATTEMPTS) {
      console.log('Max chat reconnection attempts reached');
      return;
    }

    if (this.chatReconnectTimer) {
      clearTimeout(this.chatReconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.chatReconnectAttempts), 30000);
    console.log(`Scheduling chat reconnection in ${delay}ms`);

    this.chatReconnectTimer = setTimeout(() => {
      this.reconnectChat();
    }, delay);
  }

private async waitForChatConnection(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: any;
    let subscription: any;
    
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (subscription) subscription.unsubscribe();
    };
    
    // Timeout après 10 secondes
    timeoutId = setTimeout(() => {
      cleanup();
      console.warn('⚠️ Chat connection timeout');
      resolve(); // Ne pas rejeter pour ne pas bloquer le stream
    }, 10000);
    
    // Écouter les changements de statut
    subscription = this.chatService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          console.log('📡 Chat status during wait:', status);
          
          if (status === 'CONNECTED') {
            cleanup();
            resolve();
          } else if (status === 'DISCONNECTED' && this.chatConnectionStatus !== 'CONNECTING') {
            // Si on est déconnecté mais qu'on n'est plus en train de se connecter
            cleanup();
            resolve(); // Ne pas rejeter
          }
        },
        error: (error) => {
          cleanup();
          console.error('❌ Chat connection error during wait:', error);
          resolve(); // Ne pas rejeter pour ne pas bloquer le stream
        }
      });
  });
}

getChatDebugInfo(): any {
    return {
      isChatConnected: this.isChatConnected,
      chatConnectionStatus: this.chatConnectionStatus,
      messagesCount: this.chatMessages.length,
      typingCount: this.typingIndicators.length,
      reconnectAttempts: this.chatReconnectAttempts,
      unreadCount: this.unreadChatCount,
      sessionId: this.sessionId,
      currentUserId: this.currentUserId
    };
  }

  private playNotificationSound(): void {
    try {
      const audio = new Audio('/assets/sounds/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(e => console.log('Could not play notification sound:', e));
    } catch (error) {
      // Ignore audio errors
    }
  }


public forceSyncWithProducer(): void {
  if (this.isHost) {
    console.log('⚠️ Producer cannot sync with itself');
    return;
  }
  
  console.log('🔄 RECEIVER: Forcing sync with producer...');
  
  const startTime = performance.now();
  
  // 1. Nettoyer l'ancien contenu principal
  this.clearMainVideo();
  this.currentMainVideoSource = 'none';
  this.mainVideoTrack = undefined;
  
  // 2. Nettoyer les containers miniatures
  this.clearProducerCameraThumbnailContainer();
  
  // 3. Chercher et afficher le contenu du producteur
  this.findAndDisplayProducerContent();
  
  // 4. Valider l'état final
  setTimeout(() => {
    this.validateReceiverState();
    const duration = performance.now() - startTime;
    console.log(`✅ RECEIVER: Sync completed in ${duration.toFixed(2)}ms`);
    this.showNotification('Synchronisé avec le producteur', 'success');
  }, 500);
}
public toggleProducerCameraThumbnail(): void {
  if (this.isHost) return;
  
  const producerParticipant = this.findRemoteProducerParticipant();
  if (!producerParticipant) return;
  
  const hasContainer = this.hasProducerCameraThumbnail;
  const hasScreenShare = this.findProducerRemoteScreenShare(producerParticipant);
  
  if (!hasContainer && hasScreenShare) {
    this.createProducerCameraThumbnailDuringScreenShare(producerParticipant);
  } else if (hasContainer) {
    this.clearProducerCameraThumbnailContainer();
  }
}
/**
 * Getter pour vérifier si le container miniature de la caméra du producteur est visible
 */
get hasProducerCameraThumbnail(): boolean {
  return !!document.querySelector('#permanent-producer-thumbnails .producer-camera-sidebar-wrapper');
}
private adjustPermanentContainerPosition(): void {
  const container = document.getElementById('permanent-producer-thumbnails');
  if (!container) return;
  
  // Si le chat est ouvert, ajuster le z-index pour être sous le chat mais visible
  if (this.showChat) {
    container.style.zIndex = '50'; // Sous le chat (qui est à z-index 100+)
  } else {
    container.style.zIndex = '100'; // Au-dessus quand le chat est fermé
  }
}

  // LA MÉTHODE placeCameraInRightSidebar (dupplication dans votre code)
  








public forceProducerCameraToSidebar(): void {
  if (this.isHost) {
    console.log('⚠️ This method is for receivers only');
    return;
  }
  
  const producerParticipant = this.findRemoteProducerParticipant();
  if (!producerParticipant) {
    console.log('❌ No producer participant found');
    return;
  }
  
  // Nettoyer les anciennes miniatures
  this.clearProducerCameraThumbnailContainer();
  
  // Créer une nouvelle miniature dans la sidebar
  this.createProducerCameraThumbnailDuringScreenShare(producerParticipant);
  
  console.log('✅ Producer camera forced to sidebar');
}

  private handleWindowFocus = (): void => {
    this.lastFocusState = true;
    if (this.showChat) {
      this.unreadChatCount = 0;
    }
  };

  private handleWindowBlur = (): void => {
    this.lastFocusState = false;
  };

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private livestreamService: LivestreamService,
    private chatService: ChatService,
    private recordingService: RecordingService,
    private userService: UserService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private exchangeService :ExchangeService,
   
   private dialog: MatDialog

  ) {}

  // ============================================================================
  // ===== LIFECYCLE HOOKS =====
  // ============================================================================

 async ngOnInit(): Promise<void> {
 try {
   await this.initializeSession();
   this.setupFullscreenListeners();
   this.setupKeyboardShortcuts();
   this.setupWindowFocusListeners();
   
   // Nettoyer les anciens conteneurs flottants
   this.cleanupFloatingContainers();
   
   // Validation périodique pour les receivers
   if (!this.isHost) {
     setInterval(() => {
       if (this.isConnected) {
         this.validateNoLocalCameraInMain();
       }
     }, 2000); // Vérifier toutes les 2 secondes
   }
   
   await this.initializeChat();
   this.initializeRecording();
   this.startMetricsCollection();
   
 } catch (error) {
   this.handleError(error);
 } finally {
   this.isLoading = false;
   this.cdr.detectChanges();
 }
}


  ngAfterViewInit(): void {
    this.ensureVideoContainers();
    this.setupChatScrolling();
  }

  async ngOnDestroy(): Promise<void> {
  try {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Nettoyer les miniatures receivers
    this.clearAllReceiverThumbnails();
    
    // Arrêter les timers
    this.stopStreamTimer();
    this.removeKeyboardShortcuts();
    this.removeWindowFocusListeners();
    
    // Chat cleanup
    if (this.isTyping) {
      this.chatService.sendTypingIndicator(this.sessionId, false);
    }
    this.chatService.leaveSession(this.sessionId);
    
    if (this.chatReconnectTimer) {
      clearInterval(this.chatReconnectTimer);
      this.chatReconnectTimer = undefined;
    }
    
    this.recordingService.cleanup();
    
    // Déconnecter de la room SANS terminer la session
    if (this.room) {
      await this.livestreamService.disconnectFromRoom(this.room);
    }
    
    this.cleanupAllMediaElements();
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    
    // Si c'est un receiver et que la session a été terminée par le producteur
    // le mécanisme de rating a déjà été géré dans handleProducerEndedSession()
    
    console.log('LivestreamComponent destroyed successfully');
    
  } catch (error) {
    console.error('Error during component destruction:', error);
  }
}
private listenForSessionEnd(): void {
  if (this.isHost) return;
  
  console.log('👀 RECEIVER: Starting to listen for session end...');
  
  // Vérifier le statut de la session toutes les 3 secondes
  interval(3000).pipe(
    takeUntil(this.destroy$)
  ).subscribe(async () => {
    if (!this.session || !this.isConnected) return;
    
    try {
      const currentSession = await firstValueFrom(
        this.livestreamService.getSession(this.session.id)
      );
      
      // Vérifier si la session est terminée
      if (currentSession.status === 'COMPLETED' && this.isConnected) {
        console.log('📺 Session marked as COMPLETED by producer');
        this.sessionEndedByProducer = true;
        await this.handleProducerEndedSession();
      }
    } catch (error) {
      console.log('Error checking session status:', error);
    }
  });
  
  // Écouter aussi les messages du chat pour une notification immédiate
  this.chatService.messages$.pipe(
    takeUntil(this.destroy$)
  ).subscribe(messages => {
    if (!messages || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.message === '### SESSION TERMINÉE PAR LE PRODUCTEUR ###') {
      console.log('📺 Received session end notification via chat');
      this.sessionEndedByProducer = true;
      this.handleProducerEndedSession();
    }
  });
}


  // ============================================================================
  // ===== HELPERS POUR LIVEKIT =====
  // ============================================================================

  private getPublicationsBySource(participant: any, source: Track.Source): LiveKitPublication[] {
    if (!participant?.videoTrackPublications) {
      return [];
    }
    
    const publications: LiveKitPublication[] = [];
    
    try {
      const trackPublications = Array.from(participant.videoTrackPublications.values()) as any[];
      
      for (const pub of trackPublications) {
        if (pub && pub.source === source && pub.track) {
          publications.push({
            track: pub.track,
            trackSid: pub.trackSid || pub.track?.sid || 'unknown',
            source: pub.source
          });
        }
      }
    } catch (error) {
      console.warn('Error getting publications by source:', error);
    }
    
    return publications;
  }

  private findFirstPublicationBySource(participant: any, source: Track.Source): LiveKitPublication | null {
    const publications = this.getPublicationsBySource(participant, source);
    return publications.length > 0 ? publications[0] : null;
  }

  // Méthode alternative plus simple pour les cas spécifiques
  private findTrackBySource(participant: any, source: Track.Source): { track: any, trackSid: string } | null {
    if (!participant?.videoTrackPublications) {
      return null;
    }

    try {
      const publications = participant.videoTrackPublications;
      
      // Itérer sur les publications avec for...of pour éviter les problèmes de type
      for (const [key, pub] of publications) {
        const publication = pub as any;
        if (publication && publication.source === source && publication.track) {
          return {
            track: publication.track,
            trackSid: publication.trackSid || key || 'unknown'
          };
        }
      }
    } catch (error) {
      console.warn('Error finding track by source:', error);
    }

    return null;
  }

// ============================================================================
// ===== GESTION SPÉCIFIQUE DES RECEIVERS =====
// ============================================================================

/**
 * 🚨 MÉTHODE CRITIQUE: S'assurer que les receivers ont leur caméra fermée
 * et voient le contenu du producer en principal
 */
private enforceReceiverCameraOff(): void {
  if (this.isHost) return; // Seulement pour les receivers
  
  console.log('🔒 Enforcing receiver camera OFF state...');
  
  // 1. Désactiver la caméra si elle est active
  if (!this.isVideoOff) {
    console.log('🔒 FORCING receiver camera OFF');
    this.isVideoOff = true;
    
    if (this.room) {
      this.room.localParticipant.setCameraEnabled(false).catch(err => {
        console.warn('Error disabling camera:', err);
      });
    }
  }
  
  // 2. Nettoyer tous les éléments caméra du receiver
  this.cleanupReceiverCameraElements();
  
  // 3. S'assurer que le contenu principal est celui du producer
  this.determineMainVideoContent();
  
  console.log('✅ Receiver camera state enforced: OFF');
}

/**
 * Nettoie spécifiquement les éléments caméra des receivers
 */
private cleanupReceiverCameraElements(): void {
  const receiverCameraIds = Array.from(this.mediaElements.keys())
    .filter(id => {
      const info = this.mediaElements.get(id);
      return info?.isLocal && info.source === Track.Source.Camera;
    });
  
  receiverCameraIds.forEach(id => {
    console.log(`🗑️ Cleaning receiver camera element: ${id}`);
    this.removeMediaElement(id);
  });
  
  // Supprimer la référence à la caméra locale si c'est un receiver
  if (this.cameraTrack && !this.isHost) {
    try {
      this.cameraTrack.detach();
    } catch (e) {
      console.log('Camera track already detached');
    }
    this.cameraTrack = undefined;
  }
}







// ============================================================================
// ===== GESTION PRIORITAIRE DU CONTENU PRINCIPAL =====
// ============================================================================

  /**
   * Détermine quelle vidéo doit être affichée en mainVideo selon la hiérarchie :
   * 1. Partage d'écran du producer (priorité maximale)
   * 2. Caméra du producer
   * 3. Aucune vidéo (placeholder)
   * Les caméras des receivers ne doivent JAMAIS être en mainVideo
   */
private determineMainVideoContent(): void {
 if (!this.room) return;

 console.log(`🔍 ${this.isHost ? 'PRODUCER' : 'RECEIVER'}: Determining main video content...`);
 const oldSource = this.currentMainVideoSource;

 if (this.isHost) {
   // PRODUCER : peut afficher sa caméra ou partage d'écran
   this.handleProducerMainContent();
 } else {
   // RECEIVER : afficher UNIQUEMENT le contenu du producteur
   this.findAndDisplayProducerContent();
   
   // Validation supplémentaire pour s'assurer qu'aucune caméra locale n'est en main
   this.validateNoLocalCameraInMain();
 }

 // Détecter les changements
 if (oldSource !== this.currentMainVideoSource) {
   console.log(`📺 Main content changed from ${oldSource} to ${this.currentMainVideoSource}`);
   this.announceContentChange(oldSource, this.currentMainVideoSource);
 }
}
private validateNoLocalCameraInMain(): void {
 if (this.isHost) return;
 
 const mainVideo = this.mainVideoContainer?.nativeElement?.querySelector('video');
 if (!mainVideo) return;
 
 const mediaInfo = this.mediaElements.get(mainVideo.id);
 
 // Si c'est une caméra locale en main, la retirer immédiatement
 if (mediaInfo?.isLocal) {
   console.error('🚨 VIOLATION: Local receiver camera in main video! Removing...');
   this.clearMainVideo();
   this.currentMainVideoSource = 'none';
 }
}
private handleProducerMainContent(): void {
  const producerParticipant = this.room!.localParticipant;
  
  // Priorité 1: Partage d'écran
  const screenShare = this.findProducerScreenShare(producerParticipant);
  if (screenShare) {
    this.setMainVideoTrackForProducer(screenShare.track, screenShare.elementId, 'producer-screen');
    
    // Si caméra active, la mettre en PiP
    if (this.cameraTrack && !this.isVideoOff) {
      this.placeCameraInPiP();
    }
    return;
  }

  // Priorité 2: Caméra (en main si pas de partage)
  const camera = this.findProducerCamera(producerParticipant);
  if (camera) {
    this.setMainVideoTrackForProducer(camera.track, camera.elementId, 'producer-camera');
    return;
  }

  // Aucun contenu
  this.clearMainVideoAndSetPlaceholder();
}

private announceContentChange(oldSource: string, newSource: string): void {
  let message = '';
  
  switch (newSource) {
    case 'producer-screen':
      message = 'Le producteur partage maintenant son écran';
      break;
    case 'producer-camera':
      message = 'Affichage de la caméra du producteur';
      break;
    case 'none':
      message = 'En attente du contenu du producteur';
      break;
  }
  
  if (message && oldSource !== newSource) {
    this.showNotification(message, 'success');
  }
}

private findAndDisplayProducerContent(): void {
  const producerParticipant = this.findRemoteProducerParticipant();
  
  if (!producerParticipant) {
    console.log('❌ RECEIVER: No producer found');
    this.clearMainVideoAndSetPlaceholder();
    return;
  }

  console.log('🔍 RECEIVER: Searching for producer content...');

  // Priorité 1: Partage d'écran du producteur
  const screenShare = this.findProducerRemoteScreenShare(producerParticipant);
  if (screenShare) {
    console.log('📺 RECEIVER: Displaying producer screen share');
    this.setMainVideoTrackForReceiver(screenShare.track, screenShare.elementId, 'producer-screen');
    
    // S'assurer que la miniature caméra est créée
    setTimeout(() => {
      const hasCamera = this.findProducerRemoteCamera(producerParticipant);
      if (hasCamera) {
        // Nettoyer d'abord les anciennes miniatures
        this.clearAllProducerThumbnails();
        // Puis créer la nouvelle
        this.createProducerCameraThumbnailDuringScreenShare(producerParticipant);
      }
    }, 500);
    return;
  }

  // Priorité 2: Caméra du producteur
  const camera = this.findProducerRemoteCamera(producerParticipant);
  if (camera) {
    console.log('📹 RECEIVER: Displaying producer camera in main view');
    // Nettoyer les miniatures car la caméra va en principal
    this.clearAllProducerThumbnails();
    this.setMainVideoTrackForReceiver(camera.track, camera.elementId, 'producer-camera');
    return;
  }

  // Aucun contenu du producteur disponible
  console.log('⏳ RECEIVER: Waiting for producer content...');
  this.clearMainVideoAndSetPlaceholder();
}



// 3. HELPER: Trouver le participant producteur distant
private findRemoteProducerParticipant(): RemoteParticipant | null {
  if (!this.room || this.isHost) return null;
  
  return Array.from(this.room.remoteParticipants.values())
    .find(participant => participant.identity === this.session?.producerId.toString()) || null;
}

// 4. HELPER: Trouver le partage d'écran du producteur distant
private findProducerRemoteScreenShare(producerParticipant: RemoteParticipant): { track: RemoteTrack, elementId: string } | null {
  const screenShareTrack = this.findTrackBySource(producerParticipant, Track.Source.ScreenShare);
  
  if (screenShareTrack) {
    const elementId = `${producerParticipant.sid}-${screenShareTrack.trackSid}`;
    return { track: screenShareTrack.track, elementId };
  }
  
  return null;
}

// 5. HELPER: Trouver la caméra du producteur distant
private findProducerRemoteCamera(producerParticipant: RemoteParticipant): { track: RemoteTrack, elementId: string } | null {
  const cameraTrack = this.findTrackBySource(producerParticipant, Track.Source.Camera);
  
  if (cameraTrack) {
    const elementId = `${producerParticipant.sid}-${cameraTrack.trackSid}`;
    return { track: cameraTrack.track, elementId };
  }
  
  return null;
}



private addProducerCameraToSidebar(element: HTMLVideoElement): void {
  // Créer un wrapper spécial pour la caméra du producteur
  const wrapper = document.createElement('div');
  wrapper.className = 'producer-camera-sidebar-wrapper';
  
  // Style pour le wrapper
  Object.assign(wrapper.style, {
    position: 'relative',
    display: 'inline-block',
    margin: '5px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '3px solid #4CAF50',
    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
    background: '#000'
  });
  
  // Créer un label pour identifier la caméra du producteur
  const label = document.createElement('div');
  label.textContent = 'Producteur';
  label.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(76, 175, 80, 0.9);
    color: white;
    font-size: 10px;
    text-align: center;
    padding: 2px 4px;
    font-weight: 500;
    z-index: 1;
  `;
  
  // Ajouter l'élément vidéo et le label au wrapper
  wrapper.appendChild(element);
  wrapper.appendChild(label);
  
  //  Toujours utiliser un conteneur permanent à droite
  const targetContainer = this.getOrCreatePermanentRightContainer();
  
  // Ajouter au conteneur
  if (targetContainer.firstChild) {
    targetContainer.insertBefore(wrapper, targetContainer.firstChild);
  } else {
    targetContainer.appendChild(wrapper);
  }
  
  console.log('📹 Producer camera added to permanent right container');
}
private getOrCreatePermanentRightContainer(): HTMLElement {
  const existingContainer = document.getElementById('permanent-producer-thumbnails');
  if (existingContainer) {
    return existingContainer;
  }
  
  // Créer un nouveau conteneur permanent à droite
  const permanentContainer = document.createElement('div');
  permanentContainer.id = 'permanent-producer-thumbnails';
  permanentContainer.className = 'permanent-thumbnails-container';
  
  // Trouver le conteneur parent approprié (la section principale)
  const streamContent = document.querySelector('.stream-content');
  if (streamContent) {
    streamContent.appendChild(permanentContainer);
  } else {
    document.body.appendChild(permanentContainer);
  }
  
  console.log('✅ Created permanent right container for producer thumbnails');
  return permanentContainer;
}

private isThumbnailContainerVisible(): boolean {
  const container = this.topThumbnailContainer?.nativeElement;
  if (!container) return false;
  
  // Vérifier si le conteneur ou son parent est masqué
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

private getOrCreateFloatingThumbnailContainer(): HTMLElement {
  const existingContainer = document.getElementById('floating-producer-thumbnails');
  if (existingContainer) {
    return existingContainer;
  }
  
  // Créer un nouveau conteneur flottant
  const floatingContainer = document.createElement('div');
  floatingContainer.id = 'floating-producer-thumbnails';
  floatingContainer.className = 'floating-thumbnails-container';
  
  // Style pour le conteneur flottant
  Object.assign(floatingContainer.style, {
    position: 'absolute',
    top: '80px',
    right: '16px',
    zIndex: '100',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '150px'
  });
  
  // Ajouter au conteneur vidéo principal
  const mainVideoWrapper = this.mainVideoContainer?.nativeElement?.parentElement;
  if (mainVideoWrapper) {
    mainVideoWrapper.appendChild(floatingContainer);
  } else {
    // Fallback: ajouter au body
    document.body.appendChild(floatingContainer);
  }
  
  return floatingContainer;
}

private ensureProducerCameraThumbnailContainer(): void {
  // Cette méthode n'est plus nécessaire car on utilise la sidebar
  console.log('📹 Using sidebar instead of overlay container');
}
private createProducerCameraThumbnailElement(id: string): HTMLVideoElement {
  const element = document.createElement('video');
  element.id = id;
  element.autoplay = true;
  element.playsInline = true;
  element.muted = true; // Toujours muted pour éviter l'écho
  
  // Style pour la miniature dans la sidebar (même taille que les autres miniatures)
  Object.assign(element.style, {
    width: '120px',
    height: '90px',
    objectFit: 'cover',
    backgroundColor: '#000',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    display: 'block'
  });
  
  // Ajouter un effet hover
  element.addEventListener('mouseenter', () => {
    element.style.transform = 'scale(1.05)';
  });
  
  element.addEventListener('mouseleave', () => {
    element.style.transform = 'scale(1)';
  });
  
  // 🔥 IMPORTANT: Permettre de cliquer pour basculer vers la vue principale
  element.addEventListener('click', () => {
    this.switchProducerCameraFromSidebarToMain(element);
  });
  
  return element;
}
private switchProducerCameraFromSidebarToMain(cameraElement: HTMLVideoElement): void {
  if (this.isHost) {
    console.log('❌ Producer cannot switch own content');
    return;
  }
  
  console.log('🔄 RECEIVER: Switching producer camera to main');
  
  // Nettoyer l'ancien contenu principal
  this.clearMainVideo();
  
  // Retirer l'élément de son conteneur actuel
  const wrapper = cameraElement.closest('.producer-camera-sidebar-wrapper');
  if (wrapper && wrapper.parentNode) {
    wrapper.parentNode.removeChild(wrapper);
  }
  
  // Nettoyer le conteneur permanent s'il est vide
  const permanentContainer = document.getElementById('permanent-producer-thumbnails');
  if (permanentContainer && permanentContainer.children.length === 0) {
    permanentContainer.remove();
  }
  
  // Appliquer le style main video
  Object.assign(cameraElement.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    margin: '0',
    cursor: 'default',
    border: 'none',
    borderRadius: '0',
    transform: 'scale(1)',
    display: 'block'
  });
  
  // Retirer les event listeners de la miniature
  cameraElement.removeEventListener('mouseenter', () => {});
  cameraElement.removeEventListener('mouseleave', () => {});
  
  // Ajouter au conteneur principal
  this.mainVideoContainer.nativeElement.appendChild(cameraElement);
  
  // Mettre à jour les références
  this.currentMainVideoSource = 'producer-camera';
  
  this.showNotification('Caméra du producteur affichée en grand');
  console.log('✅ Producer camera moved to main view');
}




private switchProducerCameraToMain(cameraElement: HTMLVideoElement): void {
  if (this.isHost) {
    console.log('❌ Producer cannot switch own content');
    return;
  }
  
  console.log('🔄 RECEIVER: Switching producer camera from thumbnail to main');
  
  // Nettoyer l'ancien contenu principal
  this.clearMainVideo();
  
  // Déplacer la caméra vers la vue principale
  this.moveProducerCameraToMain(cameraElement);
  
  // Mettre à jour les références
  this.currentMainVideoSource = 'producer-camera';
  
  // Nettoyer le container miniature
  this.clearProducerCameraThumbnailContainer();
  
  this.showNotification('Caméra du producteur affichée en grand');
}
private moveProducerCameraToMain(cameraElement: HTMLVideoElement): void {
  // Retirer du container miniature
  if (cameraElement.parentNode) {
    cameraElement.parentNode.removeChild(cameraElement);
  }
  
  // Appliquer le style main video
  Object.assign(cameraElement.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    margin: '0',
    cursor: 'default',
    border: 'none',
    borderRadius: '0',
    transform: 'scale(1)' // Reset du hover effect
  });
  
  // Retirer les event listeners de la miniature
  cameraElement.removeEventListener('mouseenter', () => {});
  cameraElement.removeEventListener('mouseleave', () => {});
  
  // Ajouter au conteneur principal
  this.mainVideoContainer.nativeElement.appendChild(cameraElement);
  
  console.log('✅ Producer camera moved to main view');
}


private clearProducerCameraThumbnailContainer(): void {
  // Supprimer les miniatures du producteur dans la section du haut
  const producerThumbnails = document.querySelectorAll('#producer-thumbnail-wrapper video');
  producerThumbnails.forEach(element => {
    const wrapper = element.closest('.producer-thumbnail');
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  });
  
  // Nettoyer aussi le conteneur permanent s'il existe
  const permanentContainer = document.getElementById('permanent-producer-thumbnails');
  if (permanentContainer) {
    permanentContainer.remove();
  }
  
  console.log('✅ Producer camera thumbnails cleared (camera is in main)');
}

private validateVideoDisplay(): void {
  const isProducerScreenSharing = this.isHost ? this.isScreenSharing : 
    (this.findRemoteProducerParticipant() && 
     this.findProducerRemoteScreenShare(this.findRemoteProducerParticipant()!));
  
  const expectedSource = isProducerScreenSharing ? 'producer-screen' : 'producer-camera';
  
  if (this.currentMainVideoSource !== expectedSource && this.currentMainVideoSource !== 'none') {
    console.log(`🔄 Adjusting video display: ${this.currentMainVideoSource} -> ${expectedSource}`);
    this.determineMainVideoContent();
  }
}

private handleProducerScreenShareStopped(): void {
  console.log('🖥️ Producer screen share stopped, restoring camera to main');
  
  // Nettoyer TOUTES les miniatures du producteur (dans le conteneur du haut ET permanents)
  this.clearAllProducerThumbnails();
  
  // Redéterminer le contenu principal (la caméra du producteur devrait passer en principal)
  setTimeout(() => {
    this.determineMainVideoContent();
  }, 200);
}
private clearAllProducerThumbnails(): void {
  console.log('🧹 Clearing ALL producer thumbnails...');
  
  // Nettoyer dans la section du haut
  const producerGroup = document.querySelector('#producer-thumbnail-wrapper');
  if (producerGroup) {
    // Garder le label mais supprimer les vidéos
    const videos = producerGroup.querySelectorAll('video');
    videos.forEach(video => {
      const wrapper = video.parentElement;
      if (wrapper && wrapper !== producerGroup) {
        wrapper.remove();
      }
    });
  }
  
  // Nettoyer le conteneur permanent (legacy)
  const permanentContainer = document.getElementById('permanent-producer-thumbnails');
  if (permanentContainer) {
    permanentContainer.remove();
  }
  
  // Nettoyer dans mediaElements
  const producerThumbnailIds = Array.from(this.mediaElements.keys())
    .filter(id => id.includes('producer-camera-thumbnail'));
  
  producerThumbnailIds.forEach(id => {
    console.log(`🗑️ Removing producer thumbnail: ${id}`);
    this.mediaElements.delete(id);
  });
  
  console.log('✅ All producer thumbnails cleared');
}
  private findProducerParticipant(): RemoteParticipant | any {
    if (this.isHost) {
      return this.room?.localParticipant;
    }
    
    return Array.from(this.room?.remoteParticipants.values() || [])
      .find(participant => participant.identity === this.session?.producerId.toString());
  }

  private findProducerScreenShare(producerParticipant: any): { track: LocalVideoTrack, elementId: string } | null {
  // Chercher dans les éléments média existants
  for (const [elementId, info] of this.mediaElements) {
    if (info.isLocal && info.source === Track.Source.ScreenShare) {
      // Chercher la publication correspondante
      const publications = Array.from(this.room!.localParticipant.videoTrackPublications.values());
      const screenPublication = publications.find(pub => 
        pub.source === Track.Source.ScreenShare && pub.track
      );
      
      if (screenPublication?.track) {
        return { track: screenPublication.track as LocalVideoTrack, elementId };
      }
    }
  }
  return null;
}

  private findProducerCamera(producerParticipant: any): { track: LocalVideoTrack, elementId: string } | null {
  // Chercher dans les éléments média existants
  for (const [elementId, info] of this.mediaElements) {
    if (info.isLocal && info.source === Track.Source.Camera) {
      // Chercher la publication correspondante
      const publications = Array.from(this.room!.localParticipant.videoTrackPublications.values());
      const cameraPublication = publications.find(pub => 
        pub.source === Track.Source.Camera && pub.track
      );
      
      if (cameraPublication?.track) {
        return { track: cameraPublication.track as LocalVideoTrack, elementId };
      }
    }
  }
  
  // Si pas trouvé dans mediaElements mais cameraTrack existe
  if (this.cameraTrack) {
    const elementId = `local-camera-${Date.now()}`;
    return { track: this.cameraTrack, elementId };
  }
  
  return null;
}
 
private setMainVideoTrackForProducer(track: LocalVideoTrack, elementId: string, source: 'producer-camera' | 'producer-screen'): void {
  // Éviter les changements inutiles
  if (this.mainVideoTrack === track && this.currentMainVideoSource === source) {
    console.log('✅ Main video already set correctly');
    return;
  }

  console.log(`🔄 PRODUCER: Setting main video: ${source} (${elementId})`);

  // Nettoyer l'ancien contenu
  this.clearMainVideo();

  // Créer ou récupérer l'élément vidéo
  let element = document.getElementById(elementId) as HTMLVideoElement;
  
  if (!element) {
    element = this.createMainVideoElement(elementId, true); // true = local
    track.attach(element);
    
    this.mediaElements.set(elementId, {
      element,
      trackId: track.sid || 'unknown',
      isLocal: true,
      source: source === 'producer-screen' ? Track.Source.ScreenShare : Track.Source.Camera
    });
  }

  // Ajouter au conteneur principal
  this.mainVideoContainer.nativeElement.appendChild(element);
  
  // Mettre à jour les références
  this.mainVideoTrack = track;
  this.currentMainVideoSource = source;

  console.log(`✅ PRODUCER: Main video set successfully: ${source}`);
}

  private setMainVideoTrack(track: LocalVideoTrack, elementId: string, source: 'producer-camera' | 'producer-screen'): void {
  // Éviter les changements inutiles
  if (this.mainVideoTrack === track && this.currentMainVideoSource === source) {
    console.log('✅ Main video already set correctly');
    return;
  }

  console.log(`🔄 PRODUCER: Setting main video: ${source} (${elementId})`);

  // Nettoyer l'ancien contenu
  this.clearMainVideo();

  // Créer ou récupérer l'élément vidéo
  let element = document.getElementById(elementId) as HTMLVideoElement;
  
  if (!element) {
    element = this.createMainVideoElement(elementId, true);
    track.attach(element);
    
    this.mediaElements.set(elementId, {
      element,
      trackId: track.sid || 'unknown',
      isLocal: true,
      source: source === 'producer-screen' ? Track.Source.ScreenShare : Track.Source.Camera
    });
  }

  // Ajouter au conteneur principal
  this.mainVideoContainer.nativeElement.appendChild(element);
  
  // Mettre à jour les références
  this.mainVideoTrack = track;
  this.currentMainVideoSource = source;

  console.log(`✅ PRODUCER: Main video set successfully: ${source}`);
}
private setMainVideoTrackForReceiver(track: RemoteTrack, elementId: string, source: 'producer-camera' | 'producer-screen'): void {
  // Éviter les changements inutiles
  if (this.mainVideoTrack === track && this.currentMainVideoSource === source) {
    console.log('✅ Main video already set correctly');
    return;
  }

  console.log(`🔄 RECEIVER: Setting main video: ${source} (${elementId})`);

  // Nettoyer l'ancien contenu
  this.clearMainVideo();

  // Créer ou récupérer l'élément vidéo
  let element = document.getElementById(elementId) as HTMLVideoElement;
  
  if (!element) {
    element = this.createMainVideoElement(elementId, false); // false = pas local
    track.attach(element);
    
    this.mediaElements.set(elementId, {
      element,
      trackId: track.sid || 'unknown',
      isLocal: false,
      source: source === 'producer-screen' ? Track.Source.ScreenShare : Track.Source.Camera,
      participantId: (track as any).participant?.sid
    });
  } else {
    // Déplacer l'élément existant des miniatures vers le principal
    if (element.parentNode === this.topThumbnailContainer.nativeElement) {
      this.topThumbnailContainer.nativeElement.removeChild(element);
      
      // Restaurer le style pour mainVideo
      Object.assign(element.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        margin: '0',
        cursor: 'default',
        border: 'none'
      });
    }
  }

  // Ajouter au conteneur principal
  this.mainVideoContainer.nativeElement.appendChild(element);
  
  // Mettre à jour les références
  this.mainVideoTrack = track;
  this.currentMainVideoSource = source;

  console.log(`✅ RECEIVER: Main video set successfully: ${source}`);
}
  private clearMainVideoAndSetPlaceholder(): void {
    this.clearMainVideo();
    this.mainVideoTrack = undefined;
    this.currentMainVideoSource = 'none';
    this.producerMainVideoTrackId = undefined;
  }

private handleTrackSubscribed(
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant
): void {
  if (track.kind !== Track.Kind.Video) {
    this.handleAudioTrackSubscribed(track, publication, participant);
    return;
  }

  const isProducerParticipant = participant.identity === this.session?.producerId.toString();
  
  // Trouver ou créer l'info participant
  const participantInfo = this.findOrCreateParticipantInfo(participant, isProducerParticipant);
  
  console.log(`📡 Track subscribed from ${isProducerParticipant ? 'PRODUCER' : 'RECEIVER'}: ${track.source}`);
  
  if (!isProducerParticipant) {
    // RECEIVER : Toujours en miniature
    console.log(`📹 Creating top thumbnail for receiver: ${participant.identity}`);
    this.createOrUpdateReceiverThumbnail(participantInfo, track);
    return;
  }
  
  // PRODUCER : Logique d'affichage améliorée
  if (isProducerParticipant) {
    if (track.source === Track.Source.ScreenShare) {
      console.log('🖥️ RECEIVER: Producer screen share received -> Main video');
      
      // Nettoyer les anciennes miniatures du producteur avant
      this.clearAllProducerThumbnails();
      
      // Afficher le partage d'écran en principal
      this.handleProducerScreenShare(track, participantInfo);
      
      // Créer la miniature pour la caméra après un délai
      setTimeout(() => {
        const cameraTrack = this.findProducerRemoteCamera(participant);
        if (cameraTrack) {
          console.log('📹 Creating camera thumbnail during screen share');
          this.createProducerCameraThumbnailDuringScreenShare(participant);
        }
      }, 500);
      
    } else if (track.source === Track.Source.Camera) {
      const hasScreenShare = this.findProducerRemoteScreenShare(participant);
      
      if (hasScreenShare) {
        console.log('📹 RECEIVER: Producer camera with active screen share -> Thumbnail');
        // Attendre un peu pour éviter les conflits
        setTimeout(() => {
          this.createProducerCameraThumbnailDuringScreenShare(participant);
        }, 300);
      } else {
        console.log('📹 RECEIVER: Producer camera WITHOUT screen share -> Main video');
        // Nettoyer les miniatures car la caméra va en principal
        this.clearAllProducerThumbnails();
        this.handleProducerCamera(track, participantInfo);
      }
    }
  }
  
  // Validation finale
  setTimeout(() => {
    this.determineMainVideoContent();
    this.validateDisplayState();
  }, 100);
}



private validateDisplayState(): void {
  if (!this.isConnected) return;
  
  console.log('🔍 Validating display state...');
  
  if (this.isHost) {
    // PRODUCER: Vérifier que sa caméra est bien affichée
    if (!this.isVideoOff && !this.isScreenSharing && this.currentMainVideoSource !== 'producer-camera') {
      console.warn('⚠️ Producer camera should be in main but is not');
      this.determineMainVideoContent();
    }
  } else {
    // RECEIVER: Vérifier qu'on affiche bien le contenu du producteur
    const producerParticipant = this.findRemoteProducerParticipant();
    if (producerParticipant) {
      const hasScreenShare = this.findProducerRemoteScreenShare(producerParticipant);
      const hasCamera = this.findProducerRemoteCamera(producerParticipant);
      
      if (!hasScreenShare && hasCamera && this.currentMainVideoSource !== 'producer-camera') {
        console.warn('⚠️ Should display producer camera but showing:', this.currentMainVideoSource);
        this.findAndDisplayProducerContent();
      }
    }
  }
}
private findOrCreateParticipantInfo(participant: RemoteParticipant, isProducerParticipant: boolean): ParticipantInfo {
  let participantInfo = this.participantInfos.find(p => 
    !p.isLocal && p.participant.sid === participant.sid
  );

  if (!participantInfo) {
    participantInfo = {
      participant,
      isProducer: isProducerParticipant,
      name: participant.identity,
      displayName: participant.identity,
      joinedAt: new Date(),
      userId: this.extractUserIdFromIdentity(participant.identity),
      isLocal: false
    };
    
    this.participantInfos.push(participantInfo);
    this.updateParticipantCounts();
    this.loadParticipantDisplayName(participantInfo);
  }

  return participantInfo;
}

private handleProducerScreenShare(track: RemoteTrack, participantInfo: ParticipantInfo): void {
  // Créer directement en principal
  const elementId = `${participantInfo.participant.sid}-${track.sid}`;
  const element = this.createMainVideoElement(elementId, false);
  
  track.attach(element);
  this.clearMainVideo();
  this.mainVideoContainer.nativeElement.appendChild(element);
  
  this.mainVideoTrack = track;
  this.currentMainVideoSource = 'producer-screen';
  
  this.mediaElements.set(elementId, {
    element,
    trackId: track.sid || 'unknown',
    participantId: participantInfo.participant.sid,
    isLocal: false,
    source: Track.Source.ScreenShare
  });
}

private handleProducerCamera(track: RemoteTrack, participantInfo: ParticipantInfo): void {
  // La caméra du producteur va TOUJOURS en main video quand pas de partage d'écran
  const elementId = `${participantInfo.participant.sid}-${track.sid}`;
  const element = this.createMainVideoElement(elementId, false);
  
  track.attach(element);
  this.clearMainVideo();
  this.mainVideoContainer.nativeElement.appendChild(element);
  
  this.mainVideoTrack = track;
  this.currentMainVideoSource = 'producer-camera';
  
  this.mediaElements.set(elementId, {
    element,
    trackId: track.sid || 'unknown',
    participantId: participantInfo.participant.sid,
    isLocal: false,
    source: Track.Source.Camera
  });
  
  console.log('✅ Producer camera displayed in main video for receivers');
}



  private handleVideoTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    elementId: string,
    isProducerParticipant: boolean
  ): void {
    let element: HTMLVideoElement;

    // RÈGLE: Tous les tracks de receivers vont TOUJOURS en miniature
    if (!isProducerParticipant) {
      console.log(`📺 Receiver ${track.source} -> THUMBNAIL ONLY`);
      element = this.createThumbnailElement(elementId, false, false);
      this.topThumbnailContainer.nativeElement.appendChild(element);
      
      // Ajouter à la blacklist
      this.receiverTracksBlacklist.add(elementId);
    }
    // Tracks du producer : placement intelligent
    else {
      element = this.createThumbnailElement(elementId, false, true);
      this.topThumbnailContainer.nativeElement.appendChild(element);
    }

    // Attacher le track et enregistrer
    track.attach(element);
    this.mediaElements.set(elementId, {
      element,
      trackId: publication.trackSid,
      participantId: participant.sid,
      isLocal: false,
      source: track.source
    });
  }

private handleAudioTrackSubscribed(
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant
): void {
  const elementId = `${participant.sid}-${publication.trackSid}`;
  const element = this.createAudioElement(elementId);
  track.attach(element);
  document.body.appendChild(element);
  
  this.mediaElements.set(elementId, {
    element,
    trackId: publication.trackSid,
    participantId: participant.sid,
    isLocal: false
  });
}
private demoteMainToThumbnail(currentMainElement: HTMLVideoElement): void {
  console.log('🔄 Demoting current main video to thumbnail');
  
  const elementId = currentMainElement.id;
  const mediaInfo = this.mediaElements.get(elementId);
  
  if (!mediaInfo) {
    console.log('❌ No media info found for current main element');
    return;
  }
  
  // Trouver l'info du participant
  let participantInfo: ParticipantInfo | undefined;
  
  if (mediaInfo.isLocal) {
    participantInfo = this.participantInfos.find(p => p.isLocal);
  } else {
    participantInfo = this.participantInfos.find(p => 
      !p.isLocal && p.participant.sid === mediaInfo.participantId
    );
  }
  
  if (participantInfo && this.mainVideoTrack) {
    // Créer une miniature dans la section du haut
    this.createTopThumbnail(participantInfo, this.mainVideoTrack);
  }
  
  console.log('✅ Main video demoted to thumbnail successfully');
}
private handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    const isProducerTrack = participant.identity === this.session?.producerId.toString();
    
    // Si c'est un track de receiver, mettre à jour ou supprimer la miniature
    if (!isProducerTrack && publication.source === Track.Source.Camera) {
      const participantInfo = this.participantInfos.find(p => 
        !p.isLocal && p.participant.sid === participant.sid
      );
      
      if (participantInfo) {
        this.createOrUpdateReceiverThumbnail(participantInfo); // Sans track = caméra fermée
      }
    }
    
    // Logique existante...
    const elementId = `${participant.sid}-${publication.trackSid}`;
    console.log(`🎬 Track unsubscribed: ${elementId}`);
    
    if (isProducerTrack && publication.source === Track.Source.ScreenShare) {
      console.log('🖥️ Producer screen share track unsubscribed');
      this.handleProducerScreenShareStopped();
    }
    
    this.removeMediaElement(elementId);

    if (track === this.mainVideoTrack) {
      console.log('📺 Main video track was removed, redetermining content...');
      this.mainVideoTrack = undefined;
      this.currentMainVideoSource = 'none';
      setTimeout(() => this.determineMainVideoContent(), 100);
    }
    
    if (isProducerTrack && publication.source === Track.Source.Camera) {
      this.clearProducerCameraThumbnailContainer();
    }
  }
  // Forcer la caméra des receivers à être fermée par défaut
private async initializeReceiverWithCameraOff(): Promise<void> {
  if (this.isHost) return;
  
  console.log('🔒 RECEIVER: Initializing with camera OFF by default');
  
  // Forcer l'état caméra fermée
  this.isVideoOff = true;
  
  // S'assurer que la caméra est désactivée dans LiveKit
  if (this.room) {
    try {
      await this.room.localParticipant.setCameraEnabled(false);
    } catch (error) {
      console.warn('Error ensuring camera is off:', error);
    }
  }
  
  // Créer la miniature en état fermé
  const localParticipantInfo = this.getLocalParticipantInfo();
  if (localParticipantInfo) {
    this.createOrUpdateReceiverThumbnail(localParticipantInfo); // Sans track = fermée
  }
}

  // ============================================================================
  // ===== GESTION DES TRACKS LOCAUX  =====
  // ============================================================================

private async handleLocalTrackPublished(publication: LocalTrackPublication): Promise<void> {
  if (!publication.track || publication.kind !== Track.Kind.Video) return;

  console.log(`🎬 Local track published: ${publication.source} (Host: ${this.isHost})`);

  try {
    if (this.isHost) {
      await this.handleProducerLocalTrack(publication);
    } else {
      // RECEIVER : Créer ou mettre à jour la miniature
      if (publication.source === Track.Source.Camera) {
        this.cameraTrack = publication.track as LocalVideoTrack;
        
        const localParticipantInfo = this.getLocalParticipantInfo();
        if (localParticipantInfo) {
          // Mettre à jour la miniature avec la track active
          this.createOrUpdateReceiverThumbnail(
            localParticipantInfo, 
            this.cameraTrack
          );
        }
        
        console.log('✅ RECEIVER: Camera track published and thumbnail updated');
      }
    }
  } catch (error) {
    console.error('Error handling local track published:', error);
  }

  // Ne déterminer le contenu principal que pour le producteur
  if (this.isHost) {
    setTimeout(() => this.determineMainVideoContent(), 200);
  }
}




 private async handleProducerLocalTrack(publication: LocalTrackPublication): Promise<void> {
    if (publication.source === Track.Source.ScreenShare) {
      console.log('🖥️ Producer: Screen share published');
      const elementId = `local-screen-${publication.trackSid}`;
      const element = this.createMainVideoElement(elementId, true);
      
      publication.track!.attach(element);
      
      this.mediaElements.set(elementId, {
        element,
        trackId: publication.trackSid,
        isLocal: true,
        source: Track.Source.ScreenShare
      });
      
      this.isScreenSharing = true;
      
      // Déplacer la caméra en PiP si elle existe
      if (this.cameraTrack && !this.isVideoOff) {
        await this.placeCameraInPiP();
      }
      
    } else if (publication.source === Track.Source.Camera) {
      console.log('📹 Producer: Camera published');
      this.cameraTrack = publication.track as LocalVideoTrack;
      await this.waitForTrackReady(this.cameraTrack);
      
      if (this.isScreenSharing) {
        await this.placeCameraInPiP();
      } else {
        await this.placeCameraInMain();
      }
    }
  }


private async handleReceiverLocalTrack(publication: LocalTrackPublication): Promise<void> {
  if (publication.source !== Track.Source.Camera) return;
  
  console.log('📹 RECEIVER: Setting up camera thumbnail (top section)');
  
  // Créer l'info participant local
  const localParticipantInfo: ParticipantInfo = {
    participant: this.room!.localParticipant as any,
    isProducer: false,
    name: this.currentUserId?.toString() || 'local',
    displayName: 'Vous',
    joinedAt: new Date(),
    userId: this.currentUserId,
    isLocal: true
  };
  
  // Créer la miniature dans la section du haut
  this.createTopThumbnail(localParticipantInfo, publication.track as LocalVideoTrack);
  
  this.cameraTrack = publication.track as LocalVideoTrack;
}

private createReceiverCameraThumbnail(id: string): HTMLVideoElement {
  const element = document.createElement('video');
  element.id = id;
  element.autoplay = true;
  element.playsInline = true;
  element.muted = true; // Toujours muted pour éviter l'écho
  
  // Style spécifique pour la caméra du receiver
  Object.assign(element.style, {
    width: '120px',
    height: '90px',
    objectFit: 'cover',
    backgroundColor: '#000',
    border: '2px solid #2196F3', // Bleu pour indiquer que c'est le receiver
    borderRadius: '8px',
    margin: '5px',
    cursor: 'not-allowed' // Indiquer qu'on ne peut pas cliquer
  });
  
  // Ajouter un label
  const label = document.createElement('div');
  label.textContent = 'Vous';
  label.style.cssText = `
    position: absolute;
    bottom: 2px;
    left: 2px;
    right: 2px;
    background: rgba(33, 150, 243, 0.8);
    color: white;
    font-size: 10px;
    text-align: center;
    border-radius: 0 0 6px 6px;
    padding: 2px;
  `;
  
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.appendChild(element);
  wrapper.appendChild(label);
  
  return element;
}

private handleLocalTrackUnpublished(publication: LocalTrackPublication): void {
  if (publication.source === Track.Source.ScreenShare) {
    const screenElementIds = Array.from(this.mediaElements.keys())
      .filter(id => {
        const info = this.mediaElements.get(id);
        return info?.isLocal && info.source === Track.Source.ScreenShare;
      });
    
    screenElementIds.forEach(id => this.removeMediaElement(id));
    this.isScreenSharing = false;
    console.log('🖥️ Screen share track unpublished');
    
    // Remettre la caméra en main si elle existe
    if (this.cameraTrack && !this.isVideoOff) {
      setTimeout(async () => {
        await this.placeCameraInMain();
        this.currentMainVideoSource = 'producer-camera';
        this.mainVideoTrack = this.cameraTrack;
      }, 200);
    } else {
      this.mainVideoTrack = undefined;
      setTimeout(() => this.determineMainVideoContent(), 200);
    }
    
  } else if (publication.source === Track.Source.Camera) {
    // Ne nettoyer la caméra que si pas de partage d'écran
    if (!this.isScreenSharing) {
      this.cleanupCameraElements();
      this.cameraTrack = undefined;
      console.log('📹 Camera track unpublished');
      
      if (this.mainVideoTrack && this.currentMainVideoSource === 'producer-camera') {
        this.mainVideoTrack = undefined;
        setTimeout(() => this.determineMainVideoContent(), 200);
      }
    }
  }
}


  // ============================================================================
  // ===== MÉTHODES DE POSITIONNEMENT CAMÉRA =====
  // ============================================================================

  private async placeCameraInMain(): Promise<void> {
  if (!this.cameraTrack || !this.isHost) {
    console.log('❌ Cannot place camera in main: no camera track or not host');
    return;
  }

  console.log('📹 Placing producer camera in main video');
  
  // Nettoyer d'abord l'ancien contenu principal
  this.clearMainVideo();
  this.cleanupCameraElements();
  
  const elementId = `local-camera-main-${Date.now()}`;
  const element = this.createMainVideoElement(elementId, true);
  
  try {
    this.cameraTrack.detach();
    this.cameraTrack.attach(element);
    
    // Ajouter au conteneur principal
    this.mainVideoContainer.nativeElement.appendChild(element);
    
    this.mediaElements.set(elementId, {
      element,
      trackId: this.cameraTrack.sid || 'camera-main',
      isLocal: true,
      source: Track.Source.Camera
    });
    
    // METTRE À JOUR LES RÉFÉRENCES PRINCIPALES
    this.mainVideoTrack = this.cameraTrack;
    this.currentMainVideoSource = 'producer-camera';
    
    console.log('✅ Producer camera placed in main view with updated references');
  } catch (error) {
    console.error('Error placing camera in main:', error);
  }
}

  private async placeCameraInPiP(): Promise<void> {
    if (!this.cameraTrack) return;

    this.cleanupCameraElements();
    
    const elementId = `local-camera-pip-${Date.now()}`;
    const element = this.createPiPElement(elementId, true);
    
    try {
      this.cameraTrack.detach();
      this.cameraTrack.attach(element);
      
      this.clearPipVideo();
      this.pipVideoContainer.nativeElement.appendChild(element);
      
      this.mediaElements.set(elementId, {
        element,
        trackId: this.cameraTrack.sid || 'camera-pip',
        isLocal: true,
        source: Track.Source.Camera
      });
      
      console.log('Camera placed in PiP');
    } catch (error) {
      console.error('Error placing camera in PiP:', error);
    }
  }


  // ============================================================================
  // ===== MÉTHODES UTILITAIRES ET VALIDATION =====
  // ============================================================================

  private isProducerTrack(elementId: string): boolean {
    const mediaInfo = this.mediaElements.get(elementId);
    if (!mediaInfo || !mediaInfo.participantId) return false;

    const participant = this.room?.remoteParticipants.get(mediaInfo.participantId);
    return participant?.identity === this.session?.producerId.toString();
  }

  private switchToMainVideo(elementId: string, element: HTMLVideoElement): void {
    console.log(`🔄 Switching to main video: ${elementId}`);
    
    // Sauvegarder l'ancienne vidéo principale
    const currentMainElement = this.mainVideoContainer.nativeElement.querySelector('video');
    if (currentMainElement && currentMainElement !== element) {
      this.moveToThumbnails(currentMainElement);
    }
    
    // Déplacer la nouvelle vidéo en principal
    this.moveToMainVideo(elementId, element);
    
    // Mettre à jour les références
    const mediaInfo = this.mediaElements.get(elementId);
    if (mediaInfo?.source === Track.Source.ScreenShare) {
      this.currentMainVideoSource = 'producer-screen';
    } else {
      this.currentMainVideoSource = 'producer-camera';
    }
  }

  private moveToMainVideo(elementId: string, element: HTMLVideoElement): void {
    // Retirer des miniatures si nécessaire
    if (element.parentNode === this.topThumbnailContainer.nativeElement) {
      this.topThumbnailContainer.nativeElement.removeChild(element);
    }
    
    // Appliquer le style mainVideo
    Object.assign(element.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      margin: '0',
      cursor: 'default',
      border: 'none'
    });
    
    // Ajouter au conteneur principal
    this.clearMainVideo();
    this.mainVideoContainer.nativeElement.appendChild(element);
    
    console.log(`✅ Video ${elementId} moved to main view`);
  }

private moveToThumbnails(element: HTMLVideoElement): void {
  // Retirer du conteneur principal
  if (element.parentNode === this.mainVideoContainer.nativeElement) {
    this.mainVideoContainer.nativeElement.removeChild(element);
  }
  
  // 🔥  Créer une miniature dans la section du haut
  // Trouver l'info du participant pour cet élément
  const elementId = element.id;
  const mediaInfo = this.mediaElements.get(elementId);
  
  if (mediaInfo) {
    // Trouver le participant correspondant
    let participantInfo: ParticipantInfo | undefined;
    
    if (mediaInfo.isLocal) {
      participantInfo = this.participantInfos.find(p => p.isLocal);
    } else {
      participantInfo = this.participantInfos.find(p => 
        !p.isLocal && p.participant.sid === mediaInfo.participantId
      );
    }
    
    if (participantInfo && this.mainVideoTrack) {
      // Créer une miniature dans la section du haut
      this.createTopThumbnail(participantInfo, this.mainVideoTrack);
    }
  }
  
  console.log('📺 Video moved to top thumbnails');
}

  // ============================================================================
  // ===== VALIDATION ET DEBUG =====
  // ============================================================================

  private validateState(): boolean {
    let isValid = true;
    const issues: string[] = [];

    // Vérifier que les tracks de receivers ne sont pas en mainVideo
    const mainVideoElement = this.mainVideoContainer.nativeElement.querySelector('video');
    if (mainVideoElement) {
      const elementId = mainVideoElement.id;
      if (this.receiverTracksBlacklist.has(elementId)) {
        issues.push('Receiver track in main video (VIOLATION)');
        isValid = false;
      }
    }

    // Vérifier la cohérence entre mainVideoTrack et currentMainVideoSource
    if (this.mainVideoTrack && this.currentMainVideoSource === 'none') {
      issues.push('Main video track exists but source is none');
      isValid = false;
    }

    if (!this.mainVideoTrack && this.currentMainVideoSource !== 'none') {
      issues.push('No main video track but source is not none');
      isValid = false;
    }

    if (!isValid) {
      console.error('🚨 STATE VALIDATION FAILED:');
      issues.forEach(issue => console.error(`  - ${issue}`));
      
      // Auto-correction
      console.log('🔧 Attempting auto-correction...');
      this.forceRedetermineMainVideo();
    }

    return isValid;
  }

  public forceRedetermineMainVideo(): void {
    console.log('🔧 FORCED redetermination requested');
    const startTime = performance.now();
    
    const beforeState = {
      mainVideoSource: this.currentMainVideoSource,
      hasMainContent: this.hasMainContent,
      mediaElementsCount: this.mediaElements.size
    };
    
    this.currentMainVideoSource = 'none';
    this.mainVideoTrack = undefined;
    this.determineMainVideoContent();
    
    const afterState = {
      mainVideoSource: this.currentMainVideoSource,
      hasMainContent: this.hasMainContent,
      mediaElementsCount: this.mediaElements.size
    };
    
    const duration = performance.now() - startTime;
    
    console.log('🔧 Forced redetermination completed:', {
      duration: `${duration.toFixed(2)}ms`,
      before: beforeState,
      after: afterState,
      changed: JSON.stringify(beforeState) !== JSON.stringify(afterState)
    });
    
    this.showNotification('Contenu principal redéterminé', 'success');
  }

  public logCurrentState(): void {
    const state = {
      timestamp: new Date().toISOString(),
      session: {
        id: this.sessionId,
        isHost: this.isHost,
        isConnected: this.isConnected
      },
      content: {
        currentMainVideoSource: this.currentMainVideoSource,
        hasMainContent: this.hasMainContent,
        mainContentType: this.mainContentType,
        mainVideoTrackId: this.mainVideoTrack?.sid
      },
      media: {
        isScreenSharing: this.isScreenSharing,
        isVideoOff: this.isVideoOff,
        isMuted: this.isMuted,
        cameraTrackId: this.cameraTrack?.sid
      },
      participants: {
        total: this.participantInfos.length,
        viewers: this.totalParticipants,
        list: this.participantInfos.map(p => ({
          name: p.displayName,
          isProducer: p.isProducer,
          isLocal: p.isLocal
        }))
      },
      technical: {
        mediaElementsCount: this.mediaElements.size,
        receiverTracksBlacklistCount: this.receiverTracksBlacklist.size,
        roomState: this.room?.state
      }
    };
    
    console.log('🔍 COMPLETE STATE DUMP:', state);
    
    if (this.isDevelopment) {
      console.table(state.content);
      console.table(state.participants);
    }
  }

  private clearAllReceiverThumbnails(): void {
    console.log('🧹 Clearing all receiver thumbnails...');

    Array.from(this.receiverThumbnails.keys()).forEach(id => {
      this.removeReceiverThumbnail(id);
    });

    this.receiverThumbnails.clear();

    // Supprimer le conteneur s'il est vide
    const container = document.getElementById('receiver-thumbnails-container');
    if (container) {
      container.remove();
    }
  } private removeReceiverThumbnail(thumbnailId: string): void {
    const thumbnailInfo = this.receiverThumbnails.get(thumbnailId);
    if (!thumbnailInfo) return;

    try {
      // Détacher la track
      if (thumbnailInfo.track) {
        thumbnailInfo.track.detach(thumbnailInfo.element);
      }

      // Retirer du DOM
      if (thumbnailInfo.wrapper.parentNode) {
        thumbnailInfo.wrapper.parentNode.removeChild(thumbnailInfo.wrapper);
      }

      // Supprimer des maps
      this.receiverThumbnails.delete(thumbnailId);
      this.mediaElements.delete(thumbnailId);

    } catch (error) {
      console.error(`Error removing receiver thumbnail ${thumbnailId}:`, error);
    }
  }

async toggleVideo(): Promise<void> {
  if (!this.room) return;
  
  try {
    if (!this.isHost) {
      // RECEIVER : Gérer le toggle de manière plus robuste
      const wasVideoOff = this.isVideoOff;
      this.isVideoOff = !this.isVideoOff;
      
      console.log(`📹 RECEIVER: Toggling camera from ${wasVideoOff ? 'OFF' : 'ON'} to ${this.isVideoOff ? 'OFF' : 'ON'}`);
      
      if (this.isVideoOff) {
        // Désactiver la caméra
        console.log('📹 RECEIVER: Turning camera OFF');
        
        // D'abord détacher les tracks existantes
        if (this.cameraTrack) {
          try {
            this.cameraTrack.detach();
          } catch (e) {
            console.log('Camera track already detached');
          }
        }
        
        // Ensuite désactiver dans LiveKit
        await this.room.localParticipant.setCameraEnabled(false);
        this.cameraTrack = undefined;
        
        // Mettre à jour la miniature pour montrer "caméra fermée"
        const localParticipantInfo = this.getLocalParticipantInfo();
        if (localParticipantInfo) {
          this.createOrUpdateReceiverThumbnail(localParticipantInfo); // Sans track = fermée
        }
        
        this.showNotification('Votre caméra est fermée');
        
      } else {
        // Activer la caméra
        console.log('📹 RECEIVER: Turning camera ON');
        
        try {
          // Activer la caméra dans LiveKit
          await this.room.localParticipant.setCameraEnabled(true);
          
          // Attendre que la track soit publiée
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Récupérer la nouvelle track
          await this.refreshCameraTrackForReceiver();
          
          // Si on a réussi à récupérer la track, mettre à jour la miniature
          if (this.cameraTrack) {
            const localParticipantInfo = this.getLocalParticipantInfo();
            if (localParticipantInfo) {
              this.createOrUpdateReceiverThumbnail(localParticipantInfo, this.cameraTrack);
            }
            this.showNotification('Votre caméra est activée');
          } else {
            throw new Error('Failed to get camera track');
          }
          
        } catch (error) {
          console.error('❌ Error enabling camera:', error);
          // Revenir à l'état précédent en cas d'erreur
          this.isVideoOff = true;
          await this.room.localParticipant.setCameraEnabled(false);
          this.showNotification('Erreur lors de l\'activation de la caméra', 'error');
          
          // S'assurer que la miniature montre l'état fermé
          const localParticipantInfo = this.getLocalParticipantInfo();
          if (localParticipantInfo) {
            this.createOrUpdateReceiverThumbnail(localParticipantInfo);
          }
        }
      }
      
      this.cdr.detectChanges();
      return;
    }
    
    // PRODUCER : Code existant (inchangé)
    this.isVideoOff = !this.isVideoOff;
    
    if (this.isVideoOff) {
      console.log('📹 PRODUCER: Turning camera OFF');
      this.cleanupCameraElements();
      await this.room.localParticipant.setCameraEnabled(false);
      this.cameraTrack = undefined;
      this.showNotification('Caméra désactivée');
      
      if (this.currentMainVideoSource === 'producer-camera') {
        setTimeout(() => this.determineMainVideoContent(), 200);
      }
    } else {
      console.log('📹 PRODUCER: Turning camera ON');
      await this.room.localParticipant.setCameraEnabled(true);
      this.showNotification('Caméra activée');
      
      setTimeout(async () => {
        await this.refreshCameraTrack();
        if (this.cameraTrack) {
          if (this.isScreenSharing) {
            await this.placeCameraInPiP();
          } else {
            await this.placeCameraInMain();
          }
        }
      }, 500);
    }
  } catch (error) {
    console.error('Error toggling video:', error);
    this.isVideoOff = !this.isVideoOff;
    this.showNotification('Erreur lors de la commutation de la caméra', 'error');
  }
}
private async refreshCameraTrackForReceiver(): Promise<void> {
  if (!this.room || this.isHost) return;
  
  console.log('🔄 RECEIVER: Refreshing camera track...');
  
  const localVideoTracks = this.room.localParticipant.videoTrackPublications;
  let foundCameraTrack = false;
  
  // Chercher la publication de la caméra
  for (const [key, publication] of localVideoTracks) {
    if (publication.source === Track.Source.Camera && publication.track) {
      this.cameraTrack = publication.track as LocalVideoTrack;
      foundCameraTrack = true;
      console.log('✅ RECEIVER: Camera track found and refreshed');
      break;
    }
  }
  
  if (!foundCameraTrack) {
    console.log('⚠️ RECEIVER: No camera track found after refresh');
    this.cameraTrack = undefined;
  }
}
  
 async toggleScreenShare(): Promise<void> {
  if (!this.room || !this.isHost) return;

  try {
    if (this.isScreenSharing) {
      // Arrêter le partage d'écran
      await this.stopScreenShareSafely();
      
      // La caméra doit retourner en main video
      if (this.cameraTrack && !this.isVideoOff) {
        setTimeout(async () => {
          await this.placeCameraInMain();
        }, 500);
      }
      
    } else {
      // Démarrer le partage d'écran
      await this.startScreenShareSafely();
      
      // La caméra doit aller en PiP
      if (this.cameraTrack && !this.isVideoOff) {
        setTimeout(async () => {
          await this.placeCameraInPiP();
        }, 500);
      }
    }
  } catch (error) {
    console.error('Error toggling screen share:', error);
    this.showNotification('Erreur lors du partage d\'écran', 'error');
    this.isScreenSharing = false;
  }
}



private async stopScreenShareSafely(): Promise<void> {
    // Sauvegarder l'état de la caméra AVANT d'arrêter le partage
    const wasCameraOff = this.isVideoOff;
    
    await this.livestreamService.stopScreenShare(this.room!);
    this.isScreenSharing = false;
    this.showNotification('Screen sharing stopped');
    
    this.clearPipVideo();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Restaurer la caméra SEULEMENT si elle était activée
    if (!wasCameraOff) {
      await this.restoreCameraToMain();
    } else {
      // Si la caméra était fermée, s'assurer qu'elle reste fermée
      console.log('📹 Camera was OFF, keeping it OFF after screen share stop');
      this.determineMainVideoContent();
    }
  }


  private async startScreenShareSafely(): Promise<void> {
    this.screenSharePublication = await this.livestreamService.startScreenShare(this.room!);
    this.isScreenSharing = true;
    this.showNotification('Screen sharing started');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.moveCameraToPiP();
  }
private async restoreCameraToMain(): Promise<void> {
  if (!this.isVideoOff) {
    await this.room!.localParticipant.setCameraEnabled(true);
  }
  
  await new Promise(resolve => setTimeout(resolve, 500)); // Délai plus long
  
  if (this.cameraTrack) {
    await this.placeCameraInMain();
    //  S'assurer que les références sont mises à jour
    this.currentMainVideoSource = 'producer-camera';
    this.mainVideoTrack = this.cameraTrack;
    console.log('✅ Camera restored to main after screen share');
  } else {
    await this.reactivateCamera();
  }
}private async handleCameraTrack(publication: LocalTrackPublication): Promise<void> {
  this.cameraTrack = publication.track as LocalVideoTrack;
  console.log('📹 Camera track published, isScreenSharing:', this.isScreenSharing);
  
  await this.waitForTrackReady(this.cameraTrack);
  
  if (this.isScreenSharing) {
    await this.placeCameraInPiP();
  } else {
    await this.placeCameraInMain();
    //  Mettre à jour les références après publication
    this.currentMainVideoSource = 'producer-camera';
    this.mainVideoTrack = this.cameraTrack;
    console.log('✅ Camera published and set as main video');
  }
}

private async reactivateCamera(): Promise<void> {
    if (!this.room) return;
    
    try {
      console.log('Reactivating camera...');
      
      await this.room.localParticipant.setCameraEnabled(false);
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.room.localParticipant.setCameraEnabled(true);
      
      setTimeout(async () => {
        await this.refreshCameraTrack();
        if (this.cameraTrack) {
          await this.placeCameraInMain();
          console.log('Camera successfully reactivated');
        } else {
          console.error('Failed to reactivate camera');
          this.showNotification('Failed to reactivate camera - please try manually');
        }
      }, 800);
      
    } catch (error) {
      console.error('Error reactivating camera:', error);
      this.showNotification('Camera reactivation failed');
    }
  }

  private async moveCameraToPiP(): Promise<void> {
    if (this.cameraTrack) {
      await this.placeCameraInPiP();
    }
  }

  async toggleMute(): Promise<void> {
    if (!this.room) return;
    
    try {
      this.isMuted = !this.isMuted;
      await this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);
      this.showNotification(this.isMuted ? 'Microphone coupé' : 'Microphone activé');
    } catch (error) {
      console.error('Error toggling mute:', error);
      this.isMuted = !this.isMuted;
      this.showNotification('Erreur lors de la commutation du microphone', 'error');
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
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      this.showNotification('Erreur lors du passage en plein écran', 'error');
    }
  }

  // ============================================================================
  // ===== ÉLÉMENTS VIDÉO =====
  // ============================================================================

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
    
    element.addEventListener('click', this.handleVideoClick);
    
    return element;
  }

  private createAudioElement(id: string): HTMLAudioElement {
    const element = document.createElement('audio');
    element.id = id;
    element.autoplay = true;
    element.hidden = true;
    return element;
  }

  // ============================================================================
  // ===== CLEANUP =====
  // ============================================================================

  private clearMainVideo(): void {
    while (this.mainVideoContainer.nativeElement.firstChild) {
      this.mainVideoContainer.nativeElement.removeChild(
        this.mainVideoContainer.nativeElement.firstChild
      );
    }
  }

  private clearPipVideo(): void {
    if (!this.pipVideoContainer?.nativeElement) {
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


  private removeMediaElement(elementId: string): void {
    const info = this.mediaElements.get(elementId);
    if (info) {
      try {
        if (info.element instanceof HTMLVideoElement) {
          info.element.pause();
          info.element.srcObject = null;
        }
        
        info.element.removeEventListener('click', this.handleVideoClick);
        
        if (info.element.parentNode) {
          info.element.parentNode.removeChild(info.element);
        }
      } catch (error) {
        console.warn(`Error removing element ${elementId}:`, error);
      }
      
      this.mediaElements.delete(elementId);
      this.receiverTracksBlacklist.delete(elementId);
    }
  }

  private cleanupCameraElements(): void {
    const cameraElementIds = Array.from(this.mediaElements.keys())
      .filter(id => {
        const info = this.mediaElements.get(id);
        return info?.isLocal && info.source === Track.Source.Camera;
      });
    
    cameraElementIds.forEach(id => {
      const info = this.mediaElements.get(id);
      if (info && this.cameraTrack) {
        try {
          this.cameraTrack.detach(info.element);
        } catch (e) {
          console.log('Track already detached');
        }
      }
      this.removeMediaElement(id);
    });
  }

  //  Mettre à jour la méthode de nettoyage globale
private cleanupAllMediaElements(): void {
  // Nettoyer les nouvelles miniatures
  this.clearAllTopThumbnails();
  
  // Nettoyer les anciens éléments média
  this.mediaElements.forEach((info, id) => {
    try {
      if (info.isLocal && this.cameraTrack && info.source === Track.Source.Camera) {
        this.cameraTrack.detach(info.element);
      }
      
      if (info.element instanceof HTMLVideoElement) {
        info.element.pause();
        info.element.srcObject = null;
      }
      
      if (info.element.parentNode) {
        info.element.parentNode.removeChild(info.element);
      }
    } catch (error) {
      console.warn(`Error cleaning up element ${id}:`, error);
    }
  });
  
  this.mediaElements.clear();
  this.mainVideoTrack = undefined;
  this.cameraTrack = undefined;
  this.currentMainVideoSource = 'none';
}

  // ============================================================================
  // ===== GETTERS PUBLICS POUR LE TEMPLATE =====
  // ============================================================================

  get hasMainContent(): boolean {
    return this.isConnected && this.currentMainVideoSource !== 'none';
  }

  get mainContentType(): string {
    switch (this.currentMainVideoSource) {
      case 'producer-screen': return 'Partage d\'écran';
      case 'producer-camera': return 'Caméra du producteur';
      default: return 'Aucun contenu';
    }
  }

  get canInteractWithThumbnails(): boolean {
    return this.isConnected && (this.isHost || this.currentMainVideoSource !== 'none');
  }

get helpMessage(): string {
  if (!this.isConnected) {
    return 'En attente de connexion...';
  }
  
  if (this.isHost) {
    if (this.currentMainVideoSource === 'none') {
      return 'Activez votre caméra ou partagez votre écran pour commencer';
    }
    return 'Gérez votre diffusion avec les contrôles';
  } else {
    // Messages spécifiques pour receivers
    if (this.currentMainVideoSource === 'none') {
      return 'En attente du contenu du producteur...';
    }
    
    switch (this.currentMainVideoSource) {
      case 'producer-screen':
        return 'Vous regardez le partage d\'écran du producteur.';
      case 'producer-camera':
        return 'Vous regardez la caméra du producteur.';
      default:
        return 'Vous regardez la diffusion en direct.';
    }
  }
}


 getVideoToggleTooltip(): string {
  if (!this.isHost) {
    if (this.isVideoOff) {
      return 'Activer votre caméra (apparaîtra en miniature à droite)';
    } else {
      return 'Désactiver votre caméra (miniature seulement)';
    }
  }
  
  // Pour le producteur (logique existante)
  if (this.isVideoOff) {
    return 'Activer la caméra - apparaîtra en grand ou en PiP selon le partage d\'écran';
  } else {
    return 'Désactiver la caméra';
  }
}


  get canUseFullscreen(): boolean {
    return this.hasMainContent && !this.isHost && 'requestFullscreen' in document.documentElement;
  }

  trackParticipant(index: number, participant: ParticipantInfo): string {
    return participant.isLocal ? 'local' : participant.participant.sid;
  }
private validateReceiverState(): boolean {
  if (this.isHost) return true;
  
  let isValid = true;
  const issues: string[] = [];
  
  // Vérifier que le receiver voit bien le contenu du producteur
  if (this.isConnected) {
    const producerParticipant = this.findRemoteProducerParticipant();
    
    if (producerParticipant) {
      const hasProducerScreenShare = this.findProducerRemoteScreenShare(producerParticipant);
      const hasProducerCamera = this.findProducerRemoteCamera(producerParticipant);
      
      if (hasProducerScreenShare && this.currentMainVideoSource !== 'producer-screen') {
        issues.push('Producer has screen share but not displayed in main');
        isValid = false;
      } else if (!hasProducerScreenShare && hasProducerCamera && this.currentMainVideoSource !== 'producer-camera') {
        issues.push('Producer has camera but not displayed in main');
        isValid = false;
      }
    }
  }
  
  // Vérifier que la caméra du receiver n'est jamais en principal
  const mainVideoElement = this.mainVideoContainer.nativeElement.querySelector('video');
  if (mainVideoElement) {
    const mediaInfo = this.mediaElements.get(mainVideoElement.id);
    if (mediaInfo?.isLocal) {
      issues.push('CRITICAL: Receiver camera in main video');
      isValid = false;
    }
  }
  
  
  if (!isValid) {
    console.error('🚨 RECEIVER STATE VALIDATION FAILED:');
    issues.forEach(issue => console.error(` - ${issue}`));
    this.forceReceiverStateCorrection();

    // ✅ Ajout : recréer la miniature si nécessaire
    setTimeout(() => this.checkAndCreateMissingProducerCameraThumbnail(), 1000);
  }

  return isValid;

}

 private forceReceiverStateCorrection(): void {
  if (this.isHost) return;
  
  console.log('🔧 FORCING receiver state correction...');
  
  // 1. Nettoyer le contenu principal s'il y a du contenu local
  const mainElement = this.mainVideoContainer.nativeElement.querySelector('video');
  if (mainElement) {
    const mediaInfo = this.mediaElements.get(mainElement.id);
    if (mediaInfo?.isLocal) {
      console.log('🚨 Removing receiver content from main video');
      this.clearMainVideo();
    }
  }
  
  // 2. Nettoyer les containers miniatures inappropriés
  this.clearProducerCameraThumbnailContainer();
  
  // 3. Forcer la recherche du contenu producteur
  this.findAndDisplayProducerContent();
  
  // 4. S'assurer que la caméra du receiver est bien en miniature
  if (this.cameraTrack && !this.isVideoOff) {
    this.cleanupReceiverCameraElements();
    setTimeout(() => {
      this.handleReceiverLocalTrack({
        track: this.cameraTrack!,
        trackSid: this.cameraTrack!.sid,
        source: Track.Source.Camera
      } as unknown as LocalTrackPublication);
    }, 100);
  }
  
  console.log('✅ Receiver state correction completed');
}
private async finalizeConnectionByRole(): Promise<void> {
  this.isConnected = true;
  this.showStartButton = false;
  this.streamStartTime = new Date();
  this.startStreamTimer();
  
  // IMPORTANT: Scanner TOUS les participants existants IMMÉDIATEMENT
  await this.scanAllExistingParticipants();
  
  if (this.isHost) {
    console.log('🎭 PRODUCER: Setting up producer environment');
    this.startQualityMonitoring();
    this.addLocalParticipantToList();
    
    if (!this.isScreenSharing && this.cameraTrack && !this.isVideoOff) {
      await this.placeCameraInMain();
      this.currentMainVideoSource = 'producer-camera';
      this.mainVideoTrack = this.cameraTrack;
    }
    
    // Afficher le nombre de spectateurs connectés
    const viewerCount = this.participantInfos.filter(p => !p.isProducer).length;
    if (viewerCount > 0) {
      this.showNotification(`${viewerCount} spectateur${viewerCount > 1 ? 's' : ''} déjà connecté${viewerCount > 1 ? 's' : ''}`, 'success');
    }
    
    this.showNotification('Producteur connecté - Prêt à diffuser');
    
  } else {
    console.log('👀 RECEIVER: Setting up viewer environment');
    
    await this.initializeReceiverWithCameraOff();
    this.addLocalParticipantToList();
    this.showNotification('Connecté en tant que spectateur');
    
    setTimeout(() => {
      const localParticipantInfo = this.getLocalParticipantInfo();
      if (localParticipantInfo) {
        this.createOrUpdateReceiverThumbnail(localParticipantInfo);
      }
      
      this.findAndDisplayProducerContent();
      
      setTimeout(() => {
        this.checkAndCreateMissingProducerCameraThumbnail();
        this.validateDisplayState();
      }, 2000);
    }, 500);
  }
}
private scanAndCreateExistingReceiverThumbnails(): void {
  if (!this.isHost || !this.room) return;
  
  console.log('🔍 PRODUCER: Scanning for existing receivers...');
  
  // Parcourir tous les participants distants
  const remoteParticipants = Array.from(this.room.remoteParticipants.values());
  
  remoteParticipants.forEach(participant => {
    // Ignorer le producteur lui-même (ne devrait pas arriver mais par sécurité)
    if (participant.identity === this.session?.producerId.toString()) {
      console.log(`⏭️ Skipping producer participant: ${participant.identity}`);
      return;
    }
    
    console.log(`👤 Found receiver participant: ${participant.identity}`);
    
    // Créer ou mettre à jour l'info du participant
    let participantInfo = this.participantInfos.find(p => 
      !p.isLocal && p.participant.sid === participant.sid
    );
    
    if (!participantInfo) {
      participantInfo = {
        participant,
        isProducer: false,
        name: participant.identity,
        displayName: participant.identity,
        joinedAt: new Date(),
        userId: this.extractUserIdFromIdentity(participant.identity),
        isLocal: false
      };
      
      this.participantInfos.push(participantInfo);
      this.updateParticipantCounts();
      
      // Charger le nom d'affichage
      this.loadParticipantDisplayName(participantInfo);
    }
    
    // Attendre un peu pour que le nom soit chargé
    setTimeout(() => {
      // Chercher si le participant a une caméra active
      let cameraTrack: RemoteTrack | undefined;
      
      participant.videoTrackPublications.forEach(publication => {
        if (publication.source === Track.Source.Camera && publication.track) {
          cameraTrack = publication.track;
          console.log(`📹 Receiver ${participant.identity} has active camera`);
        }
      });
      
      // Créer la miniature (avec ou sans track selon l'état de la caméra)
      const thumbnailId = `remote-receiver-thumbnail-${participant.sid}`;
      
      // Vérifier si la miniature existe déjà
      if (!this.receiverThumbnails.has(thumbnailId)) {
        console.log(`📦 Creating thumbnail for receiver: ${participant.identity}`);
        this.createOrUpdateReceiverThumbnail(participantInfo, cameraTrack);
      } else {
        console.log(`✅ Thumbnail already exists for: ${participant.identity}`);
        // Mettre à jour si nécessaire
        this.createOrUpdateReceiverThumbnail(participantInfo, cameraTrack);
      }
    }, 1000);
  });
  
  const receiverCount = remoteParticipants.filter(p => 
    p.identity !== this.session?.producerId.toString()
  ).length;
  
  console.log(`✅ PRODUCER: Found ${receiverCount} receiver(s) to create thumbnails for`);
}
private getLocalParticipantInfo(): ParticipantInfo | undefined {
 return this.participantInfos.find(p => p.isLocal);
}
private logProducerTracksInfo(): void {
  if (this.isHost) return;
  
  const producerParticipant = this.findRemoteProducerParticipant();
  if (!producerParticipant) {
    console.log('🔍 DEBUG: No producer participant found');
    return;
  }
  
  console.log('🔍 DEBUG: Producer tracks info:', {
    participantSid: producerParticipant.sid,
    identity: producerParticipant.identity,
    videoTracksCount: producerParticipant.videoTrackPublications.size,
    tracks: Array.from(producerParticipant.videoTrackPublications.values()).map(pub => ({
      trackSid: pub.trackSid,
      source: pub.source,
      isSubscribed: pub.isSubscribed,
      hasTrack: !!pub.track
    }))
  });
}
  // ============================================================================
  // ===== INITIALISATION ET SETUP =====
  // ============================================================================
private async initializeSession(): Promise<void> {
  this.sessionId = Number(this.route.snapshot.paramMap.get('sessionId'));
  if (isNaN(this.sessionId)) {
    throw new Error('Invalid session ID');
  }
  
  const [currentUser, session] = await Promise.all([
    firstValueFrom(this.userService.getCurrentUserProfile()),
    firstValueFrom(this.livestreamService.getSession(this.sessionId))
  ]);

  if (!currentUser || !session) {
    throw new Error('Failed to load session data');
  }
  
  this.session = session;
  this.currentUserId = currentUser.id;
  this.currentUsername = currentUser.username || `${currentUser.firstName} ${currentUser.lastName}`;
  this.isHost = currentUser.id === session.producerId;
  
  // AJOUTER : Charger le nom de la compétence
  if (session.skillId) {
    try {
      const exchanges = await firstValueFrom(
        this.exchangeService.getExchangesBySkillId(session.skillId)
      );
      
      if (exchanges && exchanges.length > 0) {
        this.skillName = exchanges[0].skillName;
        console.log('Skill name loaded:', this.skillName);
      }
    } catch (error) {
      console.log('Could not load skill name:', error);
      // Fallback : utiliser roomName si pas de skillName
      this.skillName = session.roomName;
    }
  }
  
  console.log('Session initialized:', {
    sessionId: session.id,
    skillName: this.skillName, // Ajouter pour debug
    status: session.status,
    isHost: this.isHost,
    userId: currentUser.id,
    producerId: session.producerId
  });

  this.validateSessionAccess(session);
  if (!this.isHost) {
    this.listenForSessionEnd();
  }
}

  private validateSessionAccess(session: LivestreamSession): void {
    if (this.isHost) {
      if (!['LIVE', 'SCHEDULED'].includes(session.status)) {
        this.showNotification(`Session status is ${session.status} - cannot join`);
        this.navigateToSkillsPage();
        return;
      }
    } else {
      if (session.status !== 'LIVE') {
        this.showNotification(`Session is ${session.status} - only live sessions can be joined`);
        this.navigateToSkillsPage();
        return;
      }
    }
  }

  private setupFullscreenListeners(): void {
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleKeyboardShortcut);
  }

  private removeKeyboardShortcuts(): void {
    document.removeEventListener('keydown', this.handleKeyboardShortcut);
  }

  private setupWindowFocusListeners(): void {
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private removeWindowFocusListeners(): void {
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);
  }

  // ============================================================================
  // ===== MÉTRIQUES ET ACCESSIBILITÉ =====
  // ============================================================================

  private startMetricsCollection(): void {
    if (!this.isDevelopment) {
      setInterval(() => {
        const metrics = {
          timestamp: new Date(),
          sessionId: this.sessionId,
          isHost: this.isHost,
          participantCount: this.participantInfos.length,
          viewerCount: this.totalParticipants,
          hasMainContent: this.hasMainContent,
          mainContentType: this.currentMainVideoSource,
          mediaElementsCount: this.mediaElements.size,
          isScreenSharing: this.isScreenSharing,
          isChatConnected: this.isChatConnected,
          connectionState: this.room?.state,
          streamDuration: this.streamDuration
        };
        console.log('📊 Metrics collected:', metrics);
      }, 30000);
    }
  }

  private handleAccessibilityStateChange(oldState: string, newState: string): void {
    if (oldState !== newState) {
      let message = '';
      
      switch (newState) {
        case 'producer-screen':
          message = 'Le producteur partage maintenant son écran';
          break;
        case 'producer-camera':
          message = 'Affichage de la caméra du producteur';
          break;
        case 'none':
          message = 'En attente du contenu du producteur';
          break;
      }
      
      if (message) {
        this.announceToScreenReader(message);
      }
    }
  }

  private announceToScreenReader(message: string): void {
    const announcer = document.getElementById('screen-reader-announcements');
    if (announcer) {
      announcer.textContent = message;
      
      setTimeout(() => {
        announcer.textContent = '';
      }, 5000);
    }
  }

  // ============================================================================
  // ===== AUTRES MÉTHODES NÉCESSAIRES =====
  // ============================================================================

 //  Mettre à jour la méthode ensureVideoContainers
private ensureVideoContainers(): void {
  const containers = [
    { ref: 'mainVideoContainer', selector: '.main-video-wrapper', className: 'main-video' },
    { ref: 'topThumbnailContainer', selector: '.top-thumbnails-container', className: 'top-thumbnails-container' },
    { ref: 'pipVideoContainer', selector: '.pip-container', className: 'pip-video' }
  ];

  containers.forEach(({ ref, selector, className }) => {
    const containerRef = this[ref as keyof this] as ElementRef;
    
    if (!containerRef?.nativeElement) {
      this.createContainer(selector, className, ref);
    }
  });
}


  private createContainer(selector: string, className: string, ref: string): void {
    const wrapper = document.querySelector(selector);
    if (wrapper) {
      const container = document.createElement('div');
      container.className = className;
      wrapper.appendChild(container);
      this[ref as keyof this] = { nativeElement: container } as any;
    } else {
      console.warn(`Wrapper not found for ${selector}, creating fallback`);
      this.createFallbackContainer(selector, className, ref);
    }
  }
private createFallbackContainer(selector: string, className: string, ref: string): void {
    const parentElement = document.querySelector('.stream-content') || document.body;
    const wrapper = document.createElement('div');
    wrapper.className = selector.replace('.', '');
    
    const container = document.createElement('div');
    container.className = className;
    wrapper.appendChild(container);
    parentElement.appendChild(wrapper);
    
    this[ref as keyof this] = { nativeElement: container } as any;
    console.log(`Created fallback container for ${ref}`);
  }




  private async waitForTrackReady(track: LocalVideoTrack): Promise<void> {
    return new Promise((resolve) => {
      if (track.mediaStreamTrack.readyState === 'live') {
        resolve();
      } else {
        const onUnmute = () => {
          track.mediaStreamTrack.removeEventListener('unmute', onUnmute);
          resolve();
        };
        track.mediaStreamTrack.addEventListener('unmute', onUnmute);
        
        setTimeout(() => {
          track.mediaStreamTrack.removeEventListener('unmute', onUnmute);
          resolve();
        }, 2000);
      }
    });
  }

  private async refreshCameraTrack(): Promise<void> {
    if (!this.room) return;
    
    console.log('Refreshing camera track...');
    
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
      console.log('No camera track found');
      this.cameraTrack = undefined;
    }
  }

  private async getConnectionToken(): Promise<{ token: string; role: 'producer' | 'viewer' }> {
    if (this.isHost) {
      console.log('Using producer token from session');
      const token = this.session!.producerToken;
      return { token, role: 'producer' };
    } else {
      console.log('Requesting viewer token...');
      const token = await firstValueFrom(
        this.livestreamService.joinSession(this.sessionId)
      );
      return { token, role: 'viewer' };
    }
  }

  private async connectToRoom(token: string, role: 'producer' | 'viewer'): Promise<void> {
    if (this.room && this.room.state !== ConnectionState.Disconnected) {
      console.log('Cleaning up existing room connection...');
      await this.room.disconnect();
      this.room = undefined;
    }

    this.room = await this.livestreamService.connectToRoom(
      this.session!.roomName, 
      token,
      this.isHost
    );

    this.setupRoomListeners();
  }

  private async setupMediaWithRetry(maxRetries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.setupMedia();
        console.log(`Media setup successful on attempt ${attempt}`);
        return;
      } catch (error) {
        console.warn(`Media setup attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt === maxRetries) {
          if (this.isHost) {
            throw new Error('Producer must have camera and microphone access');
          } else {
            this.showNotification('Media access limited - you can still view the stream');
            return;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

 private async setupMedia(): Promise<void> {
  if (!this.room) return;

  try {
    if (this.isHost) {
      console.log('Setting up producer media (camera + microphone)...');
      await this.room.localParticipant.enableCameraAndMicrophone();
      console.log('Producer media setup completed');
    } else {
      console.log('Setting up receiver media (camera OFF by default)...');
      
      // IMPORTANT: Activer seulement le microphone pour les receivers
      try {
        // Activer uniquement le microphone
        await this.room.localParticipant.setMicrophoneEnabled(true);
        
        // S'assurer que la caméra est désactivée
        await this.room.localParticipant.setCameraEnabled(false);
        this.isVideoOff = true;
        
        console.log('Receiver media setup completed (mic only, camera OFF)');
      } catch (err) {
        console.log('Receiver media access denied, continuing as viewer-only');
      }
    }
  } catch (err) {
    console.error('Media access error:', err);
    
    if (this.isHost) {
      throw new Error('Producer must have camera and microphone access');
    } else {
      this.showNotification('Accès média limité - vous pouvez toujours voir le stream');
    }
  }
}


  private resetConnectionState(): void {
    this.error = undefined;
    this.reconnectionAttempts = 0;
  }

  private validateToken(token: string, role: 'producer' | 'viewer'): boolean {
    if (!token || token.trim().length === 0) {
      console.error(`Empty ${role} token`);
      return false;
    }
    
    if (token.length < 50) {
      console.warn(`${role} token seems unusually short:`, token.length, 'characters');
    }
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.error(`Invalid JWT format for ${role} token`);
        return false;
      }
      
      const payload = JSON.parse(atob(parts[1]));
      
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        console.error(`${role} token has expired`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Error validating ${role} token:`, error);
      return false;
    }
  }

  private finalizeConnection(): void {
    this.isConnected = true;
    this.showStartButton = false;
    this.streamStartTime = new Date();
    this.startStreamTimer();
    this.startQualityMonitoring();
    
    this.addLocalParticipantToList();
    
    this.showNotification('Successfully connected to livestream');
  }

  private startQualityMonitoring(): void {
    if (!this.room) return;

    const qualityCheckInterval = setInterval(() => {
      if (!this.room || !this.isConnected) {
        clearInterval(qualityCheckInterval);
        return;
      }

      const connectionState = this.room.state;
      const participantCount = this.room.numParticipants;
      
      if (connectionState === ConnectionState.Connected && participantCount > 0) {
        console.log('Connection quality monitoring: Good connection detected');
      } else if (connectionState === ConnectionState.Reconnecting) {
        console.log('Connection quality monitoring: Reconnecting...');
      }
      
    }, 5000);
  }

  private addLocalParticipantToList(): void {
    if (!this.room || !this.currentUserId) return;
    
    try {
      const existingLocal = this.participantInfos.find(p => 
        p.isLocal === true
      );
      
      if (existingLocal) return;
      
      const localParticipantInfo: ParticipantInfo = {
        participant: this.room.localParticipant as any,
        isProducer: this.isHost,
        name: this.currentUserId.toString(),
        displayName: this.isHost ? 'Vous' : 'Vous', // Temporaire, sera mis à jour
        joinedAt: new Date(),
        userId: this.currentUserId,
        isLocal: true
      };
      
      try {
        firstValueFrom(this.userService.getUserById(this.currentUserId)).then(user => {
          let displayName = '';
          
          // Construire le nom d'affichage
          if (user.firstName && user.lastName) {
            displayName = `${user.firstName} ${user.lastName}`;
          } else if (user.firstName) {
            displayName = user.firstName;
          } else if (user.username) {
            displayName = user.username;
          } else {
            displayName = 'Utilisateur';
          }
          
          // Ajouter "(Vous)" seulement pour les receivers (spectateurs)
          if (!this.isHost) {
            displayName += ' (Vous)';
          }
          
          localParticipantInfo.displayName = displayName;
          this.cdr.detectChanges();
        }).catch(error => {
          console.warn('Could not load local user display name:', error);
          localParticipantInfo.displayName = this.isHost ? 'Animateur' : 'Vous';
        });
      } catch (error) {
        console.warn('Could not load local user display name:', error);
        localParticipantInfo.displayName = this.isHost ? 'Animateur' : 'Vous';
      }
      
      // Ajouter au début de la liste
      this.participantInfos.unshift(localParticipantInfo);
      this.updateParticipantCounts();
      this.cdr.detectChanges();
      
    } catch (error) {
      console.error('Error adding local participant to list:', error);
    }
  }

private async initializeChat(): Promise<void> {
  try {
    console.log('🔧 Initializing chat with auto-connection...');
    this.chatConnectionStatus = 'CONNECTING';
    
    //  Connecter automatiquement le chat
    await this.connectChatAutomatically();
    
    // Charger les messages précédents
    await this.loadPreviousChatMessages();
    
    // S'abonner aux événements
    this.subscribeToChatEvents();
    
    // Setup typing indicator
    this.setupTypingIndicator();
    
    console.log('✅ Chat initialized with auto-connection');
    
  } catch (error) {
    console.error('❌ Failed to initialize chat:', error);
    this.isChatLoading = false;
    this.chatConnectionStatus = 'DISCONNECTED';
  }
}
private async connectChatAutomatically(): Promise<void> {
  try {
    console.log('🔥 Auto-connecting chat...');
    
    // Connecter le WebSocket du chat
    await this.chatService.connectWebSocket();
    
    // Attendre que la connexion soit établie
    await this.waitForChatConnection();
    
    // Rejoindre automatiquement la session
    if (this.isChatConnected) {
      console.log('✅ Chat connected automatically, joining session...');
      await this.chatService.joinSession(this.sessionId);
      this.showNotification('Chat connecté automatiquement', 'success');
      this.chatReconnectAttempts = 0;
    }
    
  } catch (error) {
    console.error('❌ Failed to auto-connect chat:', error);
    this.scheduleChatReconnection();
  }
}

   private initializeRecording(): void {
    this.recordingService.recordingStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.recordingStatus = status;
        this.cdr.detectChanges();
      });
  }

 private setupChatScrolling(): void {
    const observer = new MutationObserver(() => {
      if (this.shouldScrollToBottom && this.chatMessages.length > this.lastMessageCount) {
        this.scrollChatToBottom();
        this.lastMessageCount = this.chatMessages.length;
      }
    });

    if (this.messagesContainer?.nativeElement) {
      observer.observe(this.messagesContainer.nativeElement, {
        childList: true,
        subtree: true
      });
    }
  }


  // Chat methods
 toggleChat(): void {
  this.showChat = !this.showChat;
  if (this.showChat) {
    this.unreadChatCount = 0;
    setTimeout(() => this.scrollChatToBottom(), 100);
  }
  // Plus besoin de déplacer les miniatures car elles restent dans le conteneur permanent
}

private moveProducerThumbnailToFloating(): void {
  const wrapper = document.querySelector('.producer-camera-sidebar-wrapper');
  if (!wrapper) return;
  
  const floatingContainer = this.getOrCreateFloatingThumbnailContainer();
  floatingContainer.appendChild(wrapper);
  
  console.log('📹 Moved producer thumbnail to floating container');
}

//  Restaurer la miniature dans la sidebar
//  Adapter cette méthode pour le nouveau système
private moveProducerThumbnailToSidebar(): void {
  console.log('📹 Producer thumbnails are now managed in top section');
  // Cette méthode n'est plus nécessaire car les miniatures sont maintenant dans la section du haut
}
  private async loadPreviousChatMessages(): Promise<void> {
  return new Promise((resolve) => {
    console.log('📚 Loading previous chat messages...');
    
    this.chatService.getSessionMessages(this.sessionId).subscribe({
      next: (messages) => {
        console.log('✅ Loaded messages:', messages?.length || 0);
        this.chatMessages = messages || [];
        this.isChatLoading = false;
        resolve();
      },
      error: (error) => {
        console.warn('⚠️ Could not load chat messages (normal if not connected):', error);
        this.chatMessages = [];
        this.isChatLoading = false;
        resolve(); // Ne pas rejeter
      }
    });
  });
}

//  Méthodes de nettoyage pour les miniatures du haut
private clearAllTopThumbnails(): void {
  console.log('🧹 Clearing all top thumbnails...');

  Array.from(this.topThumbnails.keys()).forEach(id => {
    this.removeTopThumbnail(id);
  });

  this.topThumbnails.clear();
  this.showEmptyThumbnailsPlaceholder();
}

private removeTopThumbnail(thumbnailId: string): void {
  const thumbnailInfo = this.topThumbnails.get(thumbnailId);
  if (!thumbnailInfo) {
    return;
  }

  try {
    // Détacher la track
    if (thumbnailInfo.track) {
      thumbnailInfo.track.detach(thumbnailInfo.element);
    }

    // Retirer du DOM
    if (thumbnailInfo.wrapper.parentNode) {
      thumbnailInfo.wrapper.parentNode.removeChild(thumbnailInfo.wrapper);
    }

    // Supprimer des maps
    this.topThumbnails.delete(thumbnailId);
    this.mediaElements.delete(thumbnailId);

  } catch (error) {
    console.error(`Error removing thumbnail ${thumbnailId}:`, error);
  }
}

private showEmptyThumbnailsPlaceholder(): void {
  if (!this.topThumbnailContainer?.nativeElement) return;

  const container = this.topThumbnailContainer.nativeElement;
  
  if (container.querySelector('.top-thumbnails-empty')) return;

  const placeholder = document.createElement('div');
  placeholder.className = 'top-thumbnails-empty';
  placeholder.innerHTML = `
    <mat-icon>person_add</mat-icon>
    <span>En attente des participants...</span>
  `;

  container.appendChild(placeholder);
}
  private subscribeToChatEvents(): void {
    console.log('Subscribing to chat events...');

    // Chat connection status
    this.chatService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          console.log('Chat connection status changed:', status);
          const wasConnected = this.isChatConnected;
          this.isChatConnected = status === 'CONNECTED';
          this.chatConnectionStatus = status as any;
          
          if (this.isChatConnected && !wasConnected) {
            console.log('Chat connected, joining session...');
            this.chatService.joinSession(this.sessionId);
            this.chatReconnectAttempts = 0;
            this.showNotification('Chat connecté', 'success');
          } else if (!this.isChatConnected && wasConnected) {
            console.log('Chat disconnected');
            this.showNotification('Chat déconnecté', 'error');
            this.scheduleChatReconnection();
          }
          
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Chat connection status error:', error);
          this.chatConnectionStatus = 'DISCONNECTED';
          this.isChatConnected = false;
        }
      });

    // Chat messages
    this.chatService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messages) => {
          console.log('Received messages update:', messages?.length || 0);
          const newMessageCount = messages?.length || 0;
          const hadNewMessage = newMessageCount > this.chatMessages.length;
          
          this.chatMessages = messages || [];
          
          // Handle unread count
          if (hadNewMessage && (!this.showChat || !this.lastFocusState)) {
            const latestMessage = this.chatMessages[this.chatMessages.length - 1];
            if (latestMessage && !this.isOwnChatMessage(latestMessage)) {
              this.unreadChatCount++;
              this.playNotificationSound();
            }
          }
          
          this.shouldScrollToBottom = true;
          this.cdr.detectChanges();
          
          // Auto scroll if needed
          setTimeout(() => this.scrollChatToBottom(), 100);
        },
        error: (error) => {
          console.error('Chat messages error:', error);
        }
      });

    // Typing indicators
    this.chatService.typing$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (indicators) => {
          console.log('Typing indicators update:', indicators?.length || 0);
          this.typingIndicators = (indicators || []).filter(
            indicator => indicator.userId !== this.currentUserId?.toString()
          );
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Typing indicators error:', error);
        }
      });
  }

  private setupTypingIndicator(): void {
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        if (!this.isTyping && this.newChatMessage.trim()) {
          this.isTyping = true;
          this.chatService.sendTypingIndicator(this.sessionId, true);
        } else if (this.isTyping && !this.newChatMessage.trim()) {
          this.isTyping = false;
          this.chatService.sendTypingIndicator(this.sessionId, false);
        }
      });

    // Stop typing indicator after 3 seconds of inactivity
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(3000)
      )
      .subscribe(() => {
        if (this.isTyping) {
          this.isTyping = false;
          this.chatService.sendTypingIndicator(this.sessionId, false);
        }
      });
  }


private scrollChatToBottom(): void {
    try {
      if (this.messagesContainer?.nativeElement) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch(err) {
      console.error('Chat scroll error:', err);
    }
  }
 testChatConnection(): void {
  console.log('Testing chat connection...');
  
  // Utiliser pipe(take(1)) pour obtenir la valeur actuelle
  this.chatService.connectionStatus$.pipe(take(1)).subscribe(status => {
    console.log('Chat service status:', status);
  });
  
  console.log('Current messages:', this.chatMessages.length);
  console.log('Typing indicators:', this.typingIndicators.length);
  console.log('Chat connection attempts:', this.chatReconnectAttempts);
  this.showNotification('Test de connexion chat - voir console', 'success');
}


   sendChatMessage(): void {
    if (!this.newChatMessage.trim() || !this.isChatConnected) {
      console.log('Cannot send message: empty or not connected');
      return;
    }

    const messageText = this.newChatMessage.trim();
    console.log('Sending chat message:', messageText);
    
    try {
      this.chatService.sendMessage(this.sessionId, messageText);
      this.newChatMessage = '';
      
      if (this.isTyping) {
        this.isTyping = false;
        this.chatService.sendTypingIndicator(this.sessionId, false);
      }
      
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.focus();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.showNotification('Erreur lors de l\'envoi du message', 'error');
    }
  }



  onChatMessageInput(): void {
    this.typingSubject.next();
  }


   onChatKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChatMessage();
    }
  }

 isOwnChatMessage(message: ChatMessage): boolean {
    return message.userId === this.currentUserId?.toString();
  }

    trackChatMessage(index: number, message: ChatMessage): string {
    return `${message.userId}-${message.timestamp.getTime()}`;
  }


  get typingUsersArray(): TypingIndicator[] {
    return this.typingIndicators;
  }

  get chatConnectionStatusText(): string {
    switch (this.chatConnectionStatus) {
      case 'CONNECTED': return 'Connecté';
      case 'CONNECTING': return 'Connexion...';
      case 'RECONNECTING': return 'Reconnexion...';
      case 'DISCONNECTED': return 'Déconnecté';
      default: return 'Inconnu';
    }
  }

  // Participant methods
 private updateParticipantCounts(): void {
  // Compter TOUS les participants (sauf le producteur local)
  const allParticipants = this.participantInfos.filter(info => {
    // Ne pas compter le producteur dans le total des participants
    if (this.isHost && info.isLocal) return false;
    // Ne pas compter les producteurs distants non plus
    if (!info.isLocal && info.isProducer) return false;
    return true;
  });
  
  this.viewerCount = allParticipants.length;
  this.totalParticipants = this.viewerCount;
  
  console.log(`📊 Participant count updated: ${this.totalParticipants} viewer(s)`);
  this.cdr.detectChanges();
}


  private cleanupParticipantElements(participantSid: string): void {
    Array.from(this.mediaElements.keys())
      .filter(key => {
        const info = this.mediaElements.get(key);
        return info?.participantId === participantSid;
      })
      .forEach(key => this.removeMediaElement(key));
  }

  private extractUserIdFromIdentity(identity: string): number | undefined {
    const directId = parseInt(identity, 10);
    return !isNaN(directId) ? directId : undefined;
  }

private async loadParticipantDisplayName(participantInfo: ParticipantInfo): Promise<void> {
  if (!participantInfo.userId) {
    console.warn('No userId found for participant:', participantInfo.name);
    participantInfo.displayName = participantInfo.name || 'Participant';
    return;
  }

  try {
    const user = await firstValueFrom(this.userService.getUserById(participantInfo.userId));
    
    let displayName = '';
    
    // Construire le nom d'affichage à partir des données utilisateur
    if (user.firstName && user.lastName) {
      displayName = `${user.firstName} ${user.lastName}`;
    } else if (user.firstName) {
      displayName = user.firstName;
    } else if (user.lastName) {
      displayName = user.lastName;
    } else if (user.username) {
      displayName = user.username;
    } else {
      displayName = `User ${participantInfo.userId}`;
    }
    
    participantInfo.displayName = displayName;
    
    // Mettre à jour le label de la miniature si elle existe
    this.updateThumbnailLabel(participantInfo);
    
    this.cdr.detectChanges();
    
    console.log(`✅ Participant ${participantInfo.name} display name updated to: ${displayName}`);
    
  } catch (error) {
    console.error(`Failed to load display name for participant ${participantInfo.name}:`, error);
    participantInfo.displayName = participantInfo.name || 'Participant';
  }
}
private updateThumbnailLabel(participantInfo: ParticipantInfo): void {
  // Chercher la miniature correspondante
  const thumbnailId = this.generateReceiverThumbnailId(participantInfo);
  const thumbnailInfo = this.receiverThumbnails.get(thumbnailId);
  
  if (thumbnailInfo && thumbnailInfo.wrapper) {
    const label = thumbnailInfo.wrapper.querySelector('.thumbnail-label');
    if (label) {
      label.textContent = participantInfo.displayName || participantInfo.name || 'Participant';
    }
  }
}

  // Room event handlers
  private setupRoomListeners(): void {
    if (!this.room) return;

    this.room
      .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this))
      .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed.bind(this))
      .on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this))
      .on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this))
      .on(RoomEvent.LocalTrackPublished, this.handleLocalTrackPublished.bind(this))
      .on(RoomEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished.bind(this))
      .on(RoomEvent.Disconnected, this.handleDisconnect.bind(this))
      .on(RoomEvent.Reconnecting, this.handleReconnecting.bind(this))
      .on(RoomEvent.Reconnected, this.handleReconnected.bind(this))
      .on(RoomEvent.ConnectionQualityChanged, this.handleConnectionQualityChanged.bind(this));
  }

 private handleDisconnect(): void {
  console.log('🔌 Disconnected from room');
  
  // Ne pas traiter si déjà géré
  if (this.sessionEndHandled) return;
  
  this.isConnected = false;
  this.cleanupAllMediaElements();
  this.stopStreamTimer();
  
  this.participantInfos = [];
  this.updateParticipantCounts();
  
  // Pour les receivers, vérifier si c'est une fin de session par le producteur
  if (!this.isHost) {
    // Vérifier le statut de la session
    this.checkIfSessionEnded();
  } else {
    // Pour le producteur, simple notification de déconnexion
    this.showNotification('Déconnecté de la session');
  }
  
  this.cdr.detectChanges();
}
private async checkIfSessionEnded(): Promise<void> {
  try {
    const currentSession = await firstValueFrom(
      this.livestreamService.getSession(this.sessionId)
    );
    
    if (currentSession.status === 'COMPLETED') {
      console.log('📺 Session is completed, showing rating dialog');
      this.sessionEndedByProducer = true;
      await this.handleProducerEndedSession();
    } else {
      // Simple déconnexion réseau
      this.showNotification('Déconnexion du stream - Tentative de reconnexion...');
    }
  } catch (error) {
    console.error('Error checking session status:', error);
    this.showNotification('Déconnecté de la session');
  }
}

// 9. Ajouter une confirmation avant de terminer la session (optionnel mais recommandé)
async confirmAndEndSession(): Promise<void> {
  if (!this.isHost) return;
  
  // Calculer le nombre de participants actuels (excluant le host)
  const participantCount = this.participantInfos.filter(p => !p.isLocal || !p.isProducer).length;
  
  // Ouvrir le dialogue de confirmation
  const dialogRef = this.dialog.open(EndSessionDialogComponent, {
    width: '500px',
    maxWidth: '90vw',
    disableClose: false, // Permettre de fermer avec ESC ou clic externe
    autoFocus: false,
    panelClass: 'end-session-dialog-container',
    data: {
      participantCount: participantCount
    }
  });
  
  // Attendre la réponse du dialogue
  const confirmed = await firstValueFrom(dialogRef.afterClosed());
  
  // Si confirmé, terminer la session
  if (confirmed) {
    try {
      // Afficher un indicateur de chargement
      this.showNotification('Arrêt de la session en cours...', 'warning');
      
      // Terminer la session
      await this.endSession();
      
    } catch (error) {
      console.error('Erreur lors de la fin de session:', error);
      this.showNotification('Erreur lors de l\'arrêt de la session', 'error');
    }
  }
}

private checkIfProducerEndedSession(): boolean {
  // Vérifier si le producteur n'est plus dans la room
  const producerParticipant = this.findRemoteProducerParticipant();
  return !producerParticipant && this.isConnected === false;
}

// 5. Ajouter la méthode pour gérer la fin par le producteur
private async handleProducerEndedSession(): Promise<void> {
  // Éviter les appels multiples
  if (this.sessionEndHandled) return;
  this.sessionEndHandled = true;
  
  console.log('📺 Handling session end by producer...');
  
  // Récupérer les informations nécessaires pour le rating
  await this.loadExchangeInfo();
  
  // Arrêter toutes les activités
  this.isConnected = false;
  this.stopStreamTimer();
  
  // Déconnecter proprement
  if (this.room) {
    try {
      await this.room.disconnect();
    } catch (error) {
      console.log('Error disconnecting room:', error);
    }
  }
  
  // Notification visuelle
  this.showNotification('La session a été terminée par le producteur', 'warning');
  
  // Attendre un peu pour que l'utilisateur voie la notification
  setTimeout(() => {
    this.showRatingDialog();
  }, 1500);
}


// 6. Méthode pour charger les infos de l'échange
private async loadExchangeInfo(): Promise<void> {
  try {
    if (!this.session || !this.currentUserId) return;
    
    // Récupérer l'échange correspondant
    const exchanges = await firstValueFrom(
      this.exchangeService.getExchangesBySkillId(this.session.skillId)
    );
    
    const userExchange = exchanges.find(ex => ex.receiverId === this.currentUserId);
    
    if (userExchange) {
      this.exchangeId = userExchange.id;
      this.skillName = userExchange.skillName;
      
      // Récupérer le nom du producteur
      const producer = await firstValueFrom(
        this.userService.getUserById(this.session.producerId)
      );
      this.producerName = `${producer.firstName} ${producer.lastName}`;
    }
  } catch (error) {
    console.error('Erreur lors du chargement des infos d\'échange:', error);
  }
}
private sessionEndHandled = false;

// 7. Méthode pour afficher le dialogue de rating
private showRatingDialog(): void {
  if (!this.exchangeId) {
    console.warn('Pas d\'échange trouvé pour cette session');
    this.router.navigate(['/receiver/finished-skills']);
    return;
  }
  
  const dialogRef = this.dialog.open(RatingDialogComponent, {
    width: '500px',
    disableClose: true, // Empêcher la fermeture par clic externe
    data: {
      exchangeId: this.exchangeId,
      skillName: this.skillName || 'Session de livestream',
      producerName: this.producerName || 'Producteur',
      sessionDuration: this.formattedDuration
    }
  });
  
  dialogRef.afterClosed().subscribe(result => {
    if (result?.rated) {
      console.log('✅ Session évaluée avec', result.rating, 'étoiles');
    } else {
      console.log('⏭️ Évaluation ignorée');
    }
    // Dans tous les cas, rediriger vers finished-skills
    this.router.navigate(['/receiver/finished-skills']);
  });
}

  private handleReconnecting(): void {
    this.reconnectionAttempts++;
    this.showNotification(`Reconnexion... (${this.reconnectionAttempts}/${this.MAX_RECONNECTION_ATTEMPTS})`);
    
    if (this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
      this.showNotification('Connexion perdue - veuillez actualiser la page');
    }
  }

private handleReconnected(): void {
  this.reconnectionAttempts = 0;
  this.showNotification('Reconnecté avec succès');
  console.log('🔄 Reconnected - rescanning all participants...');

  // Rescanner TOUS les participants après reconnexion
  setTimeout(async () => {
    await this.scanAllExistingParticipants();
    this.determineMainVideoContent();

    if (this.isHost) {
      this.resyncLocalTracks();
      
      // Afficher le nombre de spectateurs après reconnexion
      const viewerCount = this.participantInfos.filter(p => !p.isProducer).length;
      if (viewerCount > 0) {
        this.showNotification(`Reconnecté - ${viewerCount} spectateur${viewerCount > 1 ? 's' : ''} en ligne`, 'success');
      }
      
    } else {
      this.forceReceiverStateCorrection();
      
      setTimeout(() => {
        this.checkAndCreateMissingProducerCameraThumbnail();
      }, 1000);
    }
  }, 1000);
}



public getDetailedParticipantStats(): any {
  const producers = this.participantInfos.filter(p => p.isProducer);
  const receivers = this.participantInfos.filter(p => !p.isProducer);
  const localParticipant = this.participantInfos.find(p => p.isLocal);
  
  return {
    total: this.participantInfos.length,
    totalViewers: this.totalParticipants,
    producers: {
      count: producers.length,
      list: producers.map(p => ({
        name: p.displayName,
        isLocal: p.isLocal,
        hasCamera: this.participantHasCamera(p),
        hasScreen: this.participantHasScreenShare(p)
      }))
    },
    receivers: {
      count: receivers.length,
      list: receivers.map(p => ({
        name: p.displayName,
        isLocal: p.isLocal,
        hasCamera: this.participantHasCamera(p),
        thumbnailExists: this.receiverThumbnails.has(this.generateReceiverThumbnailId(p))
      }))
    },
    localInfo: localParticipant ? {
      name: localParticipant.displayName,
      role: localParticipant.isProducer ? 'Producer' : 'Receiver',
      cameraEnabled: !this.isVideoOff,
      micEnabled: !this.isMuted
    } : null,
    thumbnails: {
      topCount: this.topThumbnails.size,
      receiverCount: this.receiverThumbnails.size
    }
  };
}

// 8. HELPER: Vérifier si un participant a une caméra active
private participantHasCamera(participantInfo: ParticipantInfo): boolean {
  if (participantInfo.isLocal) {
    return !this.isVideoOff && !!this.cameraTrack;
  }
  
  const participant = participantInfo.participant as RemoteParticipant;
  let hasCamera = false;
  
  participant.videoTrackPublications.forEach((publication: any) => {
    if (publication.source === Track.Source.Camera && publication.track) {
      hasCamera = true;
    }
  });
  
  return hasCamera;
}

private participantHasScreenShare(participantInfo: ParticipantInfo): boolean {
  if (participantInfo.isLocal) {
    return this.isScreenSharing;
  }
  
  const participant = participantInfo.participant as RemoteParticipant;
  let hasScreen = false;
  
  participant.videoTrackPublications.forEach((publication: any) => {
    if (publication.source === Track.Source.ScreenShare && publication.track) {
      hasScreen = true;
    }
  });
  
  return hasScreen;
}

  private async resyncLocalTracks(): Promise<void> {
    if (!this.room) return;
    
    console.log('🔄 Resyncing local tracks after reconnection...');
    
    try {
      // Vérifier et resynchroniser la caméra
      if (!this.isVideoOff && this.cameraTrack) {
        if (this.isScreenSharing) {
          await this.placeCameraInPiP();
        } else {
          await this.placeCameraInMain();
        }
      }
      
      console.log('✅ Local tracks resynced successfully');
    } catch (error) {
      console.error('Error resyncing local tracks:', error);
    }
  }

  private handleConnectionQualityChanged(quality: ConnectionQuality, participant?: Participant): void {
    if (!participant) {
      console.log('Local connection quality:', quality);
    } else {
      console.log(`Connection quality for ${participant.identity}:`, quality);
    }
  }

  // Utility methods
  private startStreamTimer(): void {
    this.streamTimer = setInterval(() => {
      if (this.streamStartTime) {
        this.streamDuration = Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000);
        this.cdr.detectChanges();
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

  get formattedRecordingDuration(): string {
    if (!this.recordingStatus.duration) return '00:00';
    return this.recordingService.formatDuration(this.recordingStatus.duration);
  }

  // Navigation and notifications
  navigateToSkillsPage(): void {
  // Ne PAS appeler endSession ici - juste naviguer
  console.log('User leaving session (not ending it)');
  this.router.navigate([this.isHost ? '/producer/livestreams' : '/receiver/finished-skills']);
}

  private showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    this.snackBar.open(message, 'Fermer', { 
      duration: 3000,
      panelClass: type === 'error' ? ['error-snackbar'] : type === 'warning' ? ['warning-snackbar'] : ['success-snackbar']
    });
  }

  private handleError(error: any): void {
    console.error('Component error:', error);
    this.error = error instanceof Error ? error.message : 'Échec de l\'initialisation';
    this.showNotification(this.error, 'error');
  }

  private handleConnectionError(error: any): void {
    this.error = this.getErrorMessage(error);
    this.showNotification(this.error, 'error');
    this.showStartButton = true;
    this.isConnected = false;
    
    this.cleanupAfterError();
  }

  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      if (error.message.includes('permissions') || error.message.includes('camera') || error.message.includes('microphone')) {
        return 'Permissions caméra/microphone requises';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        return 'Échec de la connexion réseau - vérifiez votre internet';
      } else if (error.message.includes('token') || error.message.includes('authentication')) {
        return 'Échec de l\'authentification - veuillez actualiser la page';
      }
      return `Échec de la connexion: ${error.message}`;
    }
    return 'Échec de la connexion - veuillez vérifier votre réseau et les permissions';
  }

  private async cleanupAfterError(): Promise<void> {
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (disconnectError) {
        console.warn('Error during cleanup disconnect:', disconnectError);
      }
      this.room = undefined;
    }
    
    this.cleanupAllMediaElements();
    this.stopStreamTimer();
  }

  // Recording methods
 async toggleRecording(): Promise<void> {
  if (!this.isHost || this.isRecordingProcessing) return;
  
  this.isRecordingProcessing = true;
  
  try {
    if (this.recordingStatus.isRecording) {
      // Remove firstValueFrom since stopRecording now returns Promise<void>
      await this.recordingService.stopRecording(this.sessionId);
      this.showNotification('Enregistrement arrêté', 'success');
    } else {
      // Remove firstValueFrom since startRecording now returns Promise<RecordingResponse>
      await this.recordingService.startRecording(this.sessionId);
      this.showNotification('Enregistrement démarré', 'success');
    }
  } catch (error) {
    console.error('Recording toggle failed:', error);
    this.showNotification('Erreur lors de l\'enregistrement', 'error');
  } finally {
    this.isRecordingProcessing = false;
  }
}
 async endSession(): Promise<void> {
  if (!this.isHost) {
    console.warn('Only producer can end session');
    return;
  }
  
  try {
    console.log('🔴 PRODUCER: Ending session for everyone...');
    
    // Marquer la session comme terminée dans la base de données
    await firstValueFrom(this.livestreamService.endSession(this.sessionId));
    
    // Envoyer un message spécial dans le chat pour notifier les receivers
    if (this.isChatConnected) {
      this.chatService.sendMessage(this.sessionId, '### SESSION TERMINÉE PAR LE PRODUCTEUR ###');
    }
    
    // Attendre un peu pour que le message soit envoyé
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Déconnecter la room
    if (this.room) {
      await this.livestreamService.disconnectFromRoom(this.room);
    }
    
    // Arrêter le timer
    this.stopStreamTimer();
    
    // Notification et navigation
    this.showNotification('Session terminée avec succès', 'success');
    this.navigateToSkillsPage();
    
  } catch (error) {
    console.error('Error ending session:', error);
    this.showNotification('Erreur lors de la fin de session', 'error');
  }
}



  // Chat accessibility methods
  getSubmitButtonAriaLabel(): string {
    if (!this.isChatConnected) {
      return 'Chat déconnecté - impossible d\'envoyer un message';
    }
    if (!this.newChatMessage.trim()) {
      return 'Bouton d\'envoi de message - veuillez saisir un message';
    }
    return 'Envoyer le message';
  }

  getSubmitButtonTitle(): string {
    if (!this.isChatConnected) {
      return 'Chat déconnecté - impossible d\'envoyer un message';
    }
    if (!this.newChatMessage.trim()) {
      return 'Veuillez saisir un message pour l\'envoyer';
    }
    return 'Cliquez pour envoyer le message';
  }

  getSubmitButtonTooltip(): string {
    if (!this.isChatConnected) {
      return 'Chat déconnecté';
    }
    if (!this.newChatMessage.trim()) {
      return 'Tapez un message';
    }
    return 'Envoyer le message';
  }

  getMessageAriaLabel(message: ChatMessage): string {
    const isOwn = this.isOwnChatMessage(message);
    const sender = isOwn ? 'Vous' : message.username;
    const time = this.formatTimeForAriaLabel(message.timestamp);
    return `Message de ${sender} à ${time}: ${message.message}`;
  }

  private formatTimeForAriaLabel(timestamp: Date): string {
    return timestamp.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  getTypingIndicatorAriaLabel(): string {
    const count = this.typingUsersArray.length;
    if (count === 0) return '';
    
    if (count === 1) {
      return `${this.typingUsersArray[0].username} est en train d'écrire`;
    }
    
    const names = this.typingUsersArray.map(u => u.username).join(', ');
    return `${names} sont en train d'écrire`;
  }

  getChatToggleAriaLabel(): string {
    const action = this.showChat ? 'Masquer' : 'Afficher';
    const unreadInfo = this.unreadChatCount > 0 
      ? ` - ${this.unreadChatCount} message${this.unreadChatCount > 1 ? 's' : ''} non lu${this.unreadChatCount > 1 ? 's' : ''}` 
      : '';
    return `${action} le chat${unreadInfo}`;
  }

  getChatToggleTitle(): string {
    return this.showChat ? 'Masquer le panneau de chat' : 'Afficher le panneau de chat';
  }

  // Environment access for template
  get environment() {
    return { production: !this.isDevelopment };
  }
private checkAndCreateMissingProducerCameraThumbnail(): void {
  if (this.isHost) return;
  
  console.log('🔍 RECEIVER: Checking for missing producer camera thumbnail...');
  this.logProducerTracksInfo();
  
  const producerParticipant = this.findRemoteProducerParticipant();
  if (!producerParticipant) {
    console.log('❌ No producer participant found');
    return;
  }
  
  const hasScreenShare = this.findProducerRemoteScreenShare(producerParticipant);
  const hasCamera = this.findProducerRemoteCamera(producerParticipant);
  
  if (hasScreenShare && hasCamera) {
    console.log('📺🎥 Producer has BOTH screen share and camera');
    
    // Vérifier si la miniature existe dans le conteneur permanent
    const thumbnailExists = !!document.querySelector('#permanent-producer-thumbnails .producer-camera-sidebar-wrapper');
    
    if (!thumbnailExists) {
      console.log('📹 MISSING: Producer camera thumbnail not found, creating it...');
      this.createMissingProducerCameraThumbnail(producerParticipant);
    } else {
      console.log('✅ Producer camera thumbnail already exists');
    }
  }
}

  private createMissingProducerCameraThumbnail(producerParticipant: RemoteParticipant): void {
  console.log('🛠️ Creating missing producer camera thumbnail...');
  
  const cameraTrack = this.findTrackBySource(producerParticipant, Track.Source.Camera);
  if (!cameraTrack) {
    console.log('❌ Camera track not found for producer');
    return;
  }
  
  // Créer l'ID unique pour la miniature
  const thumbnailId = `producer-camera-thumbnail-${producerParticipant.sid}`;
  
  // Vérifier encore une fois qu'elle n'existe pas déjà
  if (this.mediaElements.has(thumbnailId)) {
    console.log('⚠️ Thumbnail already exists in mediaElements');
    return;
  }
  
  console.log('📹 Creating producer camera thumbnail element...');
  
  // Créer l'élément vidéo
  const element = this.createProducerCameraThumbnailElement(thumbnailId);
  
  // Attacher la track
  try {
    cameraTrack.track.attach(element);
    console.log('✅ Camera track attached to thumbnail element');
  } catch (error) {
    console.error('❌ Error attaching camera track:', error);
    return;
  }
  
  // Ajouter à la sidebar
  this.addProducerCameraToSidebar(element);
  
  // Enregistrer dans mediaElements
  this.mediaElements.set(thumbnailId, {
    element,
    trackId: cameraTrack.trackSid,
    participantId: producerParticipant.sid,
    isLocal: false,
    source: Track.Source.Camera
  });
  
  console.log('✅ Missing producer camera thumbnail created successfully');
  this.showNotification('Caméra du producteur restaurée', 'success');
}
/**
 * 🎯 MÉTHODE PRINCIPALE: Créer une miniature dans la section du haut
 */
private createTopThumbnail(participantInfo: ParticipantInfo, track?: RemoteTrack | LocalVideoTrack): TopThumbnailInfo {
  const thumbnailId = this.generateThumbnailId(participantInfo);
  
  // Éviter les doublons
  if (this.topThumbnails.has(thumbnailId)) {
    console.log(`⚠️ Thumbnail ${thumbnailId} already exists`);
    return this.topThumbnails.get(thumbnailId)!;
  }

  console.log(`🎬 Creating top thumbnail: ${thumbnailId}`);

  // Créer l'élément vidéo
  const videoElement = this.createThumbnailVideoElement(thumbnailId, participantInfo);
  
  // Créer le wrapper
  const wrapper = this.createThumbnailWrapper(videoElement, participantInfo);
  
  // Attacher la track si fournie
  if (track) {
    try {
      track.attach(videoElement);
      console.log(`✅ Track attached to ${thumbnailId}`);
    } catch (error) {
      console.error(`❌ Error attaching track to ${thumbnailId}:`, error);
    }
  }

  // Ajouter au conteneur du haut
  this.addThumbnailToTopContainer(wrapper);

  // Créer l'objet info
  const thumbnailInfo: TopThumbnailInfo = {
    id: thumbnailId,
    element: videoElement,
    wrapper: wrapper,
    participantInfo: participantInfo,
    track: track,
    isMainContent: false
  };

  // Enregistrer
  this.topThumbnails.set(thumbnailId, thumbnailInfo);
  this.mediaElements.set(thumbnailId, {
    element: videoElement,
    trackId: track?.sid || 'unknown',
    participantId: participantInfo.isLocal ? 'local' : participantInfo.participant.sid,
    isLocal: participantInfo.isLocal || false,
    source: track?.source
  });

  console.log(`✅ Top thumbnail created: ${thumbnailId}`);
  return thumbnailInfo;
}

/**
 * Générer un ID unique pour la miniature
 */
private generateThumbnailId(participantInfo: ParticipantInfo): string {
  if (participantInfo.isLocal) {
    return `local-thumbnail-${this.currentUserId || 'unknown'}`;
  } else {
    return `remote-thumbnail-${participantInfo.participant.sid}`;
  }
}

/**
 * Créer l'élément vidéo pour la miniature
 */
private createThumbnailVideoElement(id: string, participantInfo: ParticipantInfo): HTMLVideoElement {
  const element = document.createElement('video');
  element.id = id;
  element.autoplay = true;
  element.playsInline = true;
  element.muted = participantInfo.isLocal || false;
  
  // Ajouter le click handler
  element.addEventListener('click', (event) => {
    this.handleThumbnailClick(id, event);
  });

  return element;
}
private handleThumbnailClick(thumbnailId: string, event: Event): void {
  event.preventDefault();
  
  const thumbnailInfo = this.topThumbnails.get(thumbnailId);
  if (!thumbnailInfo) {
    console.log(`❌ Thumbnail info not found: ${thumbnailId}`);
    return;
  }

  console.log(`🖱️ Thumbnail clicked: ${thumbnailId}`);

  // RÈGLE: Seules les miniatures du producteur peuvent être promues en principal
  if (!thumbnailInfo.participantInfo.isProducer) {
    console.log(`⚠️ Only producer thumbnails can be promoted to main`);
    this.showNotification('Seules les vidéos du producteur peuvent être affichées en grand', 'warning');
    return;
  }

  // Basculer la miniature vers la vue principale
  this.promoteThumbnailToMain(thumbnailInfo);
}
private promoteThumbnailToMain(thumbnailInfo: TopThumbnailInfo): void {
  console.log(`📺 Promoting thumbnail to main: ${thumbnailInfo.id}`);

  // Sauvegarder l'ancienne vidéo principale
  const currentMainElement = this.mainVideoContainer.nativeElement.querySelector('video');
  if (currentMainElement && currentMainElement !== thumbnailInfo.element) {
    this.demoteMainToThumbnail(currentMainElement);
  }

  // Retirer l'élément de son wrapper
  const wrapper = thumbnailInfo.wrapper;
  const videoElement = thumbnailInfo.element;
  
  if (wrapper.parentNode) {
    wrapper.parentNode.removeChild(wrapper);
  }

  // Appliquer les styles de la vue principale
  Object.assign(videoElement.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    margin: '0',
    cursor: 'default',
    border: 'none',
    borderRadius: '0'
  });

  // Ajouter au conteneur principal
  this.clearMainVideo();
  this.mainVideoContainer.nativeElement.appendChild(videoElement);

  // Mettre à jour les références
  this.mainVideoTrack = thumbnailInfo.track;
  if (thumbnailInfo.track?.source === Track.Source.ScreenShare) {
    this.currentMainVideoSource = 'producer-screen';
  } else {
    this.currentMainVideoSource = 'producer-camera';
  }

  // Marquer comme contenu principal
  thumbnailInfo.isMainContent = true;

  // Supprimer de la liste des miniatures
  this.topThumbnails.delete(thumbnailInfo.id);

  this.showNotification('Vidéo affichée en grand', 'success');
  console.log(`✅ Thumbnail promoted to main successfully`);
}
/**
 * Créer le wrapper pour la miniature avec styles et labels
 */
private createThumbnailWrapper(videoElement: HTMLVideoElement, participantInfo: ParticipantInfo): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'top-thumbnail';
  
  // Ajouter les classes spécifiques selon le type
  if (participantInfo.isProducer) {
    wrapper.classList.add('producer');
  } else if (participantInfo.isLocal) {
    wrapper.classList.add('local-receiver');
  } else {
    wrapper.classList.add('remote-receiver');
  }

  // Créer le label
  const label = document.createElement('div');
  label.className = 'top-thumbnail-label';
  label.textContent = this.getThumbnailLabel(participantInfo);

  // Créer l'indicateur de statut
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'status-indicator';

  // Assembler le wrapper
  wrapper.appendChild(videoElement);
  wrapper.appendChild(label);
  wrapper.appendChild(statusIndicator);

  return wrapper;
}

/**
 * Obtenir le label approprié pour la miniature
 */
private getThumbnailLabel(participantInfo: ParticipantInfo): string {
  if (participantInfo.isProducer) {
    return this.isHost ? 'Vous (Producteur)' : 'Producteur';
  } else if (participantInfo.isLocal) {
    return 'Vous';
  } else {
    return participantInfo.displayName || 'Participant';
  }
}

/**
 * Ajouter la miniature au conteneur du haut
 */
private addThumbnailToTopContainer(wrapper: HTMLElement): void {
  if (!this.topThumbnailContainer?.nativeElement) {
    console.error('❌ Top thumbnail container not found');
    return;
  }

  const container = this.topThumbnailContainer.nativeElement;
  
  // Nettoyer le placeholder vide s'il existe
  const emptyPlaceholder = container.querySelector('.top-thumbnails-empty');
  if (emptyPlaceholder) {
    emptyPlaceholder.remove();
  }

  // Ajouter la nouvelle miniature
  container.appendChild(wrapper);
  
  // Auto-scroll pour montrer la nouvelle miniature
  setTimeout(() => {
    wrapper.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
  }, 100);
}
/**
   * Getter pour accéder aux miniatures receivers dans le template
   */
  get receiverThumbnailsArray(): ReceiverThumbnailInfo[] {
    return Array.from(this.receiverThumbnails.values());
  }

  /**
   * Getter pour le nombre de miniatures receivers
   */
  get receiverThumbnailsCount(): number {
    return this.receiverThumbnails.size;
  }

  /**
   * Getter pour savoir s'il y a des receivers connectés
   */
  get hasReceivers(): boolean {
    return this.participantInfos.some(p => !p.isProducer);
  }

  // ===== CONTRÔLES ET TOGGLE =====
  
  /**
   * Toggle pour afficher/masquer les miniatures receivers
   */
  toggleReceiverThumbnails(): void {
    this.showReceiverThumbnails = !this.showReceiverThumbnails;
    
    const container = document.getElementById('receiver-thumbnails-container');
    if (container) {
      if (this.showReceiverThumbnails) {
        container.style.display = 'flex';
        container.style.animation = 'slideInFromRight 0.3s ease-out';
        this.showNotification('Participants affichés', 'success');
      } else {
        container.style.animation = 'slideOutToRight 0.3s ease-in';
        setTimeout(() => {
          container.style.display = 'none';
        }, 300);
        this.showNotification('Participants masqués');
      }
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Forcer l'actualisation de toutes les miniatures receivers
   */
  forceRefreshReceiverThumbnails(): void {
    console.log('🔄 Force refreshing receiver thumbnails...');
    
    const participantInfos = this.participantInfos.filter(p => !p.isProducer);
    
    // Supprimer toutes les miniatures existantes
    this.clearAllReceiverThumbnails();
    
    // Recréer les miniatures pour tous les receivers
    participantInfos.forEach(participantInfo => {
      // Chercher une track active pour ce participant
      let activeTrack: RemoteTrack | LocalVideoTrack | undefined;
      
      if (participantInfo.isLocal) {
        activeTrack = this.cameraTrack;
      } else {
        // Chercher dans les tracks distantes
        const participant = participantInfo.participant as RemoteParticipant;
        const cameraPublication = Array.from(participant.videoTrackPublications.values())
          .find(pub => pub.source === Track.Source.Camera && pub.track);
        
        if (cameraPublication?.track) {
          activeTrack = cameraPublication.track;
        }
      }
      
      this.createOrUpdateReceiverThumbnail(participantInfo, activeTrack);
    });
    
    this.showNotification('Miniatures actualisées', 'success');
    console.log('✅ Receiver thumbnails refreshed');
  }

  // ===== GESTION DES ÉVÉNEMENTS PARTICIPANTS =====
  
  /**
   * Gérer l'arrivée d'un nouveau participant
   */
  private handleNewParticipantJoined(participantInfo: ParticipantInfo): void {
    if (!participantInfo.isProducer && !participantInfo.isLocal) {
      // Créer immédiatement une miniature en mode "caméra fermée"
      this.createOrUpdateReceiverThumbnail(participantInfo);
      
      // Afficher notification
      this.showNewParticipantNotification(participantInfo);
      
      // Jouer son de notification
      this.playParticipantJoinSound();
      
      // Mettre à jour le compteur
      this.updateReceiverThumbnailsCount();
    }
  }

  /**
   * Gérer le départ d'un participant
   */
  private handleParticipantLeft(participantSid: string, participantName: string): void {
    const thumbnailId = `remote-receiver-thumbnail-${participantSid}`;
    
    if (this.receiverThumbnails.has(thumbnailId)) {
      // Animation de suppression
      const thumbnailInfo = this.receiverThumbnails.get(thumbnailId)!;
      thumbnailInfo.wrapper.classList.add('removing');
      
      // Supprimer après animation
      setTimeout(() => {
        this.removeReceiverThumbnail(thumbnailId);
        this.updateReceiverThumbnailsCount();
      }, 300);
      
      // Notification et son
      this.showNotification(`${participantName} a quitté la session`);
      this.playParticipantLeaveSound();
    }
  }

  // ===== NOTIFICATIONS VISUELLES =====
  
  /**
   * Afficher notification de nouveau participant
   */
  private showNewParticipantNotification(participantInfo: ParticipantInfo): void {
    this.hasNewParticipant = true;
    this.newParticipantName = participantInfo.displayName || participantInfo.name;
    
    // Masquer après 3 secondes
    setTimeout(() => {
      this.hasNewParticipant = false;
      this.cdr.detectChanges();
    }, 3000);
    
    this.cdr.detectChanges();
  }

  // ===== NOTIFICATIONS SONORES =====
  
  /**
   * Jouer son d'arrivée de participant
   */
  private playParticipantJoinSound(): void {
    try {
      const audio = document.getElementById('participant-join-sound') as HTMLAudioElement;
      if (audio) {
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignorer les erreurs de lecture audio
        });
      }
    } catch (error) {
      // Ignorer les erreurs audio
    }
  }

  /**
   * Jouer son de départ de participant
   */
  private playParticipantLeaveSound(): void {
    try {
      const audio = document.getElementById('participant-leave-sound') as HTMLAudioElement;
      if (audio) {
        audio.volume = 0.2;
        audio.play().catch(() => {
          // Ignorer les erreurs de lecture audio
        });
      }
    } catch (error) {
      // Ignorer les erreurs audio
    }
  }

  /**
   * Mettre à jour le compteur dans le titre du conteneur
   */
  private updateReceiverThumbnailsCount(): void {
    const container = document.getElementById('receiver-thumbnails-container');
    if (container) {
      const title = container.querySelector('div:first-child') as HTMLElement;
      if (title) {
        const count = this.receiverThumbnails.size;
        title.setAttribute('data-count', count.toString());
        title.textContent = count > 0 ? `Participants (${count})` : 'Participants';
      }
    }
  }

  /**
   * Ajuster la position du conteneur selon le contexte
   */
  private adjustReceiverThumbnailsPosition(): void {
    const container = document.getElementById('receiver-thumbnails-container');
    if (!container) return;
    
    const isDesktop = window.innerWidth > 768;
    const isChatOpen = this.showChat;
    
    if (isDesktop) {
      if (isChatOpen) {
        // Décaler vers la gauche si chat ouvert
        container.style.right = '420px';
      } else {
        // Position normale
        container.style.right = '20px';
      }
      
      container.style.position = 'fixed';
      container.style.bottom = '120px';
    } else {
      // Mobile : intégrer dans le layout
      const videoSection = document.querySelector('.video-section');
      if (videoSection && !isChatOpen) {
        container.style.position = 'static';
        container.style.flexDirection = 'row';
        container.style.overflowX = 'auto';
        container.style.overflowY = 'hidden';
        container.style.maxHeight = 'none';
        
        // Ajouter au layout mobile si pas déjà fait
        if (!container.parentElement?.classList.contains('video-section')) {
          videoSection.appendChild(container);
        }
      }
    }
  }

  // ===== GESTION DES ÉVÉNEMENTS WINDOW =====
  
  /**
   * Gérer le redimensionnement de fenêtre
   */
  private handleWindowResize = (): void => {
    // Réajuster la position des miniatures
    setTimeout(() => {
      this.adjustReceiverThumbnailsPosition();
    }, 100);
  };

  /**
   * Gérer les changements d'orientation
   */
  private handleOrientationChange = (): void => {
    setTimeout(() => {
      this.adjustReceiverThumbnailsPosition();
      this.forceRefreshReceiverThumbnails();
    }, 500);
  };

  // ===== INTÉGRATION AVEC LES LISTENERS EXISTANTS =====
  
  /**
   * Ajouter les event listeners pour les miniatures
   */
  private setupReceiverThumbnailsListeners(): void {
    window.addEventListener('resize', this.handleWindowResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    
    // Écouter les changements de layout du chat
    const observer = new MutationObserver(() => {
      this.adjustReceiverThumbnailsPosition();
    });
    
    const chatSection = document.querySelector('.chat-section');
    if (chatSection) {
      observer.observe(chatSection, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  /**
   * Supprimer les event listeners
   */
  private removeReceiverThumbnailsListeners(): void {
    window.removeEventListener('resize', this.handleWindowResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
  }

 
private handleParticipantConnected(participant: RemoteParticipant): void {
  console.log(`👋 New participant connected: ${participant.identity}`);
  
  // Traiter le nouveau participant
  this.processExistingParticipant(participant).then(() => {
    // Mettre à jour les compteurs
    this.updateParticipantCounts();
    
    // Notification
    const participantInfo = this.participantInfos.find(p => 
      !p.isLocal && p.participant.sid === participant.sid
    );
    
    if (participantInfo && !participantInfo.isProducer) {
      this.showNotification(`${participantInfo.displayName} a rejoint la session`, 'success');
      
      // Pour le producteur: créer la miniature immédiatement
      if (this.isHost) {
        setTimeout(() => {
          this.createOrUpdateReceiverThumbnail(participantInfo);
        }, 500);
      }
    }
  });
}

  
  private handleParticipantDisconnected(participant: RemoteParticipant): void {
    console.log(`👋 Participant disconnected: ${participant.identity}`);
    
    const participantInfo = this.participantInfos.find(
      info => info.participant.sid === participant.sid
    );
    
    // 🆕 NOUVEAU: Gérer le départ d'un receiver
    if (participantInfo && !participantInfo.isProducer) {
      this.handleParticipantLeft(participant.sid, participantInfo.displayName || participant.identity);
    }
    
    this.participantInfos = this.participantInfos.filter(
      info => info.participant.sid !== participant.sid
    );
    this.updateParticipantCounts();
    this.cleanupParticipantElements(participant.sid);
    
    console.log(`✅ Participant ${participant.identity} removed successfully`);
  }

  // ===== INTÉGRATION AVEC LE CYCLE DE VIE DU COMPOSANT =====
  
  /**
   * Initialiser les miniatures receivers (à appeler dans ngOnInit existant)
   */
  private initializeReceiverThumbnails(): void {
    console.log('🎭 Initializing receiver thumbnails system...');
    
    this.setupReceiverThumbnailsListeners();
    
    // Validation périodique en développement
    if (this.isDevelopment) {
      setInterval(() => {
        if (this.isConnected) {
          this.validateReceiverThumbnailsState();
        }
      }, 15000); // Toutes les 15 secondes
    }
    
    console.log('✅ Receiver thumbnails system initialized');
  }

  /**
   * Nettoyer les miniatures receivers (à appeler dans ngOnDestroy existant)
   */
  private cleanupReceiverThumbnails(): void {
    console.log('🧹 Cleaning up receiver thumbnails system...');
    
    this.removeReceiverThumbnailsListeners();
    this.clearAllReceiverThumbnails();
    
    console.log('✅ Receiver thumbnails system cleaned up');
  }

  // ===== MÉTHODES DE VALIDATION ET DEBUG =====
  
  /**
   * Valider l'état des miniatures receivers
   */
  private validateReceiverThumbnailsState(): boolean {
    let isValid = true;
    const issues: string[] = [];
    
    // Vérifier la cohérence entre participantInfos et receiverThumbnails
    const receiverParticipants = this.participantInfos.filter(p => !p.isProducer);
    const thumbnailsCount = this.receiverThumbnails.size;
    
    if (receiverParticipants.length !== thumbnailsCount) {
      issues.push(`Mismatch: ${receiverParticipants.length} receivers vs ${thumbnailsCount} thumbnails`);
      isValid = false;
    }
    
    // Vérifier que chaque miniature a un élément DOM valide
    this.receiverThumbnails.forEach((thumbnailInfo, id) => {
      if (!document.body.contains(thumbnailInfo.wrapper)) {
        issues.push(`Thumbnail ${id} not in DOM`);
        isValid = false;
      }
      
      if (!thumbnailInfo.element || !thumbnailInfo.wrapper) {
        issues.push(`Thumbnail ${id} missing elements`);
        isValid = false;
      }
    });
    
    if (!isValid) {
      console.error('🚨 RECEIVER THUMBNAILS VALIDATION FAILED:');
      issues.forEach(issue => console.error(`  - ${issue}`));
      
      // Auto-correction
      if (this.isDevelopment) {
        console.log('🔧 Attempting auto-correction...');
        this.forceRefreshReceiverThumbnails();
      }
    }
    
    return isValid;
  }

  /**
   * Logger l'état des miniatures receivers
   */
  public logReceiverThumbnailsState(): void {
    const state = {
      timestamp: new Date().toISOString(),
      showReceiverThumbnails: this.showReceiverThumbnails,
      thumbnailsCount: this.receiverThumbnails.size,
      participantCount: this.participantInfos.length,
      receiverCount: this.participantInfos.filter(p => !p.isProducer).length,
      containerExists: !!document.getElementById('receiver-thumbnails-container'),
      containerVisible: document.getElementById('receiver-thumbnails-container')?.style.display !== 'none',
      thumbnails: Array.from(this.receiverThumbnails.entries()).map(([id, info]) => ({
        id,
        participantName: info.participantInfo.displayName,
        isActive: info.isActive,
        hasTrack: !!info.track,
        inDOM: document.body.contains(info.wrapper)
      }))
    };
    
    console.log('🎭 RECEIVER THUMBNAILS STATE:', state);
    
    if (this.isDevelopment) {
      console.table(state.thumbnails);
    }
  }
  //  Méthode améliorée pour scanner TOUS les participants existants
private async scanAllExistingParticipants(): Promise<void> {
  if (!this.room) return;
  
  console.log('🔍 SCANNING ALL EXISTING PARTICIPANTS...');
  
  // Scanner les participants distants
  const remoteParticipants = Array.from(this.room.remoteParticipants.values());
  console.log(`📊 Found ${remoteParticipants.length} remote participants`);
  
  for (const participant of remoteParticipants) {
    await this.processExistingParticipant(participant);
  }
  
  // Mettre à jour les compteurs
  this.updateParticipantCounts();
  
  // Pour le producteur: créer les miniatures des receivers
  if (this.isHost) {
    setTimeout(() => {
      this.createThumbnailsForAllReceivers();
    }, 1000);
  }
  
  console.log('✅ Participant scan completed');
}

//  Traiter un participant existant
private async processExistingParticipant(participant: RemoteParticipant): Promise<void> {
  const isProducerParticipant = participant.identity === this.session?.producerId.toString();
  
  console.log(`👤 Processing ${isProducerParticipant ? 'PRODUCER' : 'RECEIVER'}: ${participant.identity}`);
  
  // Vérifier si le participant existe déjà
  let participantInfo = this.participantInfos.find(p => 
    !p.isLocal && p.participant.sid === participant.sid
  );
  
  if (!participantInfo) {
    // Créer l'info participant
    participantInfo = {
      participant,
      isProducer: isProducerParticipant,
      name: participant.identity,
      displayName: participant.identity,
      joinedAt: new Date(),
      userId: this.extractUserIdFromIdentity(participant.identity),
      isLocal: false
    };
    
    this.participantInfos.push(participantInfo);
    
    // Charger le nom d'affichage depuis la DB
    await this.loadParticipantDisplayName(participantInfo);
  }
  
  // Traiter les tracks vidéo existantes
  participant.videoTrackPublications.forEach((publication: any) => {
    if (publication.track && publication.source === Track.Source.Camera) {
      console.log(`📹 Found active camera for ${participant.identity}`);
      
      if (!isProducerParticipant) {
        // Pour les receivers: créer ou mettre à jour la miniature
        this.createOrUpdateReceiverThumbnail(participantInfo, publication.track);
      }
    }
  });
  
  // Traiter les tracks audio
  participant.audioTrackPublications.forEach((publication: any) => {
    if (publication.track) {
      console.log(`🎤 Found active audio for ${participant.identity}`);
    }
  });
}

//  Méthode pour créer les miniatures de TOUS les receivers
private createThumbnailsForAllReceivers(): void {
  if (!this.isHost) return;
  
  console.log('📸 PRODUCER: Creating thumbnails for all receivers...');
  
  const receivers = this.participantInfos.filter(p => !p.isProducer && !p.isLocal);
  
  receivers.forEach(participantInfo => {
    const thumbnailId = this.generateReceiverThumbnailId(participantInfo);
    
    // Vérifier si la miniature existe déjà
    if (!this.receiverThumbnails.has(thumbnailId)) {
      // Chercher une track caméra active
      let cameraTrack: RemoteTrack | undefined;
      
      const participant = participantInfo.participant as RemoteParticipant;
      participant.videoTrackPublications.forEach((publication: any) => {
        if (publication.source === Track.Source.Camera && publication.track) {
          cameraTrack = publication.track;
        }
      });
      
      // Créer la miniature (avec ou sans track)
      this.createOrUpdateReceiverThumbnail(participantInfo, cameraTrack);
    }
  });
  
  console.log(`✅ Created thumbnails for ${receivers.length} receivers`);
}


}

