// messaging.service.ts - VERSION COMPLÈTE ET CORRIGÉE
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, from, interval, Subject, timer, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap, takeUntil, retry, delay, filter } from 'rxjs/operators';
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
      await this.loadUserInfo();
      
      // Attendre que l'authentification soit prête
      this.keycloakService.authStatus$
        .pipe(
          filter(status => status === true),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          if (!this.isInitialized) {
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
        // Gérer l'ID utilisateur correctement
        if (!isNaN(Number(profile.id))) {
          this.currentUserId = parseInt(profile.id);
        } else {
          // Si c'est un UUID, utiliser le hash
          this.currentUserId = this.generateNumericIdFromUUID(profile.id);
        }
        console.log('✅ Current user ID loaded:', this.currentUserId);
      }
    } catch (error) {
      console.error('❌ Failed to load user info:', error);
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
getUserConversations(page = 0, size = 20): Observable<Conversation[]> {
    console.log('📡 MessagingService: getUserConversations called', { page, size });
    
    return from(this.keycloakService.getToken()).pipe(
        tap(token => {
            console.log('🔑 Token obtained:', token ? 'Present' : 'Missing');
        }),
        switchMap(token => {
            if (!token) {
                console.error('❌ No token available for fetching conversations');
                return of([]);
            }
            
            const headers = new HttpHeaders({ 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            });
            
            const url = `${this.apiUrl}/conversations`;
            console.log('📡 Making HTTP request to:', url);
            console.log('📡 Request headers:', headers);
            console.log('📡 Request params:', { page: page.toString(), size: size.toString() });
            
            return this.http.get<any>(url, {
                headers,
                params: { 
                    page: page.toString(), 
                    size: size.toString() 
                }
            }).pipe(
                tap(response => {
                    console.log('📡 Raw HTTP response:', response);
                    console.log('📡 Response type:', typeof response);
                    console.log('📡 Response keys:', Object.keys(response || {}));
                }),
                catchError(error => {
                    console.error('❌ HTTP Error in getUserConversations:', {
                        status: error.status,
                        statusText: error.statusText,
                        message: error.message,
                        error: error.error,
                        url: error.url
                    });
                    
                    // ✅ : Ne pas retourner un objet vide, mais propager l'erreur
                    throw error;
                })
            );
        }),
        map(response => {
            console.log('🔧 Processing response in map operator:', response);
            
            // ✅ : Gestion plus robuste des différents formats de réponse
            let conversations: Conversation[] = [];
            
            if (!response) {
                console.warn('⚠️ Empty response received');
                return [];
            }
            
            // Format 1: Array direct
            if (Array.isArray(response)) {
                console.log('📋 Response is direct array');
                conversations = response;
            }
            // Format 2: Page avec content
            else if (response.content && Array.isArray(response.content)) {
                console.log('📋 Response is paginated with content');
                conversations = response.content;
            }
            // Format 3: Spring HATEOAS avec _embedded
            else if (response._embedded && Array.isArray(response._embedded.conversations)) {
                console.log('📋 Response is HATEOAS format');
                conversations = response._embedded.conversations;
            }
            // Format 4: Objet avec propriété conversations
            else if (response.conversations && Array.isArray(response.conversations)) {
                console.log('📋 Response has conversations property');
                conversations = response.conversations;
            }
            else {
                console.warn('⚠️ Unexpected response format:', response);
                return [];
            }
            
            console.log('📋 Extracted conversations:', conversations);
            console.log('📋 Number of conversations:', conversations.length);
            
            // ✅ VALIDATION: Vérifier que chaque conversation a les propriétés requises
            const validConversations = conversations.filter(conv => {
                const isValid = conv && 
                    typeof conv.id !== 'undefined' && 
                    typeof conv.name !== 'undefined' &&
                    Array.isArray(conv.participants);
                
                if (!isValid) {
                    console.warn('⚠️ Invalid conversation found:', conv);
                }
                
                return isValid;
            });
            
            console.log('✅ Valid conversations:', validConversations.length);
            return validConversations;
        }),
        tap(conversations => {
            console.log('✅ Final conversations to emit:', conversations.length);
            conversations.forEach((conv, index) => {
                console.log(`📋 Conversation ${index + 1}:`, {
                    id: conv.id,
                    name: conv.name,
                    type: conv.type,
                    participantCount: conv.participants?.length || 0,
                    lastMessage: conv.lastMessage,
                    status: conv.status
                });
            });
            
            // ✅ : Mettre à jour le Subject des conversations
            this.conversationsSubject.next(conversations);
        }),
        catchError(error => {
            console.error('❌ Final error in getUserConversations:', error);
            
            // ✅ : En cas d'erreur, émettre un tableau vide et propager l'erreur
            this.conversationsSubject.next([]);
            
            // Retourner un Observable d'erreur pour que le composant puisse gérer l'erreur
            return throwError(() => error);
        }),
        retry(1) // ✅ : Retry une seule fois en cas d'erreur réseau
    );
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

// ✅ AJOUT: Méthode pour forcer le rechargement des conversations
forceReloadConversations(): Observable<Conversation[]> {
    console.log('🔄 Force reloading conversations...');
    
    // Réinitialiser l'état
    this.conversationsSubject.next([]);
    
    // Recharger
    return this.getUserConversations().pipe(
        tap(conversations => {
            console.log('🔄 Force reload completed:', conversations.length);
        })
    );
}

// ✅ AJOUT: Méthode de diagnostic
diagnoseConnectionIssues(): Observable<any> {
    console.log('🔍 Diagnosing connection issues...');
    
    return from(this.keycloakService.getToken()).pipe(
        switchMap(token => {
            const diagnosis = {
                hasToken: !!token,
                tokenLength: token?.length || 0,
                apiUrl: this.apiUrl,
                currentUserId: this.currentUserId,
                connectionStatus: this.connectionStatusSubject.value,
                isInitialized: this.isInitialized
            };
            
            console.log('🔍 Diagnosis:', diagnosis);
            return of(diagnosis);
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