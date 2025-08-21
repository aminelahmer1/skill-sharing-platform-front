// messaging.service.ts - VERSION COMPLÈTE ET CORRIGÉE
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, from, interval, Subject, timer, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap, takeUntil, retry, delay, filter, retryWhen, take } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

// ===== INTERFACES =====
export interface Message {
  id?: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'SYSTEM';
  status: 'SENT' | 'DELIVERED' | 'READ';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  sentAt: Date;
  readAt?: Date;
  editedAt?: Date;
  isDeleted: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  replyToMessageId?: number;
}

export interface Conversation {
  id: number;
  name: string;
  type: 'DIRECT' | 'GROUP' | 'SKILL_GROUP';
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED' | 'CANCELLED';
  skillId?: number;
  participants: Participant[];
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
  createdAt: Date;
  updatedAt?: Date;
  canSendMessage?: boolean;
  isAdmin?: boolean;
  conversationAvatar?: string;
}

export interface Participant {
  userId: number;
  userName: string;
  role: 'ADMIN' | 'MEMBER';
  isOnline: boolean;
  avatar?: string;
  lastSeen?: Date;
}

export interface MessageRequest {
  conversationId: number;
  senderId?: number;
  content: string;
  type?: string;
  attachmentUrl?: string;
  replyToMessageId?: number;
}

export interface TypingIndicator {
  userId: number;
  userName: string;
  conversationId: number;
  isTyping: boolean;
  timestamp: Date;
}

export interface CreateDirectConversationRequest {
  currentUserId: number;
  otherUserId: number;
}

export interface CreateSkillConversationRequest {
  skillId: number;
}

