// chat.service.ts - VERSION COMPLÈTE CORRIGÉE
import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { KeycloakService } from '../keycloak.service';
import { BehaviorSubject, Observable, Subject, from, throwError, of } from 'rxjs';
import { catchError, switchMap, tap, map, distinctUntilChanged, takeUntil, timeout } from 'rxjs/operators';
import { Client, IMessage } from '@stomp/stompjs';

export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  type?: 'user' | 'system';
}

export interface TypingIndicator {
  userId: string;
  username: string;
  isTyping: boolean;
  timestamp: Date;
}

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'RECONNECTING';

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  // 🔧 Configuration des URLs
  private readonly apiUrl = 'http://localhost:8822/api/v1/livestream';
  private readonly wsUrl = 'ws://localhost:8822/ws';
  
  // 🔧 Client WebSocket
  private stompClient: Client | null = null;
  
  // 🔧 État de l'application
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private typingSubject = new BehaviorSubject<TypingIndicator[]>([]);
  private connectionStatus = new BehaviorSubject<ConnectionStatus>('DISCONNECTED');
  private destroy$ = new Subject<void>();
  
  // 🔧 Variables d'état
  private currentSessionId: number | null = null;
  private userId: string | null = null;
  private username: string | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private activeTypingUsers = new Map<string, TypingIndicator>();
  private reconnectTimer: any;
  private heartbeatTimer: any;

  // 🔧 Observables publics
  public readonly messages$ = this.messagesSubject.asObservable();
  public readonly typing$ = this.typingSubject.asObservable();
  public readonly connectionStatus$ = this.connectionStatus.asObservable();

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService,
    private ngZone: NgZone
  ) {
    this.initializeService();
  }

  // ============================================================================
  // ===== INITIALISATION =====
  // ============================================================================

 private async initializeService(): Promise<void> {
  try {
    console.log('🚀 Initializing ChatService...');
    
    // Récupérer l'ID utilisateur
    this.userId = await this.keycloakService.getUserId();
    if (!this.userId) {
      console.error('❌ User ID not available for chat');
      return;
    }
    
    // Récupérer le profil utilisateur
    await this.loadUserProfile();
    
    console.log('✅ ChatService initialized (ready for connection):', { 
      userId: this.userId, 
      username: this.username 
    });
    
    // 🔥 NE PLUS se connecter automatiquement ici
    // await this.connectWebSocket(); // SUPPRIMER CETTE LIGNE
    
  } catch (error) {
    console.error('❌ ChatService initialization failed:', error);
  }}

  private async loadUserProfile(): Promise<void> {
    try {
      const userProfile = await this.keycloakService.getUserProfile();
      if (userProfile) {
        this.username = userProfile.username || 
                        `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim() || 
                        'Utilisateur';
      } else {
        this.username = 'Utilisateur';
      }
    } catch (error) {
      console.warn('⚠️ Could not load user profile, using fallback username');
      this.username = 'Utilisateur';
    }
  }

  // ============================================================================
  // ===== CONNEXION WEBSOCKET =====
  // ============================================================================

  async connectWebSocket(): Promise<void> {
    if (this.isConnected || this.connectionStatus.value === 'CONNECTING') {
      console.log('🔄 WebSocket already connected or connecting');
      return;
    }

    console.log('🚀 Connecting to Chat WebSocket via Gateway...');
    this.connectionStatus.next('CONNECTING');
    
    try {
      // Vérifier les prérequis
      const token = await this.keycloakService.getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      if (!this.userId || !this.username) {
        throw new Error('User information not available');
      }

      // Nettoyer l'ancienne connexion
      await this.cleanupExistingConnection();

      // Créer nouvelle connexion
      await this.createWebSocketConnection(token);

    } catch (error) {
      console.error('❌ Chat WebSocket connection failed:', error);
      this.connectionStatus.next('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  private async cleanupExistingConnection(): Promise<void> {
    if (this.stompClient) {
      try {
        await this.stompClient.deactivate();
      } catch (error) {
        console.warn('⚠️ Error deactivating existing STOMP client:', error);
      }
      this.stompClient = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async createWebSocketConnection(token: string): Promise<void> {
    console.log('🔌 Connecting via Gateway to:', this.wsUrl);
    
    this.stompClient = new Client({
      brokerURL: this.wsUrl,
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      debug: (str) => console.log('🔍 Chat STOMP:', str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      
      onConnect: (frame) => {
        this.ngZone.run(() => {
          console.log('✅ Chat WebSocket connected via Gateway!');
          this.handleSuccessfulConnection();
        });
      },
      
      onStompError: (frame) => {
        this.ngZone.run(() => {
          console.error('❌ Chat STOMP error:', frame.headers['message']);
          console.error('❌ Error details:', frame.body);
          this.handleConnectionError();
        });
      },
      
      onWebSocketError: (event) => {
        this.ngZone.run(() => {
          console.error('❌ Chat WebSocket error:', event);
          this.handleConnectionError();
        });
      },
      
      onDisconnect: () => {
        this.ngZone.run(() => {
          console.warn('⚠️ Chat WebSocket disconnected');
          this.handleDisconnection();
        });
      }
    });

    this.stompClient.activate();
  }

  private handleSuccessfulConnection(): void {
    this.connectionStatus.next('CONNECTED');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    
    // Auto-rejoindre la session si définie
    if (this.currentSessionId) {
      this.subscribeToSession(this.currentSessionId);
    }
    
    // Démarrer le heartbeat
    this.startHeartbeat();
  }

  private handleConnectionError(): void {
    this.connectionStatus.next('DISCONNECTED');
    this.isConnected = false;
    this.scheduleReconnect();
  }

  private handleDisconnection(): void {
    this.connectionStatus.next('DISCONNECTED');
    this.isConnected = false;
    this.stopHeartbeat();
  }

  // ============================================================================
  // ===== RECONNEXION AUTOMATIQUE =====
  // ============================================================================

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`🔄 Scheduling chat reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
      this.connectionStatus.next('RECONNECTING');
      
      this.reconnectTimer = setTimeout(() => {
        this.connectWebSocket();
      }, delay);
    } else {
      console.error('❌ Max chat reconnection attempts reached');
      this.connectionStatus.next('DISCONNECTED');
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.stompClient && this.isConnected) {
        try {
          // Ping simple pour maintenir la connexion
          this.stompClient.publish({
            destination: '/app/heartbeat',
            body: JSON.stringify({ timestamp: Date.now() })
          });
        } catch (error) {
          console.warn('⚠️ Heartbeat failed:', error);
        }
      }
    }, 30000); // Heartbeat toutes les 30 secondes
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ============================================================================
  // ===== GESTION DES SESSIONS =====
  // ============================================================================

  async joinSession(sessionId: number): Promise<void> {
    try {
      this.currentSessionId = sessionId;
      console.log(`🎯 Joining chat session: ${sessionId}`);
      
      // Charger l'historique des messages
      await this.loadSessionMessages(sessionId);
      
      // Se connecter au WebSocket si nécessaire
      if (!this.isConnected) {
        await this.connectWebSocket();
        
        // Attendre la connexion avec timeout
        await this.waitForConnection();
      }
      
      // S'abonner aux topics de la session
      if (this.isConnected) {
        this.subscribeToSession(sessionId);
      }
      
    } catch (error) {
      console.error('❌ Error joining chat session:', error);
      throw error;
    }
  }

  private async waitForConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const subscription = this.connectionStatus$.pipe(
        takeUntil(this.destroy$)
      ).subscribe(status => {
        if (status === 'CONNECTED') {
          subscription.unsubscribe();
          resolve();
        }
      });
      
      // Timeout de sécurité
      setTimeout(() => {
        subscription.unsubscribe();
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        } else {
          resolve();
        }
      }, 10000);
    });
  }

  private subscribeToSession(sessionId: number): void {
    if (!this.stompClient || !this.userId) {
      console.warn('❌ Cannot subscribe: stompClient or userId missing');
      return;
    }
    
    console.log(`🔔 Subscribing to chat session: ${sessionId}`);
    
    try {
      // S'abonner aux messages du chat
      this.stompClient.subscribe(
        `/topic/session/${sessionId}/chat`,
        (message: IMessage) => {
          this.processMessage(message);
        },
        { 
          id: `chat-session-${sessionId}`,
          'auto-delete': 'true'
        }
      );

      // S'abonner aux indicateurs de frappe
      this.stompClient.subscribe(
        `/topic/session/${sessionId}/typing`,
        (message: IMessage) => {
          this.processTypingIndicator(message);
        },
        { 
          id: `typing-session-${sessionId}`,
          'auto-delete': 'true'
        }
      );

      // Notifier la connexion à la session
      this.stompClient.publish({
        destination: `/app/session/${sessionId}/join`,
        body: JSON.stringify({ 
          timestamp: new Date().toISOString() 
        })
      });

      console.log(`✅ Successfully subscribed to chat session ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Error subscribing to session:', error);
    }
  }

  leaveSession(sessionId: number): void {
    try {
      if (this.stompClient && this.isConnected) {
        this.stompClient.publish({
          destination: `/app/session/${sessionId}/leave`,
          body: JSON.stringify({ 
            timestamp: new Date().toISOString() 
          })
        });
      }
      
      this.currentSessionId = null;
      this.messagesSubject.next([]);
      this.typingSubject.next([]);
      this.activeTypingUsers.clear();
      
      console.log(`👋 Left chat session ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Error leaving session:', error);
    }
  }

  // ============================================================================
  // ===== TRAITEMENT DES MESSAGES =====
  // ============================================================================

  private processMessage(message: IMessage): void {
    try {
      const chatMessage: ChatMessage = JSON.parse(message.body);
      
      if (!this.isValidMessage(chatMessage)) {
        console.warn('❌ Invalid message structure:', chatMessage);
        return;
      }

      // Conversion du timestamp
      chatMessage.timestamp = new Date(chatMessage.timestamp);

      this.ngZone.run(() => {
        const currentMessages = [...this.messagesSubject.value];
        
        // Éviter les doublons
        const isDuplicate = currentMessages.some(m => 
          m.userId === chatMessage.userId && 
          Math.abs(m.timestamp.getTime() - chatMessage.timestamp.getTime()) < 1000 &&
          m.message === chatMessage.message
        );
        
        if (!isDuplicate) {
          currentMessages.push(chatMessage);
          currentMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          this.messagesSubject.next(currentMessages);
          console.log('✨ New chat message from:', chatMessage.username);
        }
      });
      
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  }

  private processTypingIndicator(message: IMessage): void {
    try {
      const indicator: TypingIndicator = JSON.parse(message.body);
      
      if (!indicator || indicator.userId === this.userId) {
        return; // Ignorer ses propres indicateurs
      }

      this.ngZone.run(() => {
        if (indicator.isTyping) {
          this.activeTypingUsers.set(indicator.userId, {
            ...indicator,
            timestamp: new Date(indicator.timestamp)
          });
        } else {
          this.activeTypingUsers.delete(indicator.userId);
        }
        
        const typingArray = Array.from(this.activeTypingUsers.values());
        this.typingSubject.next(typingArray);
      });
      
    } catch (error) {
      console.error('❌ Error processing typing indicator:', error);
    }
  }

  private isValidMessage(message: any): boolean {
    return message &&
           typeof message.userId === 'string' &&
           typeof message.username === 'string' &&
           typeof message.message === 'string' &&
           message.timestamp;
  }

  // ============================================================================
  // ===== ENVOI DE MESSAGES =====
  // ============================================================================

  sendMessage(sessionId: number, message: string): void {
    if (!this.stompClient || !this.isConnected) {
      console.error('❌ Cannot send message: WebSocket not connected');
      throw new Error('Chat not connected');
    }

    if (!message.trim()) {
      console.warn('⚠️ Cannot send empty message');
      return;
    }

    try {
      const chatMessage: Partial<ChatMessage> = {
        message: message.trim(),
        timestamp: new Date()
      };

      console.log(`📤 Sending message to session ${sessionId}:`, message);

      this.stompClient.publish({
        destination: `/app/session/${sessionId}/chat`,
        body: JSON.stringify(chatMessage)
      });

      console.log(`✅ Message sent successfully`);
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  sendTypingIndicator(sessionId: number, isTyping: boolean): void {
    if (!this.stompClient || !this.isConnected) {
      return;
    }

    try {
      const indicator: Partial<TypingIndicator> = {
        isTyping: isTyping,
        timestamp: new Date()
      };

      this.stompClient.publish({
        destination: `/app/session/${sessionId}/typing`,
        body: JSON.stringify(indicator)
      });
      
    } catch (error) {
      console.error('❌ Error sending typing indicator:', error);
    }
  }

  // ============================================================================
  // ===== HISTORIQUE DES MESSAGES =====
  // ============================================================================

  private async loadSessionMessages(sessionId: number): Promise<void> {
    try {
      console.log(`📚 Loading chat history for session: ${sessionId}`);
      const messages = await this.getSessionMessages(sessionId).toPromise();
      
      this.ngZone.run(() => {
        this.messagesSubject.next(messages || []);
        console.log(`✅ Loaded ${messages?.length || 0} chat messages`);
      });
      
    } catch (error) {
      console.error('❌ Failed to load session messages:', error);
      this.messagesSubject.next([]);
    }
  }

  getSessionMessages(sessionId: number): Observable<ChatMessage[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        return this.http.get<ChatMessage[]>(
          `${this.apiUrl}/${sessionId}/messages`,
          { headers }
        ).pipe(
          timeout(10000),
          map(messages => (messages || []).map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))),
          tap(messages => console.log(`📬 Fetched ${messages.length} messages from API`)),
          catchError(error => {
            console.error('❌ Error fetching session messages:', error);
            return of([]);
          })
        );
      })
    );
  }

  // ============================================================================
  // ===== GETTERS PUBLICS =====
  // ============================================================================

  get isConnectedToChat(): boolean {
    return this.connectionStatus.value === 'CONNECTED';
  }

  get currentMessages(): ChatMessage[] {
    return this.messagesSubject.value;
  }

  get activeTypingUsersArray(): TypingIndicator[] {
    return Array.from(this.activeTypingUsers.values());
  }

  get currentConnectionStatus(): ConnectionStatus {
    return this.connectionStatus.value;
  }

  // ============================================================================
  // ===== TEST DE CONNEXION =====
  // ============================================================================

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test de l'API REST
      const token = await this.keycloakService.getToken();
      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      
      await this.http.get(`${this.apiUrl}/health`, { headers }).pipe(
        timeout(5000)
      ).toPromise();
      
      // Test WebSocket
      if (!this.isConnected) {
        await this.connectWebSocket();
        await this.waitForConnection();
      }
      
      return { 
        success: true, 
        message: 'Chat service is fully operational' 
      };
      
    } catch (error) {
      return { 
        success: false, 
        message: `Chat service test failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  // ============================================================================
  // ===== NETTOYAGE =====
  // ============================================================================

  async ngOnDestroy(): Promise<void> {
    console.log('🧹 Cleaning up ChatService...');
    
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.stopHeartbeat();
    
    if (this.currentSessionId) {
      this.leaveSession(this.currentSessionId);
    }
    
    await this.cleanupExistingConnection();
    
    console.log('✅ ChatService cleanup completed');
  }

  // ============================================================================
  // ===== MÉTHODES DE DÉBOGAGE =====
  // ============================================================================

  getDebugInfo(): any {
    return {
      isConnected: this.isConnected,
      connectionStatus: this.connectionStatus.value,
      currentSessionId: this.currentSessionId,
      userId: this.userId,
      username: this.username,
      messagesCount: this.messagesSubject.value.length,
      typingUsersCount: this.activeTypingUsers.size,
      reconnectAttempts: this.reconnectAttempts,
      hasStompClient: !!this.stompClient
    };
  }

  // Force reconnection (pour les tests)
  async forceReconnect(): Promise<void> {
    console.log('🔄 Forcing chat reconnection...');
    this.reconnectAttempts = 0;
    await this.cleanupExistingConnection();
    await this.connectWebSocket();
  }
}