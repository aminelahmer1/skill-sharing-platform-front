import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LivestreamService } from '../../core/services/LiveStream/livestream.service';
import { ChatService, ChatMessage, TypingIndicator } from '../../core/services/Chat/chat.service';
import { RecordingService, RecordingStatus } from '../../core/services/Recording/recording.service';
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

interface ParticipantInfo {
  participant: RemoteParticipant;
  isProducer: boolean;
  name: string;
  displayName: string;
  joinedAt: Date;
  userId?: number;
}

interface MediaElementInfo {
  element: HTMLMediaElement;
  trackId: string;
  participantId?: string;
  isLocal: boolean;
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
    MatInputModule
  ]
})
export class LivestreamComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mainVideoContainer') mainVideoContainer!: ElementRef;
  @ViewChild('thumbnailContainer') thumbnailContainer!: ElementRef;
  @ViewChild('pipVideoContainer') pipVideoContainer!: ElementRef;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  // ===== ÉTATS PRINCIPAUX =====
  sessionId!: number;
  session?: LivestreamSession;
  isHost = false;
  participantInfos: ParticipantInfo[] = [];
  isConnected = false;
  isLoading = true;
  error?: string;
  showStartButton = true;
  
  // ===== ÉTATS MÉDIA =====
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  isFullscreen = false;
  
  // ===== CHAT - AMÉLIORÉ =====
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
  
  // ===== STATISTIQUES =====
  totalParticipants = 0;
  viewerCount = 0;
  streamDuration = 0;
  streamStartTime?: Date;
  
  // ===== RESOURCES PRIVÉES =====
  private mediaElements = new Map<string, MediaElementInfo>();
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
  
  // ===== CHAT TYPING ET GESTION =====
  private typingSubject = new Subject<void>();
  private isTyping = false;
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;
  private chatReconnectAttempts = 0;
  private readonly MAX_CHAT_RECONNECT_ATTEMPTS = 5;
  private chatReconnectTimer?: any;
  private lastFocusState = true;
  
  // ===== EVENT HANDLERS =====
  private handleFullscreenChange = (): void => {
    this.isFullscreen = !!document.fullscreenElement;
    this.cdr.detectChanges();
  };

  private handleVideoClick = (event: Event): void => {
    const element = event.target as HTMLVideoElement;
    const elementId = element.id;
    this.switchToMainVideo(elementId, element);
  };

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
  };

  // ===== CHAT FOCUS DETECTION =====
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
    private cdr: ChangeDetectorRef
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
      await this.initializeChat();
      this.initializeRecording();
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
      
      this.stopStreamTimer();
      this.removeKeyboardShortcuts();
      this.removeWindowFocusListeners();
      
      // Cleanup chat
      if (this.isTyping) {
        this.chatService.sendTypingIndicator(this.sessionId, false);
      }
      this.chatService.leaveSession(this.sessionId);
      
      // Clear chat reconnect timer
      if (this.chatReconnectTimer) {
        clearInterval(this.chatReconnectTimer);
        this.chatReconnectTimer = undefined;
      }
      
      // Cleanup recording
      this.recordingService.cleanup();
      
      // Cleanup livestream
      if (this.room) {
        await this.livestreamService.disconnectFromRoom(this.room);
      }
      
      this.cleanupAllMediaElements();
      document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
      
      console.log('LivestreamComponent destroyed successfully');
    } catch (error) {
      console.error('Error during component destruction:', error);
    }
  }

  // ============================================================================
  // ===== INITIALISATION =====
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
    
    console.log('Session initialized:', {
      sessionId: session.id,
      status: session.status,
      isHost: this.isHost,
      userId: currentUser.id,
      producerId: session.producerId
    });

    this.validateSessionAccess(session);
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
  // ===== CHAT INTEGRATION - COMPLÈTEMENT RÉÉCRIT =====
  // ============================================================================

  private async initializeChat(): Promise<void> {
    try {
      console.log('Initializing chat for session:', this.sessionId);
      this.chatConnectionStatus = 'CONNECTING';
      
      // Load previous messages first
      await this.loadPreviousChatMessages();
      
      // Subscribe to chat events
      this.subscribeToChatEvents();
      
      // Setup typing indicator
      this.setupTypingIndicator();
      
      // Start connection monitoring
      this.startChatConnectionMonitoring();
      
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      this.isChatLoading = false;
      this.chatConnectionStatus = 'DISCONNECTED';
    }
  }

  private async loadPreviousChatMessages(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('Loading previous chat messages...');
      
      this.chatService.getSessionMessages(this.sessionId).subscribe({
        next: (messages) => {
          console.log('Loaded messages:', messages?.length || 0);
          this.chatMessages = messages || [];
          this.isChatLoading = false;
          resolve();
        },
        error: (error) => {
          console.error('Failed to load chat messages:', error);
          this.chatMessages = [];
          this.isChatLoading = false;
          reject(error);
        }
      });
    });
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

  private startChatConnectionMonitoring(): void {
    // Check connection every 10 seconds
    interval(10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isChatConnected && this.chatConnectionStatus !== 'CONNECTING') {
          console.log('Chat connection monitoring: attempting reconnection');
          this.reconnectChat();
        }
      });
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

  // ===== CHAT METHODS =====
  onChatMessageInput(): void {
    this.typingSubject.next();
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

  onChatKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChatMessage();
    }
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

  // ===== CHAT GETTERS =====
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

  isOwnChatMessage(message: ChatMessage): boolean {
    return message.userId === this.currentUserId?.toString();
  }

  trackChatMessage(index: number, message: ChatMessage): string {
    return `${message.userId}-${message.timestamp.getTime()}`;
  }

  toggleChat(): void {
    this.showChat = !this.showChat;
    if (this.showChat) {
      this.unreadChatCount = 0;
      setTimeout(() => this.scrollChatToBottom(), 100);
    }
  }

  // ===== CHAT DEBUG ET RECONNEXION =====
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

  reconnectChat(): void {
    console.log('Forcing chat reconnection...');
    this.chatReconnectAttempts++;
    this.chatConnectionStatus = 'RECONNECTING';
    
    try {
      // Force reconnection
      this.chatService.leaveSession(this.sessionId);
      
      setTimeout(() => {
        this.chatService.joinSession(this.sessionId);
      }, 1000);
      
      this.showNotification('Reconnexion chat en cours...', 'success');
    } catch (error) {
      console.error('Error reconnecting chat:', error);
      this.showNotification('Erreur de reconnexion chat', 'error');
      this.scheduleChatReconnection();
    }
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

  // ============================================================================
  // ===== RECORDING INTEGRATION =====
  // ============================================================================

  private initializeRecording(): void {
    this.recordingService.recordingStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.recordingStatus = status;
        this.cdr.detectChanges();
      });
  }

  async toggleRecording(): Promise<void> {
    if (!this.isHost || this.isRecordingProcessing) return;
    
    this.isRecordingProcessing = true;
    
    try {
      if (this.recordingStatus.isRecording) {
        await firstValueFrom(await this.recordingService.stopRecording(this.sessionId));
        this.showNotification('Enregistrement arrêté', 'success');
      } else {
        await firstValueFrom(await this.recordingService.startRecording(this.sessionId));
        this.showNotification('Enregistrement démarré', 'success');
      }
    } catch (error) {
      console.error('Recording toggle failed:', error);
      this.showNotification('Erreur lors de l\'enregistrement', 'error');
    } finally {
      this.isRecordingProcessing = false;
    }
  }

  get formattedRecordingDuration(): string {
    if (!this.recordingStatus.duration) return '00:00';
    return this.recordingService.formatDuration(this.recordingStatus.duration);
  }

  // ============================================================================
  // ===== VIDEO CONTAINERS MANAGEMENT =====
  // ============================================================================

  private ensureVideoContainers(): void {
    const containers = [
      { ref: 'mainVideoContainer', selector: '.main-video-wrapper', className: 'main-video' },
      { ref: 'thumbnailContainer', selector: '.thumbnails-grid', className: 'thumbnails-grid' },
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

  // ============================================================================
  // ===== LIVESTREAM CONNECTION =====
  // ============================================================================

  async startStreaming(): Promise<void> {
    try {
      this.resetConnectionState();
      this.ensureVideoContainers();
      
      const { token, role } = await this.getConnectionToken();
      
      if (!this.validateToken(token, role)) {
        throw new Error(`Invalid ${role} token received`);
      }

      console.log(`Connecting as ${role.toUpperCase()} to room:`, this.session!.roomName);
      
      await this.connectToRoom(token, role);
      await this.setupMediaWithRetry();
      
      this.finalizeConnection();
      
    } catch (error) {
      console.error('Connection failed:', error);
      this.handleConnectionError(error);
    }
  }

  private resetConnectionState(): void {
    this.error = undefined;
    this.reconnectionAttempts = 0;
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

  private finalizeConnection(): void {
    this.isConnected = true;
    this.showStartButton = false;
    this.streamStartTime = new Date();
    this.startStreamTimer();
    this.startQualityMonitoring();
    
    this.addLocalParticipantToList();
    
    this.showNotification('Successfully connected to livestream');
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

  // ============================================================================
  // ===== ROOM EVENT HANDLERS =====
  // ============================================================================

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

  private async setupMedia(): Promise<void> {
    if (!this.room) return;

    try {
      if (this.isHost) {
        console.log('Setting up producer media (camera + microphone)...');
        await this.room.localParticipant.enableCameraAndMicrophone();
        console.log('Producer media setup completed');
      } else {
        console.log('Setting up viewer media (optional)...');
        try {
          await this.room.localParticipant.enableCameraAndMicrophone();
          console.log('Viewer media setup completed');
        } catch (err) {
          console.log('Viewer media access denied, continuing as viewer-only');
        }
      }
    } catch (err) {
      console.error('Media access error:', err);
      
      if (this.isHost) {
        throw new Error('Producer must have camera and microphone access');
      } else {
        this.showNotification('Media access limited - you can still view the stream');
      }
    }
  }

  private async addLocalParticipantToList(): Promise<void> {
    if (!this.room || !this.currentUserId) return;
    
    try {
      const existingLocal = this.participantInfos.find(p => 
        p.participant.sid === this.room!.localParticipant.sid
      );
      
      if (existingLocal) return;
      
      const localParticipantInfo: ParticipantInfo = {
        participant: this.room.localParticipant as any,
        isProducer: this.isHost,
        name: this.currentUserId.toString(),
        displayName: 'Vous',
        joinedAt: new Date(),
        userId: this.currentUserId
      };
      
      try {
        const user = await firstValueFrom(this.userService.getUserById(this.currentUserId));
        let displayName = 'Vous';
        if (user.firstName && user.lastName) {
          displayName = `${user.firstName} ${user.lastName} (Vous)`;
        } else if (user.firstName) {
          displayName = `${user.firstName} (Vous)`;
        } else if (user.username) {
          displayName = `${user.username} (Vous)`;
        }
        localParticipantInfo.displayName = displayName;
      } catch (error) {
        console.warn('Could not load local user display name:', error);
      }
      
      this.participantInfos.unshift(localParticipantInfo);
      this.updateParticipantCounts();
      this.cdr.detectChanges();
      
    } catch (error) {
      console.error('Error adding local participant to list:', error);
    }
  }

  // ===== PARTICIPANT EVENTS =====
  private handleParticipantConnected(participant: RemoteParticipant): void {
    const participantInfo: ParticipantInfo = {
      participant,
      isProducer: participant.identity === this.session?.producerId.toString(),
      name: participant.identity,
      displayName: participant.identity,
      joinedAt: new Date(),
      userId: this.extractUserIdFromIdentity(participant.identity)
    };
    
    this.participantInfos.push(participantInfo);
    this.updateParticipantCounts();
    
    this.loadParticipantDisplayName(participantInfo);
    
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

  private extractUserIdFromIdentity(identity: string): number | undefined {
    const directId = parseInt(identity, 10);
    if (!isNaN(directId)) {
      return directId;
    }
    
    const idMatch = identity.match(/(\d+)/);
    if (idMatch) {
      return parseInt(idMatch[1], 10);
    }
    
    if (identity.includes('-')) {
      const parts = identity.split('-');
      for (const part of parts) {
        const id = parseInt(part, 10);
        if (!isNaN(id)) {
          return id;
        }
      }
    }
    
    console.warn('Could not extract user ID from identity:', identity);
    return undefined;
  }

  private async loadParticipantDisplayName(participantInfo: ParticipantInfo): Promise<void> {
    if (!participantInfo.userId) {
      console.warn('No userId found for participant:', participantInfo.name);
      return;
    }

    try {
      const user = await firstValueFrom(this.userService.getUserById(participantInfo.userId));
      
      let displayName = user.username;
      if (user.firstName && user.lastName) {
        displayName = `${user.firstName} ${user.lastName}`;
      } else if (user.firstName) {
        displayName = user.firstName;
      } else if (user.lastName) {
        displayName = user.lastName;
      }
      
      participantInfo.displayName = displayName;
      this.cdr.detectChanges();
      
      console.log(`Participant ${participantInfo.name} display name updated to: ${displayName}`);
      
    } catch (error) {
      console.error(`Failed to load display name for participant ${participantInfo.name}:`, error);
    }
  }

  // ===== TRACK EVENTS =====
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
        element = this.createMainVideoElement(elementId, false);
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mainVideoTrack = track;
      } else if (participantInfo?.isProducer && !this.mainVideoTrack) {
        element = this.createMainVideoElement(elementId, false);
        this.clearMainVideo();
        this.mainVideoContainer.nativeElement.appendChild(element);
        this.mainVideoTrack = track;
      } else {
        element = this.createThumbnailElement(
          elementId, 
          false, 
          participantInfo?.isProducer || false
        );
        this.thumbnailContainer.nativeElement.appendChild(element);
      }
      
      track.attach(element);
      this.mediaElements.set(elementId, {
        element,
        trackId: publication.trackSid,
        participantId: participant.sid,
        isLocal: false,
        source: track.source
      });
      
    } else if (track.kind === Track.Kind.Audio) {
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

  private async handleLocalTrackPublished(publication: LocalTrackPublication): Promise<void> {
    if (!publication.track || publication.kind !== Track.Kind.Video) return;

    try {
      if (publication.source === Track.Source.ScreenShare) {
        await this.handleScreenShareTrack(publication);
      } else if (publication.source === Track.Source.Camera) {
        await this.handleCameraTrack(publication);
      }
    } catch (error) {
      console.error('Error handling local track published:', error);
    }
  }

  private async handleScreenShareTrack(publication: LocalTrackPublication): Promise<void> {
    const elementId = `local-screen-${publication.trackSid}`;
    const element = this.createMainVideoElement(elementId, true);
    
    publication.track!.attach(element);
    this.clearMainVideo();
    this.mainVideoContainer.nativeElement.appendChild(element);
    
    this.mediaElements.set(elementId, {
      element,
      trackId: publication.trackSid,
      isLocal: true,
      source: Track.Source.ScreenShare
    });
    
    this.mainVideoTrack = publication.track as LocalVideoTrack;
    console.log('Screen share track published and displayed');
  }

  private async handleCameraTrack(publication: LocalTrackPublication): Promise<void> {
    this.cameraTrack = publication.track as LocalVideoTrack;
    console.log('Camera track published, isScreenSharing:', this.isScreenSharing);
    
    await this.waitForTrackReady(this.cameraTrack);
    
    if (this.isScreenSharing) {
      await this.placeCameraInPiP();
    } else {
      await this.placeCameraInMain();
    }
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

  private handleLocalTrackUnpublished(publication: LocalTrackPublication): void {
    if (publication.source === Track.Source.ScreenShare) {
      const screenElementIds = Array.from(this.mediaElements.keys())
        .filter(id => {
          const info = this.mediaElements.get(id);
          return info?.isLocal && info.source === Track.Source.ScreenShare;
        });
      
      screenElementIds.forEach(id => this.removeMediaElement(id));
      this.isScreenSharing = false;
      console.log('Screen share track unpublished');
      
    } else if (publication.source === Track.Source.Camera) {
      if (!this.isScreenSharing) {
        this.cleanupCameraElements();
        this.cameraTrack = undefined;
        console.log('Camera track unpublished');
      }
    }
  }

  // ===== CONNECTION EVENTS =====
  private handleReconnecting(): void {
    this.reconnectionAttempts++;
    this.showNotification(`Reconnecting... (${this.reconnectionAttempts}/${this.MAX_RECONNECTION_ATTEMPTS})`);
    
    if (this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
      this.showNotification('Connection lost - please refresh the page');
    }
  }

  private handleReconnected(): void {
    this.reconnectionAttempts = 0;
    this.showNotification('Reconnected successfully');
  }

  private handleConnectionQualityChanged(quality: ConnectionQuality, participant?: Participant): void {
    if (!participant) {
      console.log('Local connection quality:', quality);
    } else {
      console.log(`Connection quality for ${participant.identity}:`, quality);
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.cleanupAllMediaElements();
    this.stopStreamTimer();
    
    this.participantInfos = [];
    this.updateParticipantCounts();
    
    this.showNotification('Disconnected from session');
    this.cdr.detectChanges();
  }

  // ============================================================================
  // ===== MEDIA CONTROLS =====
  // ============================================================================

  async toggleMute(): Promise<void> {
    if (!this.room) return;
    
    try {
      this.isMuted = !this.isMuted;
      await this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);
      this.showNotification(this.isMuted ? 'Microphone muted' : 'Microphone unmuted');
    } catch (error) {
      console.error('Error toggling mute:', error);
      this.isMuted = !this.isMuted;
      this.showNotification('Failed to toggle microphone');
    }
  }

  async toggleVideo(): Promise<void> {
    if (!this.room) return;
    
    try {
      this.isVideoOff = !this.isVideoOff;
      
      if (this.isVideoOff) {
        this.cleanupCameraElements();
        await this.room.localParticipant.setCameraEnabled(false);
        this.cameraTrack = undefined;
        this.showNotification('Camera off');
      } else {
        await this.room.localParticipant.setCameraEnabled(true);
        this.showNotification('Camera on');
        
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
      this.showNotification('Failed to toggle camera');
    }
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.room || !this.isHost) return;

    try {
      if (this.isScreenSharing) {
        await this.stopScreenShareSafely();
      } else {
        await this.startScreenShareSafely();
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
      this.showNotification('Failed to toggle screen share');
      this.isScreenSharing = false;
    }
  }

  private async stopScreenShareSafely(): Promise<void> {
    await this.livestreamService.stopScreenShare(this.room!);
    this.isScreenSharing = false;
    this.showNotification('Screen sharing stopped');
    
    this.clearPipVideo();
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.restoreCameraToMain();
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
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (this.cameraTrack) {
      await this.placeCameraInMain();
    } else {
      await this.reactivateCamera();
    }
  }

  private async moveCameraToPiP(): Promise<void> {
    if (this.cameraTrack) {
      await this.placeCameraInPiP();
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
      this.showNotification('Failed to toggle fullscreen');
    }
  }

  async endSession(): Promise<void> {
    if (!this.isHost) return;
    
    try {
      if (this.room) {
        await this.livestreamService.disconnectFromRoom(this.room);
      }
      await firstValueFrom(this.livestreamService.endSession(this.sessionId));
      this.stopStreamTimer();
      this.navigateToSkillsPage();
    } catch (error) {
      console.error('Error ending session:', error);
      this.showNotification('Failed to end session');
    }
  }

  // ============================================================================
  // ===== CAMERA POSITIONING =====
  // ============================================================================

  private async placeCameraInMain(): Promise<void> {
    if (!this.cameraTrack) return;

    this.cleanupCameraElements();
    
    const elementId = `local-camera-main-${Date.now()}`;
    const element = this.createMainVideoElement(elementId, true);
    
    try {
      this.cameraTrack.detach();
      this.cameraTrack.attach(element);
      
      this.clearMainVideo();
      this.mainVideoContainer.nativeElement.appendChild(element);
      
      this.mediaElements.set(elementId, {
        element,
        trackId: this.cameraTrack.sid || 'camera-main',
        isLocal: true,
        source: Track.Source.Camera
      });
      
      this.mainVideoTrack = this.cameraTrack;
      console.log('Camera placed in main view');
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

  // ============================================================================
  // ===== VIDEO ELEMENT CREATION =====
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
  // ===== VIDEO NAVIGATION =====
  // ============================================================================

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

  // ============================================================================
  // ===== CLEANUP METHODS =====
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
    }
  }

  private cleanupParticipantElements(participantSid: string): void {
    Array.from(this.mediaElements.keys())
      .filter(key => {
        const info = this.mediaElements.get(key);
        return info?.participantId === participantSid;
      })
      .forEach(key => this.removeMediaElement(key));
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

  private cleanupAllMediaElements(): void {
    this.mediaElements.forEach((info, id) => {
      try {
        if (info.isLocal && this.cameraTrack && info.source === Track.Source.Camera) {
          this.cameraTrack.detach(info.element);
        }
        
        if (info.element instanceof HTMLVideoElement) {
          info.element.pause();
          info.element.srcObject = null;
        }
        
        info.element.removeEventListener('click', this.handleVideoClick);
        
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

  // ============================================================================
  // ===== UTILITY METHODS =====
  // ============================================================================

  private updateParticipantCounts(): void {
    this.totalParticipants = this.participantInfos.length;
    this.viewerCount = this.participantInfos.filter(info => !info.isProducer).length;
    this.cdr.detectChanges();
  }

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

  get formattedDuration(): string {
    const hours = Math.floor(this.streamDuration / 3600);
    const minutes = Math.floor((this.streamDuration % 3600) / 60);
    const seconds = this.streamDuration % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  trackParticipant(index: number, participant: ParticipantInfo): string {
    return participant.participant.sid;
  }

  navigateToSkillsPage(): void {
    this.router.navigate([this.isHost ? '/producer/skills' : '/receiver/skills']);
  }

  // ============================================================================
  // ===== ERROR HANDLING =====
  // ============================================================================

  private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
    this.snackBar.open(message, 'Close', { 
      duration: 3000,
      panelClass: type === 'error' ? ['error-snackbar'] : ['success-snackbar']
    });
  }

  private handleError(error: any): void {
    console.error('Component error:', error);
    this.error = error instanceof Error ? error.message : 'Initialization failed';
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
        return 'Camera/microphone permissions required';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        return 'Network connection failed - check your internet';
      } else if (error.message.includes('token') || error.message.includes('authentication')) {
        return 'Authentication failed - please refresh the page';
      }
      return `Connection failed: ${error.message}`;
    }
    return 'Connection failed - please check your network and permissions';
  }

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

  // Méthodes pour les labels des messages
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

  // Méthodes pour les indicateurs de frappe
  getTypingIndicatorAriaLabel(): string {
    const count = this.typingUsersArray.length;
    if (count === 0) return '';
    
    if (count === 1) {
      return `${this.typingUsersArray[0].username} est en train d'écrire`;
    }
    
    const names = this.typingUsersArray.map(u => u.username).join(', ');
    return `${names} sont en train d'écrire`;
  }

  // Méthodes pour le bouton de toggle du chat
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

}