export interface CreateGroupConversationRequest {
  name: string;
  participantIds: number[];
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MessagingService {
  // ===== CONFIGURATION =====
  private readonly apiUrl = 'http://localhost:8822/api/v1/messages';
  private readonly wsUrl = 'http://localhost:8822/ws/messaging';
  
  // ===== OBSERVABLES =====
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private currentConversationSubject = new BehaviorSubject<Conversation | null>(null);
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  private typingIndicatorsSubject = new BehaviorSubject<TypingIndicator[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private quickChatOpenSubject = new BehaviorSubject<boolean>(false);
  private quickChatConversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private connectionStatusSubject = new BehaviorSubject<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('DISCONNECTED');

  // ===== OBSERVABLES PUBLICS =====
  conversations$ = this.conversationsSubject.asObservable();
  currentConversation$ = this.currentConversationSubject.asObservable();
  messages$ = this.messagesSubject.asObservable();
  typingIndicators$ = this.typingIndicatorsSubject.asObservable();
  unreadCount$ = this.unreadCountSubject.asObservable();
  quickChatOpen$ = this.quickChatOpenSubject.asObservable();
  quickChatConversations$ = this.quickChatConversationsSubject.asObservable();
  connectionStatus$ = this.connectionStatusSubject.asObservable();

  // ===== PROPRIÉTÉS PRIVÉES =====
  private stompClient: Client | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer?: any;
  private destroy$ = new Subject<void>();
  private currentUserId?: number;
  private isInitialized = false;
  private pollingInterval?: any;

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {
    this.initializeService();
  }

  // ===== INITIALISATION =====
 private async initializeService() {
    try {
      // Attendre d'abord que l'ID utilisateur soit chargé
      await this.loadUserInfo();
      
      // Puis attendre l'authentification
      this.keycloakService.authStatus$
        .pipe(
          filter(status => status === true),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          if (!this.isInitialized && this.currentUserId) {
            this.isInitialized = true;
            this.initializeStompConnection();
            this.startPolling();
          }
        });
      
    } catch (error) {
      console.error('❌ Failed to initialize messaging service:', error);
    }
  }

  private async loadUserInfo() {
    try {
      const profile = await this.keycloakService.getUserProfile();
      if (profile?.id) {
        console.log('🔍 Keycloak profile loaded:', profile);
        
        // ✅ NOUVEAU: Appeler le service utilisateur pour obtenir l'ID réel
        const realUserId = await this.getRealUserId(profile.id);
        if (realUserId) {
          this.currentUserId = realUserId;
          console.log('✅ Real user ID loaded from backend:', this.currentUserId);
        } else {
          // Fallback vers la génération d'ID
          this.currentUserId = this.generateNumericIdFromUUID(profile.id);
          console.log('⚠️ Using generated ID as fallback:', this.currentUserId);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load user info:', error);
    }
  }
private async getRealUserId(keycloakId: string): Promise<number | null> {
    try {
      const token = await this.keycloakService.getToken();
      if (!token) return null;

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      // Appeler l'API pour obtenir l'utilisateur par Keycloak ID
      const response = await this.http.get<any>(
        `http://localhost:8822/api/v1/users/by-keycloak-id?keycloakId=${keycloakId}`,
        { headers }
      ).toPromise();

      if (response && response.id) {
        console.log('✅ User found in backend:', response);
        return response.id;
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching real user ID:', error);
      return null;
    }
  }

  private generateNumericIdFromUUID(uuid: string): number {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      const char = uuid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 999999 + 1;
  }

  // ===== WEBSOCKET CONNECTION =====
private async initializeStompConnection() {
    try {
        const token = await this.keycloakService.getToken();
        if (!token) {
            console.error('❌ No token available for WebSocket connection');
            this.scheduleReconnect();
            return;
        }

        console.log('🔌 Initializing STOMP connection with token');

        // Utiliser la même configuration que notification.service
        this.stompClient = new Client({
            brokerURL: this.wsUrl,
            connectHeaders: {
                Authorization: `Bearer ${token}`,
                'X-Authorization': `Bearer ${token}`
            },
            debug: (str) => {
                console.log('🐞 STOMP Debug:', str);
            },
            reconnectDelay: 5000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,
            
            onConnect: (frame) => {
                console.log('✅ STOMP Connected successfully:', frame);
                this.connectionStatusSubject.next('CONNECTED');
                this.reconnectAttempts = 0;
                this.subscribeToTopics();
            },
            
            onStompError: (frame) => {
                console.error('❌ STOMP Error:', frame);
                this.connectionStatusSubject.next('ERROR');
                this.scheduleReconnect();
            },
            
            onWebSocketError: (event) => {
                console.error('❌ WebSocket Error:', event);
                this.connectionStatusSubject.next('ERROR');
                this.scheduleReconnect();
            },
            
            onWebSocketClose: (event) => {
                console.warn('⚠️ WebSocket Closed:', event);
                this.connectionStatusSubject.next('DISCONNECTED');
                this.scheduleReconnect();
            }
        });

        this.connectionStatusSubject.next('CONNECTING');
        this.stompClient.activate();
        
    } catch (error) {
        console.error('❌ Failed to initialize STOMP connection:', error);
        this.connectionStatusSubject.next('ERROR');
        this.scheduleReconnect();
    }
}

  private subscribeToTopics() {
    if (!this.stompClient || !this.stompClient.connected) {
      console.warn('⚠️ STOMP client not connected for subscriptions');
      return;
    }

    if (!this.currentUserId) {
      console.error('❌ No user ID available for subscriptions');
      return;
    }

    try {
      // Messages personnels
      this.stompClient.subscribe(`/user/${this.currentUserId}/queue/conversation`, (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('📨 Received user message:', data);
          this.handleNewMessage(data);
        } catch (error) {
          console.error('❌ Error parsing user message:', error);
        }
      });

      // Messages de conversation
      this.stompClient.subscribe('/topic/conversation/*', (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('📨 Received conversation message:', data);
          this.handleNewMessage(data);
        } catch (error) {
          console.error('❌ Error parsing conversation message:', error);
        }
      });

      // Indicateurs de frappe
      this.stompClient.subscribe('/topic/typing', (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('⌨️ Received typing indicator:', data);
          this.handleTypingIndicator(data);
        } catch (error) {
          console.error('❌ Error parsing typing indicator:', error);
        }
      });

      // Statut des messages
      this.stompClient.subscribe('/topic/message-status', (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('📋 Received message status:', data);
          this.handleMessageStatusUpdate(data);
        } catch (error) {
          console.error('❌ Error parsing message status:', error);
        }
      });

      console.log('✅ Subscribed to all STOMP topics');
      
    } catch (error) {
      console.error('❌ Failed to subscribe to topics:', error);
    }
  }
 async syncUserId(): Promise<number | undefined> {
    if (!this.currentUserId) {
      await this.loadUserInfo();
    }
    return this.currentUserId;
  }

  // ✅ NOUVEAU: Méthode publique pour obtenir l'ID utilisateur réel
  async getCurrentUserIdAsync(): Promise<number | undefined> {
    if (this.currentUserId) {
      return this.currentUserId;
    }
    return await this.syncUserId();
  }
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.connectionStatusSubject.next('ERROR');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}`);
      this.initializeStompConnection();
    }, delay);
  }

  // ===== HANDLERS WEBSOCKET =====
  private handleNewMessage(message: Message) {
    const messages = this.messagesSubject.value;
    
    if (!messages.find(m => m.id === message.id)) {
      this.messagesSubject.next([...messages, message]);
      this.updateConversationLastMessage(message.conversationId, message);
      
      const currentConv = this.currentConversationSubject.value;
      if (!currentConv || currentConv.id !== message.conversationId) {
        this.incrementUnreadCount();
      }
    }
  }

  private handleTypingIndicator(indicator: TypingIndicator) {
    const indicators = this.typingIndicatorsSubject.value;
    
    if (indicator.isTyping) {
      const existing = indicators.findIndex(i => 
        i.userId === indicator.userId && i.conversationId === indicator.conversationId
      );
      
      if (existing >= 0) {
        indicators[existing] = indicator;
      } else {
        indicators.push(indicator);
      }
      
      this.typingIndicatorsSubject.next([...indicators]);
      
      timer(3000).subscribe(() => {
        const current = this.typingIndicatorsSubject.value;
        const filtered = current.filter(i => 
          !(i.userId === indicator.userId && i.conversationId === indicator.conversationId)
        );
        this.typingIndicatorsSubject.next(filtered);
      });
      
    } else {
      const filtered = indicators.filter(i => 
        !(i.userId === indicator.userId && i.conversationId === indicator.conversationId)
      );
      this.typingIndicatorsSubject.next(filtered);
    }
  }

  private handleMessageStatusUpdate(data: any) {
    const messages = this.messagesSubject.value;
    const updated = messages.map(m => {
      if (m.id === data.messageId) {
        return { ...m, status: data.status, readAt: data.readAt };
      }
      return m;
    });
    this.messagesSubject.next(updated);
  }

  // ===== API METHODS =====

  // Récupération des conversations
// messaging.service.ts - S POUR LE CHARGEMENT DES CONVERSATIONS

// Dans la méthode getUserConversations:

//   PRINCIPALE: Améliorer la méthode getUserConversations
/**
 * Récupère les conversations de l'utilisateur avec synchronisation de l'ID
 * @param page - Numéro de page (défaut: 0)
 * @param size - Taille de page (défaut: 20)
 * @returns Observable<Conversation[]>
 */
/**
   * ✅ NOUVEAU: Méthode de diagnostic complète
   */
  async diagnoseUserAndConversations(): Promise<void> {
    console.log('🔍 === DIAGNOSTIC COMPLET ===');
    
    try {
      // 1. Vérifier l'ID utilisateur
      const userId = await this.ensureUserIdSynchronized();
      console.log('1. User ID resolved:', userId);
      
      // 2. Vérifier le token
      const token = await this.keycloakService.getToken();
      console.log('2. Token available:', !!token);
      
      // 3. Tester la connexion backend
      if (token && userId) {
        const backendConnected = await this.testBackendConnection().toPromise();
        console.log('3. Backend connection:', backendConnected);
        
        // 4. Appeler l'endpoint de diagnostic backend
        try {
          const debugResponse = await this.callBackendDiagnostic(token).toPromise();
          console.log('4. Backend diagnostic response:', debugResponse);
        } catch (error) {
          console.error('4. Backend diagnostic failed:', error);
        }
      }
      
    } catch (error) {
      console.error('❌ Diagnostic error:', error);
    }
    
    console.log('🔍 === FIN DIAGNOSTIC ===');
  }

  /**
   * ✅ NOUVEAU: Appeler l'endpoint de diagnostic backend
   */
  private callBackendDiagnostic(token: string): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    
    return this.http.get(`${this.apiUrl}/debug/user-conversations`, { headers });
  }

  /**
   * ✅ AMÉLIORATION: getUserConversations avec retry et diagnostic
   */
   getUserConversations(page = 0, size = 20): Observable<Conversation[]> {
    console.log('📡 MessagingService: getUserConversations called', { page, size });
    
    return from(this.ensureUserIdSynchronized()).pipe(
      switchMap(userId => {
        if (!userId) {
          console.error('❌ No user ID available after synchronization');
          // Lancer le diagnostic en cas d'échec
          this.diagnoseUserAndConversations();
          return of([]);
        }
        
        console.log('✅ User ID synchronized:', userId);
        return from(this.keycloakService.getToken()).pipe(
          map(token => ({ token, userId } as { token: string | null; userId: number }))
        );
      }),
      
      switchMap((data: { token: string | null; userId: number } | never[]) => {
        // ✅ CORRECTION: Vérification de type explicite
        if (Array.isArray(data) || !data) {
          return of([]);
        }
        
        const { token, userId } = data;
        
        if (!token) {
          console.error('❌ No token available for fetching conversations');
          return of([]);
        }
        
        return this.fetchConversationsFromAPI(token, userId, page, size);
      }),
      
      map(response => this.processConversationsResponse(response)),
      
      tap(conversations => {
        console.log('✅ Conversations loaded and processed:', conversations.length);
        this.conversationsSubject.next(conversations);
        
        // Si aucune conversation trouvée et c'est la première page, lancer le diagnostic
        if (conversations.length === 0 && page === 0) {
          console.warn('⚠️ No conversations found, running diagnostic...');
          setTimeout(() => this.diagnoseUserAndConversations(), 1000);
        }
        
        if (conversations.length > 0) {
          conversations.forEach((conv, index) => {
            console.log(`📋 Conversation ${index + 1}:`, {
              id: conv.id,
              name: conv.name,
              type: conv.type,
              participantsCount: conv.participants?.length || 0
            });
          });
        }
      }),
      
      catchError(error => {
        console.error('❌ Fatal error in getUserConversations:', error);
        this.handleConversationLoadError(error);
        
        // Lancer le diagnostic en cas d'erreur
        setTimeout(() => this.diagnoseUserAndConversations(), 1000);
        
        return of([]);
      }),
      
      // ✅ CORRECTION: Retry avec gestion d'erreur plus simple
      retry(2) // Réessayer 2 fois en cas d'erreur
    );
  }

  /**
   * ✅ NOUVEAU: Forcer un rechargement complet avec diagnostic
   */
  forceReloadWithDiagnostic(): Observable<Conversation[]> {
    console.log('🔄 Force reload with diagnostic...');
    
    return from(this.diagnoseUserAndConversations()).pipe(
      delay(1000), // Attendre que le diagnostic se termine
      switchMap(() => this.forceReloadConversations())
    );
  }

/**
 * S'assure que l'ID utilisateur est correctement synchronisé
 */
private async ensureUserIdSynchronized(): Promise<number | undefined> {
  // Si l'ID est déjà défini et valide, le retourner
  if (this.currentUserId && this.currentUserId > 0) {
    console.log('✅ Using existing user ID:', this.currentUserId);
    return this.currentUserId;
  }
  
  console.log('🔄 Synchronizing user ID...');
  
  try {
    // Obtenir le profil Keycloak
    const profile = await this.keycloakService.getUserProfile();
    if (!profile?.id) {
      throw new Error('No Keycloak profile available');
    }
    
    console.log('🔍 Keycloak profile ID:', profile.id);
    
    // Essayer de récupérer l'ID réel depuis le backend
    const token = await this.keycloakService.getToken();
    if (token) {
      const realUserId = await this.fetchRealUserIdFromBackend(profile.id, token);
      if (realUserId) {
        this.currentUserId = realUserId;
        console.log('✅ Real user ID fetched from backend:', this.currentUserId);
        return this.currentUserId;
      }
    }
    
    // Fallback: générer un ID depuis l'UUID
    this.currentUserId = this.generateNumericIdFromUUID(profile.id);
    console.log('⚠️ Using generated ID as fallback:', this.currentUserId);
    return this.currentUserId;
    
  } catch (error) {
    console.error('❌ Error synchronizing user ID:', error);
    return undefined;
  }
}

/**
 * Récupère l'ID utilisateur réel depuis le backend
 */
private async fetchRealUserIdFromBackend(keycloakId: string, token: string): Promise<number | null> {
  try {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    
    const response = await this.http.get<any>(
      `${this.apiUrl.replace('/messages', '/users')}/by-keycloak-id`,
      { 
        headers,
        params: { keycloakId }
      }
    ).toPromise();
    
    if (response?.id) {
      return response.id;
    }
    
    return null;
  } catch (error) {
    console.warn('⚠️ Could not fetch real user ID from backend:', error);
    return null;
  }
}

/**
 * Effectue l'appel HTTP pour récupérer les conversations
 */
private fetchConversationsFromAPI(
  token: string, 
  userId: number, 
  page: number, 
  size: number
): Observable<any> {
  const headers = new HttpHeaders({ 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-User-Id': userId.toString() // Envoyer l'ID dans le header pour debug
  });
  
  const url = `${this.apiUrl}/conversations`;
  const params = { 
    page: page.toString(), 
    size: size.toString() 
  };
  
  console.log('📡 Making HTTP request:', {
    url,
    userId,
    page,
    size
  });
  
  return this.http.get<any>(url, { headers, params }).pipe(
    tap(response => {
      console.log('📡 Raw API response:', {
        hasContent: !!response,
        isArray: Array.isArray(response),
        hasContentProperty: !!(response?.content),
        contentLength: response?.content?.length || response?.length || 0
      });
    }),
    retry(2), // Réessayer 2 fois en cas d'échec
    catchError(error => {
      console.error('❌ HTTP Error:', {
        status: error.status,
        message: error.message,
        url: error.url,
        error: error.error
      });
      
      // Retourner une réponse vide plutôt que de propager l'erreur
      return of({ content: [], totalElements: 0 });
    })
  );
}

/**
 * Traite la réponse de l'API pour extraire les conversations
 */
private processConversationsResponse(response: any): Conversation[] {
  console.log('🔄 Processing API response...');
  
  if (!response) {
    console.warn('⚠️ Empty response received');
    return [];
  }
  
  let conversations: Conversation[] = [];
  
  // Cas 1: Réponse est directement un tableau
  if (Array.isArray(response)) {
    conversations = response;
    console.log('✅ Direct array response:', conversations.length);
  }
  // Cas 2: Réponse paginée Spring (Page<T>)
  else if (response.content && Array.isArray(response.content)) {
    conversations = response.content;
    console.log('✅ Paginated response:', {
      content: conversations.length,
      totalElements: response.totalElements,
      totalPages: response.totalPages,
      currentPage: response.number
    });
  }
  // Cas 3: Réponse HAL (Spring Data REST)
  else if (response._embedded?.conversations) {
    conversations = response._embedded.conversations;
    console.log('✅ HAL response:', conversations.length);
  }
  // Cas 4: Réponse avec data wrapper
  else if (response.data && Array.isArray(response.data)) {
    conversations = response.data;
    console.log('✅ Data wrapper response:', conversations.length);
  }
  // Cas non géré
  else {
    console.warn('⚠️ Unknown response format:', response);
  }
  
  return conversations;
}

/**
 * Gère les erreurs de chargement des conversations
 */
private handleConversationLoadError(error: any): void {
  let errorMessage = 'Erreur lors du chargement des conversations';
  
  if (error.status === 401) {
    errorMessage = 'Session expirée. Veuillez vous reconnecter.';
    // Optionnel: déclencher une reconnexion
    // this.keycloakService.login();
  } else if (error.status === 403) {
    errorMessage = 'Accès refusé aux conversations.';
  } else if (error.status === 404) {
    errorMessage = 'Service de messagerie non disponible.';
  } else if (error.status === 500) {
    errorMessage = 'Erreur serveur. Veuillez réessayer plus tard.';
  } else if (error.status === 0) {
    errorMessage = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
  }
  
  console.error('❌ Conversation load error:', errorMessage);
  
  // Émettre un événement d'erreur si nécessaire
  // this.errorSubject.next(errorMessage);
}

/**
 * Méthode publique pour forcer le rechargement des conversations
 */
forceReloadConversations(): Observable<Conversation[]> {
  console.log('🔄 Force reloading conversations...');
  
  // Réinitialiser l'ID utilisateur pour forcer la resynchronisation
  this.currentUserId = undefined;
  
  // Vider le cache actuel
  this.conversationsSubject.next([]);
  
  // Recharger
  return this.getUserConversations();
}

/**
 * Méthode de diagnostic pour debug
 */
async diagnoseConnectionIssues(): Promise<void> {
  console.log('🔍 === DIAGNOSING CONNECTION ISSUES ===');
  
  const diagnosis = {
    currentUserId: this.currentUserId,
    apiUrl: this.apiUrl,
    connectionStatus: this.connectionStatusSubject.value,
    conversationsCount: this.conversationsSubject.value.length,
    hasToken: false,
    keycloakProfile: null as any,
    backendConnection: false
  };
  
  try {
    // Test 1: Token
    const token = await this.keycloakService.getToken();
    diagnosis.hasToken = !!token;
    
    // Test 2: Profil Keycloak
    diagnosis.keycloakProfile = await this.keycloakService.getUserProfile();
    
    // Test 3: Connexion backend
    if (token) {
      const testResponse = await fetch(`${this.apiUrl}/conversations?page=0&size=1`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      diagnosis.backendConnection = testResponse.ok;
    }
    
  } catch (error) {
    console.error('❌ Diagnosis error:', error);
  }
  
  console.table(diagnosis);
  console.log('🔍 === END DIAGNOSIS ===');
}

// ✅ AJOUT: Méthode pour tester la connexion au backend
testBackendConnection(): Observable<boolean> {
    return from(this.keycloakService.getToken()).pipe(
        switchMap(token => {
            if (!token) {
                return of(false);
            }
            
            const headers = new HttpHeaders({ 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            });
            
            // Test simple avec une requête de health check ou conversations vide
            return this.http.get(`${this.apiUrl}/conversations`, { 
                headers,
                params: { page: '0', size: '1' }
            }).pipe(
                map(() => true),
                catchError(error => {
                    console.error('❌ Backend connection test failed:', error);
                    return of(false);
                })
            );
        })
    );
}



  // Récupération d'une conversation
  getConversation(conversationId: number): Observable<Conversation> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<Conversation>(`${this.apiUrl}/conversations/${conversationId}`, { headers });
      }),
      tap(conversation => {
        this.currentConversationSubject.next(conversation);
      }),
      retry(2)
    );
  }

  // Récupération des messages
  getConversationMessages(conversationId: number, page = 0, size = 50): Observable<Message[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<any>(`${this.apiUrl}/conversation/${conversationId}`, {
          headers,
          params: { page: page.toString(), size: size.toString() }
        });
      }),
      map(response => {
        if (response.content) {
          return response.content;
        }
        return Array.isArray(response) ? response : [];
      }),
      tap(messages => {
        console.log(`✅ Messages loaded for conversation ${conversationId}:`, messages.length);
        this.messagesSubject.next(messages);
      }),
      retry(2)
    );
  }

  // Envoi de message
  sendMessage(request: MessageRequest): Observable<Message> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No token available');
        }
        
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        });
        
        if (!request.senderId && this.currentUserId) {
          request.senderId = this.currentUserId;
        }
        
        const payload = {
          conversationId: request.conversationId,
          content: request.content,
          type: request.type || 'TEXT',
          attachmentUrl: request.attachmentUrl,
          replyToMessageId: request.replyToMessageId
        };
        
        console.log('📤 Sending message:', payload);
        
        return this.http.post<Message>(`${this.apiUrl}/send`, payload, { headers });
      }),
      tap(message => {
        console.log('✅ Message sent:', message);
        
        const messages = this.messagesSubject.value;
        if (!messages.find(m => m.id === message.id)) {
          this.messagesSubject.next([...messages, message]);
        }
        
        this.updateConversationLastMessage(message.conversationId, message);
      }),
      catchError(error => {
        console.error('❌ Error sending message:', error);
        
        if (error.status === 403) {
          throw new Error('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation');
        } else if (error.status === 404) {
          throw new Error('Conversation non trouvée');
        }
        
        throw new Error('Erreur lors de l\'envoi du message');
      }),
      retry(1)
    );
  }

  // Marquer comme lu
  markAsRead(conversationId: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No token available');
        }
        
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.post<void>(
          `${this.apiUrl}/conversation/${conversationId}/read`,
          {},
          { headers }
        );
      }),
      tap(() => {
        console.log('✅ Messages marked as read for conversation:', conversationId);
        this.updateConversationUnreadCount(conversationId, 0);
      }),
      catchError(error => {
        console.warn('⚠️ Failed to mark as read:', error);
        return of(undefined);
      }),
      retry(1)
    );
  }

  // Upload de fichier
  uploadFile(file: File): Observable<string> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const formData = new FormData();
        formData.append('file', file);
        
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`
        });
        
        return this.http.post(`${this.apiUrl}/upload`, formData, { 
          headers,
          responseType: 'text'
        });
      }),
      retry(2)
    );
  }

  // Compteur de messages non lus
  getUnreadCount(): Observable<number> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<number>(`${this.apiUrl}/unread-count`, { headers });
      }),
      tap(count => {
        this.unreadCountSubject.next(count);
      }),
      catchError(error => {
        console.error('❌ Error fetching unread count:', error);
        return of(0);
      }),
      retry(2)
    );
  }

  // Créer conversation directe
  createDirectConversation(otherUserId: number): Observable<Conversation> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No token available');
        }
        
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        });
        
        if (!this.currentUserId) {
          throw new Error('Current user ID not available');
        }
        
        const request: CreateDirectConversationRequest = {
          currentUserId: this.currentUserId,
          otherUserId: otherUserId
        };
        
        console.log('📤 Creating direct conversation:', request);
        
        return this.http.post<Conversation>(`${this.apiUrl}/conversations/direct`, request, { headers });
      }),
      tap(conversation => {
        console.log('✅ Direct conversation created:', conversation);
        
        const conversations = this.conversationsSubject.value;
        const exists = conversations.find(c => c.id === conversation.id);
        if (!exists) {
          this.conversationsSubject.next([conversation, ...conversations]);
        }
      }),
      catchError(error => {
        console.error('❌ Error creating direct conversation:', error);
        
        if (error.status === 400) {
          if (error.error?.message?.includes('yourself')) {
            throw new Error('Vous ne pouvez pas créer une conversation avec vous-même');
          } else if (error.error?.message?.includes('already exists')) {
            throw new Error('Une conversation existe déjà avec cet utilisateur');
          }
          throw new Error('Données invalides');
        } else if (error.status === 403) {
          throw new Error('Non autorisé à créer cette conversation');
        } else if (error.status === 404) {
          throw new Error('Utilisateur non trouvé');
        }
        
        throw error;
      }),
      retry(1)
    );
  }

  // Créer conversation de compétence
  createSkillConversation(skillId: number): Observable<Conversation> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No token available');
        }
        
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        });
        
        const request: CreateSkillConversationRequest = {
          skillId: skillId
        };
        
        console.log('📤 Creating skill conversation:', request);
        
        return this.http.post<Conversation>(`${this.apiUrl}/conversations/skill`, request, { headers });
      }),
      tap(conversation => {
        console.log('✅ Skill conversation created:', conversation);
        
        const conversations = this.conversationsSubject.value;
        const exists = conversations.find(c => c.id === conversation.id);
        if (!exists) {
          this.conversationsSubject.next([conversation, ...conversations]);
        }
      }),
      catchError(error => {
        console.error('❌ Error creating skill conversation:', error);
        throw error;
      }),
      retry(1)
    );
  }

  // Créer conversation de groupe
  createGroupConversation(name: string, participantIds: number[], description?: string): Observable<Conversation> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        if (!token) {
          throw new Error('No token available');
        }
        
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        });
        
        const request: CreateGroupConversationRequest = {
          name: name,
          participantIds: participantIds,
          description: description
        };
        
        console.log('📤 Creating group conversation:', request);
        
        return this.http.post<Conversation>(`${this.apiUrl}/conversations/group`, request, { headers });
      }),
      tap(conversation => {
        console.log('✅ Group conversation created:', conversation);
        
        const conversations = this.conversationsSubject.value;
        const exists = conversations.find(c => c.id === conversation.id);
        if (!exists) {
          this.conversationsSubject.next([conversation, ...conversations]);
        }
      }),
      catchError(error => {
        console.error('❌ Error creating group conversation:', error);
        throw error;
      }),
      retry(1)
    );
  }

  // Rechercher conversations
  searchConversations(query: string): Observable<Conversation[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<Conversation[]>(`${this.apiUrl}/conversations/search`, {
          headers,
          params: { query: query }
        });
      }),
      retry(2)
    );
  }

  // Archiver conversation
  archiveConversation(conversationId: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.put<void>(`${this.apiUrl}/conversations/${conversationId}/archive`, {}, { headers });
      }),
      tap(() => {
        const conversations = this.conversationsSubject.value;
        this.conversationsSubject.next(conversations.filter(c => c.id !== conversationId));
      }),
      retry(2)
    );
  }

  // Obtenir compteurs non lus par conversation
  getUnreadCountPerConversation(): Observable<{[key: number]: number}> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<{[key: number]: number}>(`${this.apiUrl}/unread-per-conversation`, { headers });
      }),
      retry(2)
    );
  }

  // ===== WEBSOCKET METHODS =====

  // Envoyer indicateur de frappe
  sendTypingIndicator(conversationId: number, isTyping: boolean): void {
    this.sendStompMessage({
      destination: `/app/conversation/${conversationId}/typing`,
      body: { 
        isTyping, 
        conversationId,
        userId: this.currentUserId,
        userName: 'Current User',
        timestamp: new Date()
      }
    });
  }

  // Envoi de message STOMP
  private sendStompMessage(data: { destination: string, body: any }): void {
    if (this.stompClient && this.stompClient.connected) {
      try {
        this.stompClient.publish({
          destination: data.destination,
          body: JSON.stringify(data.body)
        });
        console.log(`📤 STOMP message sent to ${data.destination}`);
      } catch (error) {
        console.error('❌ Failed to send STOMP message:', error);
      }
    } else {
      console.warn('⚠️ STOMP client not connected, message not sent');
    }
  }

  // ===== QUICK CHAT METHODS =====
  
  toggleQuickChat(open?: boolean): void {
    const currentState = this.quickChatOpenSubject.value;
    this.quickChatOpenSubject.next(open !== undefined ? open : !currentState);
  }

  addToQuickChat(conversation: Conversation): void {
    const current = this.quickChatConversationsSubject.value;
    if (!current.find(c => c.id === conversation.id)) {
      this.quickChatConversationsSubject.next([...current, conversation]);
    }
  }

  removeFromQuickChat(conversationId: number): void {
    const current = this.quickChatConversationsSubject.value;
    this.quickChatConversationsSubject.next(
      current.filter(c => c.id !== conversationId)
    );
  }

  // ===== HELPER METHODS =====

  private updateConversationLastMessage(conversationId: number, message: Message): void {
    const conversations = this.conversationsSubject.value;
    const updated = conversations.map(c => {
      if (c.id === conversationId) {
        return {
          ...c,
          lastMessage: message.content,
          lastMessageTime: message.sentAt
        };
      }
      return c;
    });
    this.conversationsSubject.next(updated);
  }

  private updateConversationUnreadCount(conversationId: number, count: number): void {
    const conversations = this.conversationsSubject.value;
    const updated = conversations.map(c => {
      if (c.id === conversationId) {
        return { ...c, unreadCount: count };
      }
      return c;
    });
    this.conversationsSubject.next(updated);
  }

  private incrementUnreadCount(): void {
    const current = this.unreadCountSubject.value;
    this.unreadCountSubject.next(current + 1);
  }

  // ===== PUBLIC UTILITIES =====

  reconnect(): void {
    console.log('🔌 Manual reconnection triggered');
    this.reconnectAttempts = 0;
    
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }
    
    setTimeout(() => {
      this.initializeStompConnection();
    }, 500);
  }

  isConnected(): boolean {
    return this.stompClient?.connected || false;
  }

  getConnectionStatus(): 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR' {
    return this.connectionStatusSubject.value;
  }

  getCurrentUserId(): number | undefined {
    return this.currentUserId;
  }

  setCurrentConversation(conversation: Conversation | null): void {
    this.currentConversationSubject.next(conversation);
  }

  clearMessages(): void {
    this.messagesSubject.next([]);
  }

  // ===== POLLING =====
  private startPolling() {
    this.pollingInterval = interval(30000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.getUnreadCount()),
      catchError(error => {
        console.warn('⚠️ Polling error:', error);
        return of(0);
      })
    ).subscribe();
  }

  // ===== CLEANUP =====
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.stompClient) {
      this.stompClient.deactivate();
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.pollingInterval) {
      this.pollingInterval.unsubscribe();
    }
  }
}