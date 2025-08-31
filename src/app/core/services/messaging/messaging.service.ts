import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, from, interval, Subject, timer, of, throwError, forkJoin } from 'rxjs';
import { catchError, map, switchMap, tap, takeUntil, retry, delay, filter, retryWhen, take } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export interface SkillWithUsersResponse {
  skillId: number;
  skillName: string;
  skillDescription?: string;
  skillProducer: UserResponse;
  receivers: UserResponse[];
  stats: SkillUsersStats;
  userRole: 'PRODUCER' | 'RECEIVER';
}

export interface UserSkillsWithUsersResponse {
  currentUser: UserResponse;
  userPrimaryRole: 'PRODUCER' | 'RECEIVER';
  skills: SkillWithUsersResponse[];
  globalStats: UserSkillsStats;
}

export interface UserSkillsStats {
  totalSkills: number;
  totalUsers: number;
  totalProducers: number;
  totalReceivers: number;
  statusBreakdown: { [key: string]: number };
}

export interface SkillUsersStats {
  totalReceivers: number;
  totalUsers: number;
  statusBreakdown: { [key: string]: number };
}
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
  skillImageUrl?: string;
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

export interface UserResponse {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  skillImageUrl?: string;
}

export interface CommunityMemberResponse {
  userId: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  pictureUrl?: string;
  roles: string[];
  memberType: 'PRODUCER' | 'RECEIVER';
  commonSkillIds: number[];
}

export interface SkillResponse {
  id: number;
  name: string;
  description?: string;
  userId: number;
  categoryName?: string;
  skillImageUrl?: string; 
}

@Injectable({
  providedIn: 'root'
})
export class MessagingService {
  // ===== CONFIGURATION =====
  private readonly apiUrl = 'http://localhost:8822/api/v1/messages';
  private readonly exchangeApiUrl = 'http://localhost:8822/api/v1/exchanges';
  private readonly skillApiUrl = 'http://localhost:8822/api/v1/skills';
  private readonly wsUrl = 'http://localhost:8822/ws/messaging';
  

  //  Subjects pour gérer l'état de lecture
  private unreadCountsSubject = new BehaviorSubject<Map<number, number>>(new Map());
  private totalUnreadSubject = new BehaviorSubject<number>(0);
  private readReceiptsSubject = new BehaviorSubject<any[]>([]);



  // Observables publics
  unreadCounts$ = this.unreadCountsSubject.asObservable();
  totalUnread$ = this.totalUnreadSubject.asObservable();
  readReceipts$ = this.readReceiptsSubject.asObservable();

  // Cache pour éviter les appels répétés
  private readStatusCache = new Map<number, {
    lastRead: Date;
    unreadCount: number;
  }>();

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
  private currentUserRole?: string;
  private isInitialized = false;
  private pollingInterval?: any;

  private onlineUsersSubject = new BehaviorSubject<Set<number>>(new Set());
  onlineUsers$ = this.onlineUsersSubject.asObservable();
  private presenceCheckInterval?: any;


    private processingConversationIds = new Set<number>();
private recentlyProcessedMessages = new Set<string>();
 constructor(
  private http: HttpClient,
  private keycloakService: KeycloakService
) {
  this.initializeService();
  this.subscribeToWindowEvents(); 
}

  // ===== INITIALISATION =====
  private async initializeService() {
    try {
      await this.loadUserInfo();
      
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

  
 // REMPLACER loadUserInfo() et les méthodes associées par:
private async loadUserInfo() {
  try {
    const profile = await this.keycloakService.getUserProfile();
    if (profile?.id) {
      console.log('🔍 Keycloak profile loaded:', profile);
      
      // Toujours essayer de récupérer l'ID réel depuis le backend
      const token = await this.keycloakService.getToken();
      const realUserId = await this.fetchRealUserIdFromBackend(profile.id, token);
      
      if (realUserId) {
        this.currentUserId = realUserId;
        console.log('✅ Real user ID from backend:', this.currentUserId);
      } else {
        console.error('❌ Could not fetch real user ID, cannot continue');
        return; // Ne pas continuer sans ID valide
      }

      const roles = this.keycloakService.getRoles();
      this.currentUserRole = roles.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER';
      console.log('👤 User loaded:', { id: this.currentUserId, role: this.currentUserRole });
    }
  } catch (error) {
    console.error('❌ Failed to load user info:', error);
  }
}

// AJOUTER cette nouvelle méthode:
private async fetchRealUserIdFromBackend(keycloakId: string, token: string): Promise<number | null> {
  try {
    const token = await this.keycloakService.getToken();
    if (!token) return null;

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    // Essayer l'endpoint direct
    const response = await this.http.get<any>(
      `http://localhost:8822/api/v1/users/by-keycloak-id`,
      { 
        headers,
        params: { keycloakId }
      }
    ).toPromise();

    if (response?.id) {
      return response.id;
    }

    // Essayer endpoint /me comme fallback
    const meResponse = await this.http.get<any>(
      `http://localhost:8822/api/v1/users/me`,
      { headers }
    ).toPromise();

    return meResponse?.id || null;

  } catch (error) {
    console.error('❌ Backend fetch error:', error);
    return null;
  }
}

// SUPPRIMER generateNumericIdFromUUID() - ne plus l'utiliser

  private async getRealUserId(keycloakId: string): Promise<number | null> {
    try {
      const token = await this.keycloakService.getToken();
      if (!token) return null;

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

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

    if (!this.currentUserId) {
      await this.loadUserInfo();
      if (!this.currentUserId) {
        console.error('❌ Cannot connect WebSocket without user ID');
        this.scheduleReconnect();
        return;
      }
    }

    console.log('🔌 Initializing STOMP connection for user:', this.currentUserId);

    this.stompClient = new Client({
      brokerURL: this.wsUrl,
      connectHeaders: {
        Authorization: `Bearer ${token}`,
        'X-Authorization': `Bearer ${token}`,
        'X-User-Id': this.currentUserId.toString()
      },
      debug: (str) => {
        if (!str.includes('PING') && !str.includes('PONG')) {
          console.log('🐞 STOMP:', str);
        }
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 25000,
      heartbeatOutgoing: 25000,
      
      onConnect: (frame) => {
        console.log('✅ STOMP Connected:', frame);
        this.connectionStatusSubject.next('CONNECTED');
        this.reconnectAttempts = 0;

        // S'abonner aux topics
        this.subscribeToTopics();
        
        // Charger les conversations après connexion
        this.getUserConversations().subscribe();
        
        // IMPORTANT: Demander explicitement la liste des utilisateurs en ligne après connexion
        setTimeout(() => {
          this.requestOnlineUsersList();
          this.debugOnlineStatus();
        }, 1000);
      },
      
      onStompError: (frame) => {
        console.error('❌ STOMP Error:', frame);
        this.connectionStatusSubject.next('ERROR');
        this.scheduleReconnect();
      },
      
      onWebSocketError: (event) => {
        console.error('❌ WebSocket Error:', event);
        this.connectionStatusSubject.next('ERROR');
      },
      
      onWebSocketClose: (event) => {
        console.warn('⚠️ WebSocket Closed');
        this.connectionStatusSubject.next('DISCONNECTED');
        this.scheduleReconnect();
      }
    });

    this.connectionStatusSubject.next('CONNECTING');
    this.stompClient.activate();
    
  } catch (error) {
    console.error('❌ Failed to initialize STOMP:', error);
    this.connectionStatusSubject.next('ERROR');
    this.scheduleReconnect();
  }
}
private handleIncomingMessage(message: Message): void {
  console.log('📬 Traitement message entrant:', message);
  
  const currentMessages = this.messagesSubject.value;
  const messageKey = `${message.conversationId}_${message.senderId}_${message.content}_${Math.floor(new Date(message.sentAt).getTime() / 1000)}`;
  
  if (this.recentlyProcessedMessages.has(messageKey)) {
    return;
  }
  
  const isDuplicate = currentMessages.some(m => {
    if (m.id && message.id && m.id === message.id) return true;
    
    if (m.conversationId === message.conversationId && 
        m.senderId === message.senderId &&
        m.content.trim() === message.content.trim()) {
      const timeDiff = Math.abs(new Date(m.sentAt).getTime() - new Date(message.sentAt).getTime());
      return timeDiff < 5000;
    }
    return false;
  });
  
  if (!isDuplicate) {
    this.recentlyProcessedMessages.add(messageKey);
    setTimeout(() => this.recentlyProcessedMessages.delete(messageKey), 10000);
    
    // Ajouter le message
    this.messagesSubject.next([...currentMessages, message]);
    
    // IMPORTANT: Mettre à jour l'ordre de la liste des conversations
    this.updateConversationListOrder(message.conversationId, message);
    
    // Incrémenter compteur non lus si pas conversation active
    const currentConv = this.currentConversationSubject.value;
    if (!currentConv || currentConv.id !== message.conversationId) {
      this.incrementUnreadCount();
    }
  }
}


private handleNewConversation(conversation: Conversation) {
  console.log('📬 Handling new conversation:', conversation);
  
  // Ajouter la conversation à la liste si elle n'existe pas
  const currentConversations = this.conversationsSubject.value;
  const exists = currentConversations.find(c => c.id === conversation.id);
  
  if (!exists) {
    // Ajouter en début de liste
    this.conversationsSubject.next([conversation, ...currentConversations]);
    
    // Si c'est une conversation de compétence, s'abonner au topic
    if (conversation.type === 'SKILL_GROUP' && conversation.skillId && this.stompClient) {
      this.stompClient.subscribe(`/topic/skill/${conversation.skillId}`, (message: any) => {
        console.log('📬 Skill message received from new conversation:', message.body);
        this.handleIncomingMessage(JSON.parse(message.body));
      });
    }
  }
}
private subscribeToWebSocket(): void {
  if (!this.stompClient || !this.currentUserId) return;

  // Messages entrants - mettre à jour lastMessage et tri
  this.stompClient.subscribe(`/user/${this.currentUserId}/queue/conversation`, (message) => {
    try {
      const data = JSON.parse(message.body);
      console.log('📬 Message reçu:', data);
      
      if (data.senderId === this.currentUserId) return; // Ignorer nos propres messages
      
      this.handleIncomingMessage(data);
      this.updateConversationListOrder(data.conversationId, data); // NOUVEAU
    } catch (error) {
      console.error('❌ Erreur parsing message:', error);
    }
  });

  // Nouvelles conversations
  this.stompClient.subscribe(`/user/${this.currentUserId}/queue/new-conversation`, (message) => {
    try {
      const newConversation = JSON.parse(message.body) as Conversation;
      console.log('🆕 Nouvelle conversation reçue:', newConversation);
      
      this.addNewConversationToList(newConversation); // NOUVEAU
    } catch (error) {
      console.error('❌ Erreur parsing nouvelle conversation:', error);
    }
  });

  // Abonnement skill conversations
  this.getUserSkillsWithUsers().subscribe(response => {
    response.skills.forEach(skill => {
      // Messages de compétence
      this.stompClient!.subscribe(`/topic/skill/${skill.skillId}/messages`, (message) => {
        try {
          const data = JSON.parse(message.body);
          if (data.senderId === this.currentUserId) return;
          
          this.handleIncomingMessage(data);
          this.updateConversationListOrder(data.conversationId, data);
        } catch (error) {
          console.error('❌ Erreur skill message:', error);
        }
      });

      // Nouvelles conversations skill
      this.stompClient!.subscribe(`/topic/skill/${skill.skillId}/new-conversation`, (message) => {
        try {
          const newConversation = JSON.parse(message.body) as Conversation;
          this.addNewConversationToList(newConversation);
        } catch (error) {
          console.error('❌ Erreur skill conversation:', error);
        }
      });
    });
  });
}

private addNewConversationToList(conversation: Conversation): void {
  const currentConversations = this.conversationsSubject.value;
  
  // Vérifier si elle existe déjà
  const exists = currentConversations.find(c => c.id === conversation.id);
  if (exists) {
    console.log('Conversation déjà existante:', conversation.id);
    return;
  }

  // Ajouter en tête de liste (plus récente)
  const updatedList = [conversation, ...currentConversations];
  
  // Émettre la nouvelle liste
  this.conversationsSubject.next(updatedList);
  
  console.log('✅ Nouvelle conversation ajoutée en tête de liste:', conversation.name);
}

// 3. NOUVELLE MÉTHODE - Réorganiser la liste selon le dernier message
private updateConversationListOrder(conversationId: number, latestMessage: any): void {
  const conversations = this.conversationsSubject.value;
  const conversationIndex = conversations.findIndex(c => c.id === conversationId);
  
  if (conversationIndex === -1) return;
  
  // Mettre à jour les détails de la conversation
  const updatedConversation = {
    ...conversations[conversationIndex],
    lastMessage: latestMessage.content,
    lastMessageTime: new Date(latestMessage.sentAt),
    // Seulement incrémenter unreadCount si ce N'EST PAS notre propre message
    unreadCount: latestMessage.senderId === this.currentUserId 
      ? conversations[conversationIndex].unreadCount 
      : conversations[conversationIndex].unreadCount + 1
  };
  
  // Si la conversation est déjà en première position, pas besoin de réorganiser
  if (conversationIndex === 0) {
    const newConversations = [...conversations];
    newConversations[0] = updatedConversation;
    this.conversationsSubject.next(newConversations);
    console.log('📋 Conversation mise à jour (déjà en tête):', conversationId);
    return;
  }
  
  // Retirer la conversation de sa position actuelle
  const newConversations = [...conversations];
  newConversations.splice(conversationIndex, 1);
  
  // Ajouter en tête de liste (plus récente)
  newConversations.unshift(updatedConversation);
  
  // Émettre la liste réorganisée
  this.conversationsSubject.next(newConversations);
  
  const messageType = latestMessage.senderId === this.currentUserId ? 'envoyé' : 'reçu';
  console.log(`📋 Liste réorganisée - conversation ${conversationId} remontée en tête (message ${messageType})`);
}


// ✅ AMÉLIORER la méthode de gestion des nouvelles conversations
private handleNewConversationReceived(conversation: Conversation) {
  console.log('🆕 Handling new conversation:', conversation);
  
  const currentConversations = this.conversationsSubject.value;
  const exists = currentConversations.find(c => c.id === conversation.id);
  
  if (!exists) {
    // Ajouter en début de liste
    const updated = [conversation, ...currentConversations];
    this.conversationsSubject.next(updated);
    
    console.log('✅ New conversation added to list:', conversation.id);
    
    // Émettre un événement global
    window.dispatchEvent(new CustomEvent('newConversationAdded', {
      detail: conversation
    }));
    
    // Notification toast
    this.showNotification(`Nouvelle conversation: ${conversation.name}`);
  } else {
    // Mettre à jour si elle existe déjà
    const updatedList = currentConversations.map(c => 
      c.id === conversation.id ? conversation : c
    );
    this.conversationsSubject.next(updatedList);
    console.log('✅ Conversation updated:', conversation.id);
  }
}

private showNotification(message: string) {
  // Créer une notification visuelle
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

refreshConversations(): void {
  console.log('🔄 Refreshing conversations list...');
  
  // Forcer le rechargement des conversations
  this.getUserConversations(0, 50).subscribe({
    next: (conversations) => {
      this.conversationsSubject.next(conversations);
      console.log('✅ Conversations refreshed:', conversations.length);
    },
    error: (error) => {
      console.error('❌ Error refreshing conversations:', error);
    }
  });
}

// Ajouter aussi une méthode pour écouter les nouvelles conversations via WebSocket
private subscribeToNewConversations(): void {
  if (!this.stompClient) return;
  
  // S'abonner aux nouvelles conversations
  this.stompClient.subscribe('/user/queue/new-conversation', (message: any) => {
    const newConversation = JSON.parse(message.body) as Conversation;
    console.log('📬 New conversation received:', newConversation);
    
    // Ajouter la nouvelle conversation à la liste
    const currentConversations = this.conversationsSubject.value;
    const exists = currentConversations.find(c => c.id === newConversation.id);
    
    if (!exists) {
      this.conversationsSubject.next([newConversation, ...currentConversations]);
    }
  });
}


private subscribeToTopics() {
  if (!this.stompClient || !this.stompClient.connected) {
    console.warn('STOMP client not connected for subscriptions');
    return;
  }

  if (!this.currentUserId) {
    console.error('No user ID available for subscriptions');
    return;
  }

  try {
    // 1. Subscription aux messages personnels
    this.stompClient.subscribe(`/user/${this.currentUserId}/queue/conversation`, (message) => {
      try {
        const data = JSON.parse(message.body);
        console.log('Received user message via WebSocket:', data);
        
        if (data.senderId === this.currentUserId) {
          console.log('Skipping own message from WebSocket queue');
          return;
        }
        
        this.handleIncomingMessage(data);
      } catch (error) {
        console.error('Error parsing user message:', error);
      }
    });

    // 2. FIXED: Better presence topic handling
    this.stompClient.subscribe('/topic/presence', (message) => {
      try {
        const presence = JSON.parse(message.body);
        console.log('PRESENCE UPDATE RECEIVED:', presence);
        
        // FIXED: Process ALL presence updates, not just others
        if (presence.userId) {
          this.handlePresenceUpdate(presence);
        }
      } catch (error) {
        console.error('Error parsing presence update:', error);
      }
    });

    // 3. FIXED: Better online users list handling
    this.stompClient.subscribe('/topic/online-users', (message) => {
      try {
        const onlineUsersList = JSON.parse(message.body);
        console.log('ONLINE USERS LIST RECEIVED:', onlineUsersList);
        
        if (Array.isArray(onlineUsersList)) {
          // FIXED: Validate and filter user IDs
          const validUserIds = onlineUsersList.filter(id => 
            typeof id === 'number' && id > 0
          );
          
          const onlineSet = new Set<number>(validUserIds);
          this.onlineUsersSubject.next(onlineSet);
          
          // FIXED: Update conversation participants immediately
          this.updateConversationParticipantsFromOnlineList(onlineSet);
          
          console.log('Online users set updated:', Array.from(onlineSet));
        }
      } catch (error) {
        console.error('Error parsing online users list:', error);
      }
    });

    // 4. Personal presence updates
    this.stompClient.subscribe(`/user/${this.currentUserId}/queue/presence-update`, (message) => {
      try {
        const presenceData = JSON.parse(message.body);
        console.log('Personal presence update:', presenceData);
        
        if (presenceData.onlineUsers && Array.isArray(presenceData.onlineUsers)) {
          const onlineSet = new Set<number>(presenceData.onlineUsers);
          this.onlineUsersSubject.next(onlineSet);
          this.updateConversationParticipantsFromOnlineList(onlineSet);
        }
      } catch (error) {
        console.error('Error parsing personal presence update:', error);
      }
    });

    // 5. New conversation subscriptions
    this.stompClient.subscribe(`/user/${this.currentUserId}/queue/new-conversation`, (message) => {
      try {
        const newConversation = JSON.parse(message.body) as Conversation;
        console.log('New conversation notification received:', newConversation);
        this.handleNewConversation(newConversation);
      } catch (error) {
        console.error('Error parsing new conversation:', error);
      }
    });

    // 6. FIXED: Subscribe to read state management
    this.initializeReadStateSync();

    // 7. FIXED: Request initial online users list
    this.requestOnlineUsersListInternal();

    // 8. Send initial presence and start heartbeat
    this.sendPresenceUpdate(true);
    this.startPresenceHeartbeat();
    
    console.log('Successfully subscribed to all STOMP topics');
    
  } catch (error) {
    console.error('Failed to subscribe to topics:', error);
    this.scheduleReconnect();
  }
}


public requestOnlineUsersList(): void {
  this.requestOnlineUsersListInternal();
}

// FIXED: Private implementation
private requestOnlineUsersListInternal(): void {
  if (!this.stompClient || !this.stompClient.connected) {
    console.warn('Cannot request online users - not connected');
    return;
  }

  try {
    this.stompClient.publish({
      destination: '/app/presence/request-online-users',
      body: JSON.stringify({
        userId: this.currentUserId,
        timestamp: new Date().toISOString()
      })
    });

    console.log('Requested current online users list');
  } catch (error) {
    console.error('Error requesting online users:', error);
  }
}

// FIXED: New method to update conversation participants from online list
private updateConversationParticipantsFromOnlineList(onlineUsers: Set<number>): void {
  const conversations = this.conversationsSubject.value;
  let hasChanges = false;
  
  const updatedConversations = conversations.map(conv => {
    const updatedParticipants = conv.participants.map(participant => {
      const wasOnline = participant.isOnline;
      const isNowOnline = onlineUsers.has(participant.userId);
      
      if (wasOnline !== isNowOnline) {
        hasChanges = true;
        console.log(`Status change for user ${participant.userId}: ${wasOnline} -> ${isNowOnline}`);
        return {
          ...participant,
          isOnline: isNowOnline,
          lastSeen: isNowOnline ? undefined : new Date()
        };
      }
      return participant;
    });
    
    return { ...conv, participants: updatedParticipants };
  });
  
  if (hasChanges) {
    this.conversationsSubject.next(updatedConversations);
    console.log('Updated conversation participants online status');
  }
}



sendPresenceUpdate(isOnline: boolean): void {
  if (!this.stompClient || !this.stompClient.connected || !this.currentUserId) {
    console.warn('Cannot send presence update - not connected');
    return;
  }

  try {
    const payload = {
      userId: this.currentUserId,
      isOnline: isOnline,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      timestamp: new Date().toISOString()
    };

    // FIXED: Send to both endpoints for reliability
    this.stompClient.publish({
      destination: '/app/presence/update',
      body: JSON.stringify(payload)
    });

    this.stompClient.publish({
      destination: '/app/user/presence',
      body: JSON.stringify(payload)
    });

    console.log(`Sent presence update: user ${this.currentUserId} is ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error('Error sending presence update:', error);
  }
}

// FIXED: Make debugOnlineStatus public
public debugOnlineStatus(): void {
  console.log('DEBUG ONLINE STATUS:');
  console.log('- Current user ID:', this.currentUserId);
  console.log('- WebSocket connected:', this.stompClient?.connected);
  console.log('- Online users:', Array.from(this.onlineUsersSubject.value));
  console.log('- Connection status:', this.connectionStatusSubject.value);
  
  // Force refresh
  this.requestOnlineUsersListInternal();
  this.sendPresenceUpdate(true);
  
  // FIXED: Send debug request to backend
  if (this.stompClient?.connected) {
    this.stompClient.publish({
      destination: '/app/presence/debug',
      body: JSON.stringify({
        userId: this.currentUserId,
        timestamp: new Date().toISOString()
      })
    });
  }
}


private startPresenceHeartbeat(): void {
  if (this.presenceCheckInterval) {
    clearInterval(this.presenceCheckInterval);
  }

  this.presenceCheckInterval = setInterval(() => {
    if (this.stompClient?.connected && this.currentUserId) {
      this.sendPresenceUpdate(true);
      
      // FIXED: Also ping to validate connection
      this.stompClient.publish({
        destination: '/app/presence/ping',
        body: JSON.stringify({
          userId: this.currentUserId,
          timestamp: new Date().toISOString()
        })
      });
    } else {
      console.warn('Cannot send presence heartbeat - not connected');
      if (!this.stompClient?.connected) {
        this.scheduleReconnect();
      }
    }
  }, 30000);

  console.log('Presence heartbeat started (30s interval)');
}

isUserOnline(userId: number): boolean {
  if (userId === this.currentUserId) {
    return true; // Current user is always online to themselves
  }
  return this.onlineUsersSubject.value.has(userId);
}

public refreshPresenceStatus(): void {
  console.log('Force refreshing presence status');
  
  if (this.stompClient?.connected) {
    this.sendPresenceUpdate(true);
    this.requestOnlineUsersListInternal();
  } else {
    console.warn('Cannot refresh presence - not connected');
    this.reconnect();
  }
}

private subscribeToWindowEvents(): void {
  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('Page hidden, maintaining connection');
      // Don't disconnect, just reduce heartbeat frequency
    } else {
      console.log('Page visible, refreshing presence');
      this.refreshPresenceStatus();
    }
  });

  // Handle before page unload
  window.addEventListener('beforeunload', () => {
    console.log('Page unloading, sending offline status');
    if (this.currentUserId && this.stompClient?.connected) {
      // Send offline status synchronously
      this.sendPresenceUpdate(false);
    }
  });

  // Handle focus/blur events
  window.addEventListener('focus', () => {
    console.log('Window focused, refreshing presence');
    this.refreshPresenceStatus();
  });

  window.addEventListener('blur', () => {
    console.log('Window blurred, but keeping connection alive');
    // Keep connection but don't send offline immediately
  });
}

getOnlineUsers(): Set<number> {
  return new Set(this.onlineUsersSubject.value);
}
private updateConversation(updatedConversation: Conversation): void {
  const conversations = this.conversationsSubject.value;
  const index = conversations.findIndex(c => c.id === updatedConversation.id);
  
  if (index !== -1) {
    conversations[index] = updatedConversation;
    this.conversationsSubject.next([...conversations]);
    
    // Si c'est la conversation courante, mettre à jour aussi
    const currentConv = this.currentConversationSubject.value;
    if (currentConv?.id === updatedConversation.id) {
      this.currentConversationSubject.next(updatedConversation);
    }
  }
}

private handleReadReceipt(receipt: any): void {
  const messages = this.messagesSubject.value;
  const updatedMessages = messages.map(msg => {
    if (msg.conversationId === receipt.conversationId && 
        msg.senderId === this.currentUserId &&
        new Date(msg.sentAt) <= new Date(receipt.readAt)) {
      return { ...msg, status: 'READ' as const, readAt: receipt.readAt };
    }
    return msg;
  });
  
  this.messagesSubject.next(updatedMessages);
}

private handleSystemError(error: any): void {
  console.error('System error:', error);
  
  // Afficher une notification à l'utilisateur
  if (error.message) {
    this.showErrorNotification(error.message);
  }
  
  // Si c'est une erreur de connexion, tenter de se reconnecter
  if (error.type === 'CONNECTION_ERROR') {
    this.scheduleReconnect();
  }
}

private handlePresenceUpdate(presence: any): void {
  console.log('Processing presence update:', presence);
  
  if (!presence || !presence.userId) {
    console.log('Ignoring invalid presence update');
    return;
  }

  const onlineUsers = new Set(this.onlineUsersSubject.value);
  
  // FIXED: Handle all presence updates properly
  if (presence.isOnline === true || presence.status === 'ONLINE') {
    onlineUsers.add(presence.userId);
    console.log(`User ${presence.userId} is now ONLINE`);
  } else if (presence.isOnline === false || presence.status === 'OFFLINE') {
    onlineUsers.delete(presence.userId);
    console.log(`User ${presence.userId} is now OFFLINE`);
  }
  
  this.onlineUsersSubject.next(onlineUsers);
  
  // FIXED: Update conversation participants for the specific user
  this.updateSpecificUserPresenceInConversations(presence.userId, presence.isOnline === true || presence.status === 'ONLINE');
}

// FIXED: New method to update specific user presence
private updateSpecificUserPresenceInConversations(userId: number, isOnline: boolean): void {
  const conversations = this.conversationsSubject.value;
  let hasChanges = false;
  
  const updatedConversations = conversations.map(conv => {
    const updatedParticipants = conv.participants.map(participant => {
      if (participant.userId === userId) {
        hasChanges = true;
        return {
          ...participant,
          isOnline: isOnline,
          lastSeen: isOnline ? undefined : new Date()
        };
      }
      return participant;
    });
    
    return { ...conv, participants: updatedParticipants };
  });
  
  if (hasChanges) {
    this.conversationsSubject.next(updatedConversations);
    console.log(`Updated presence for user ${userId} to ${isOnline ? 'online' : 'offline'} in conversations`);
  }
}

private showErrorNotification(message: string): void {
  // Créer une notification visuelle pour l'utilisateur
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #dc3545;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideInUp 0.3s ease;
    max-width: 350px;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutDown 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
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

  // ===== NOUVELLES MÉTHODES POUR RÉCUPÉRER LES UTILISATEURS ===

  /**
   * ✅ NOUVEAU: Récupère les utilisateurs disponibles selon le rôle et type de conversation
   */
  getAvailableUsersForConversation(conversationType: string, skillId?: number): Observable<UserResponse[]> {
  console.log('🔍 Getting available users for conversation type:', conversationType, 'skillId:', skillId);
  
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }

      switch (conversationType.toUpperCase()) {
        case 'DIRECT':
        case 'GROUP':
          return this.getAvailableUsersForDirectOrGroup();

        case 'SKILL':
        case 'SKILL_GROUP':
          if (skillId) {
            return this.getAvailableUsersForSpecificSkill(skillId);
          } else {
            return this.getAllSkillUsers();
          }

        default:
          return throwError(() => new Error('Unknown conversation type'));
      }
    }),
    catchError(error => {
      console.error('❌ Error getting available users:', error);
      return of([]);
    })
  );
}

/**
 * ✅ NOUVEAU: Récupère tous les utilisateurs de toutes les compétences de l'utilisateur
 */
private getAllSkillUsers(): Observable<UserResponse[]> {
  console.log('🎯 Fetching all skill users via /my-skills/users');
  
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      const allUsers = new Set<UserResponse>();
      
      // Ajouter tous les utilisateurs de toutes les compétences
      response.skills.forEach(skill => {
        // Ajouter le producteur si l'utilisateur actuel est un receiver
        if (response.userPrimaryRole === 'RECEIVER') {
          allUsers.add(skill.skillProducer);
        }
        
        // Ajouter tous les receivers
        skill.receivers.forEach(receiver => {
          allUsers.add(receiver);
        });
      });
      
      // Filtrer l'utilisateur actuel
      const result = Array.from(allUsers).filter(user => 
        user.id !== this.currentUserId
      );
      
      console.log('✅ All skill users found:', result.length);
      return result;
    })
  );
}

/**
 * ✅ NOUVEAU: Récupère les utilisateurs pour une compétence spécifique
 */
private getAvailableUsersForSpecificSkill(skillId: number): Observable<UserResponse[]> {
  console.log('🎯 Fetching users for specific skill:', skillId);
  
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      // Trouver la compétence spécifique
      const skill = response.skills.find(s => s.skillId === skillId);
      
      if (!skill) {
        console.warn('⚠️ Skill not found in user skills:', skillId);
        return [];
      }
      
      const users: UserResponse[] = [];
      
      // Ajouter le producteur si l'utilisateur actuel est un receiver
      if (response.userPrimaryRole === 'RECEIVER') {
        users.push(skill.skillProducer);
      }
      
      // Ajouter tous les receivers
      users.push(...skill.receivers);
      
      // Filtrer l'utilisateur actuel
      const result = users.filter(user => user.id !== this.currentUserId);
      
      console.log('✅ Users found for skill', skillId, ':', result.length);
      return result;
    }),
    catchError(error => {
      console.error('❌ Error getting users for specific skill, falling back:', error);
      return this.getAvailableUsersForSkillFallback(skillId);
    })
  );
}

/**
 * ✅ NOUVEAU: Méthode de fallback pour les utilisateurs d'une compétence
 */
private getAvailableUsersForSkillFallback(skillId: number): Observable<UserResponse[]> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });
      
      return this.http.get<UserResponse[]>(`${this.exchangeApiUrl}/skill/${skillId}/users/simple`, { headers });
    }),
    map(users => users.filter(user => user.id !== this.currentUserId)),
    catchError(error => {
      console.error('❌ Fallback method also failed for skill', skillId, ':', error);
      return of([]);
    })
  );
}

  /**
   * ✅ NOUVEAU: Récupère les utilisateurs pour conversations directes/groupe selon le rôle
   */
private getAvailableUsersForDirectOrGroup(): Observable<UserResponse[]> {
  console.log('🎯 Loading users via optimized /my-skills/users API...');
  
  return this.getUserSkillsWithUsersFromCache().pipe(
    map(response => {
      const uniqueUsers = new Map<number, UserResponse>();
      
      response.skills.forEach(skill => {
        // Ajouter le producteur
        if (!uniqueUsers.has(skill.skillProducer.id)) {
          uniqueUsers.set(skill.skillProducer.id, {
            ...skill.skillProducer,
            profileImageUrl: skill.skillProducer.profileImageUrl || 
                           `https://ui-avatars.com/api/?name=${skill.skillProducer.firstName}+${skill.skillProducer.lastName}&background=random`
          });
        }
        
        // Ajouter les receivers avec déduplication
        skill.receivers.forEach(receiver => {
          if (!uniqueUsers.has(receiver.id) && receiver.id !== this.currentUserId) {
            uniqueUsers.set(receiver.id, {
              ...receiver,
              profileImageUrl: receiver.profileImageUrl || 
                             `https://ui-avatars.com/api/?name=${receiver.firstName}+${receiver.lastName}&background=random`
            });
          }
        });
      });
      
      const result = Array.from(uniqueUsers.values());
      console.log('✅ Unique users loaded:', result.length);
      return result;
    }),
    catchError(error => {
      console.error('❌ Error loading users, trying fallback:', error);
      return this.getUsersWithPhotosFallback();
    })
  );
}

// ✅ NOUVEAU: Méthode de fallback avec photos
private getUsersWithPhotosFallback(): Observable<UserResponse[]> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });
      
      const apiCalls = [];
      
      if (this.currentUserRole === 'PRODUCER') {
        apiCalls.push(
          this.http.get<UserResponse[]>(`${this.exchangeApiUrl}/producer/subscribers/detailed`, { headers })
        );
      } else if (this.currentUserRole === 'RECEIVER') {
        apiCalls.push(
          this.http.get<CommunityMemberResponse[]>(`${this.exchangeApiUrl}/receiver/community/members`, { headers })
        );
      }
      
      return apiCalls.length > 0 ? forkJoin(apiCalls) : of([]);
    }),
    map(results => {
      let users: UserResponse[] = [];
      
      if (this.currentUserRole === 'PRODUCER') {
        users = results[0] as UserResponse[];
      } else {
        const members = results[0] as CommunityMemberResponse[];
        users = members.map(member => ({
          id: member.userId,
          username: member.username,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          profileImageUrl: member.pictureUrl || 
                         `https://ui-avatars.com/api/?name=${member.firstName}+${member.lastName}&background=random`
        } as UserResponse));
      }
      
      // Filtrer l'utilisateur actuel et dédupliquer
      const uniqueUsers = new Map<number, UserResponse>();
      users.forEach(user => {
        if (user.id !== this.currentUserId && !uniqueUsers.has(user.id)) {
          uniqueUsers.set(user.id, user);
        }
      });
      
      return Array.from(uniqueUsers.values());
    })
  );
}
private getAvailableUsersForDirectOrGroupFallback(): Observable<UserResponse[]> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      if (this.currentUserRole === 'PRODUCER') {
        return this.http.get<UserResponse[]>(`${this.exchangeApiUrl}/producer/subscribers`, { headers });
      } else if (this.currentUserRole === 'RECEIVER') {
        return this.http.get<CommunityMemberResponse[]>(`${this.exchangeApiUrl}/receiver/community/members`, { headers })
          .pipe(
            map(communityMembers => 
              communityMembers
                .filter(member => member.userId !== this.currentUserId)
                .map(member => ({
                  id: member.userId,
                  username: member.username,
                  firstName: member.firstName,
                  lastName: member.lastName,
                  email: member.email,
                  profileImageUrl: member.pictureUrl
                } as UserResponse))
            )
          );
      } else {
        return of([]);
      }
    }),
    catchError(error => {
      console.error('❌ Fallback method also failed:', error);
      return of([]);
    })
  );
}
  /**
   * ✅ NOUVEAU: Récupère les utilisateurs pour une compétence spécifique
   */
  private getAvailableUsersForSkill(skillId: number, headers: HttpHeaders): Observable<UserResponse[]> {
    console.log('🎯 Fetching users for skill:', skillId);
    return this.http.get<UserResponse[]>(`${this.exchangeApiUrl}/skill/${skillId}/users/simple`, { headers })
      .pipe(
        map(users => users.filter(user => user.id !== this.currentUserId))
      );
  }



  // ===== MÉTHODES DE CRÉATION DE CONVERSATION MISES À JOUR =====

  /**
   * ✅ MISE À JOUR: Crée ou récupère une conversation directe avec validation des utilisateurs connectés
   */
// REMPLACER createDirectConversation():
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
      
      const request: CreateDirectConversationRequest = {
        otherUserId: otherUserId
      };
      
      console.log('📤 Creating direct conversation:', request);
      
      return this.http.post<Conversation>(`${this.apiUrl}/conversations/direct`, request, { headers });
    }),
    tap(conversation => {
      console.log('✅ Direct conversation created:', conversation);
      
      // ✅ IMPORTANT: Mettre à jour immédiatement le BehaviorSubject
      const current = this.conversationsSubject.value;
      const exists = current.find(c => c.id === conversation.id);
      
      if (!exists) {
        // Ajouter en début de liste et émettre la nouvelle liste
        const updated = [conversation, ...current];
        this.conversationsSubject.next(updated);
        console.log('📋 Conversations list updated with new conversation');
      }
    }),
    catchError(error => {
      console.error('❌ Error creating direct conversation:', error);
      throw this.handleConversationError(error);
    })
  );
}

// REMPLACER createSkillConversation():
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
      
      return this.http.post<Conversation>(`${this.apiUrl}/conversations/skill`, request, { headers });
    }),
    tap(conversation => {
      console.log('✅ Skill conversation created:', conversation);
      
      // ✅ IMPORTANT: Mettre à jour immédiatement le BehaviorSubject
      const current = this.conversationsSubject.value;
      const exists = current.find(c => c.id === conversation.id);
      
      if (!exists) {
        const updated = [conversation, ...current];
        this.conversationsSubject.next(updated);
        console.log('📋 Conversations list updated with new skill conversation');
      }
    }),
    catchError(error => {
      console.error('❌ Error creating skill conversation:', error);
      throw this.handleConversationError(error);
    })
  );
}

// REMPLACER createGroupConversation():
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
      
      return this.http.post<Conversation>(`${this.apiUrl}/conversations/group`, request, { headers });
    }),
    tap(conversation => {
      console.log('✅ Group conversation created:', conversation);
      
      // ✅ IMPORTANT: Mettre à jour immédiatement le BehaviorSubject
      const current = this.conversationsSubject.value;
      const exists = current.find(c => c.id === conversation.id);
      
      if (!exists) {
        const updated = [conversation, ...current];
        this.conversationsSubject.next(updated);
        console.log('📋 Conversations list updated with new group');
      }
    }),
    catchError(error => {
      console.error('❌ Error creating group conversation:', error);
      throw this.handleConversationError(error);
    })
  );
}

  /**
   * ✅ NOUVEAU: Gestionnaire d'erreur unifié pour les conversations
   */
  private handleConversationError(error: any): Error {
    if (error.status === 400) {
      if (error.error?.message?.includes('yourself')) {
        return new Error('Vous ne pouvez pas créer une conversation avec vous-même');
      } else if (error.error?.message?.includes('not connected')) {
        return new Error('Vous n\'êtes pas connecté avec cet utilisateur');
      } else if (error.error?.message?.includes('not authorized')) {
        return new Error('Vous n\'êtes pas autorisé à accéder à cette compétence');
      } else if (error.error?.message?.includes('cannot be added')) {
        return new Error('Certains participants ne peuvent pas être ajoutés à ce groupe');
      } else {
        return new Error('Données invalides');
      }
    } else if (error.status === 403) {
      return new Error('Accès refusé à cette conversation');
    } else if (error.status === 404) {
      return new Error('Utilisateur, compétence ou conversation introuvable');
    } else {
      return new Error(error.message || 'Erreur lors de la création de la conversation');
    }
  }

  // ===== MÉTHODES EXISTANTES =====
  
  async syncUserId(): Promise<number | undefined> {
    if (!this.currentUserId) {
      await this.loadUserInfo();
    }
    return this.currentUserId;
  }

  async getCurrentUserIdAsync(): Promise<number | undefined> {
    if (this.currentUserId) {
      return this.currentUserId;
    }
    return await this.syncUserId();
  }

 // REMPLACER getUserConversations par :
 
getUserConversations(page = 0, size = 20): Observable<Conversation[]> {
  return from(this.ensureUserIdSynchronized()).pipe(
    switchMap(userId => {
      if (!userId) return of([]);
      
      return from(this.keycloakService.getToken()).pipe(
        switchMap(token => {
          if (!token) return of([]);
          
          const headers = new HttpHeaders({ 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          });
          
          return this.http.get<any>(`${this.apiUrl}/conversations`, {
            headers,
            params: { page: page.toString(), size: size.toString() }
          }).pipe(
            map(response => {
              const conversations = response.content || response || [];
              
              // TRIER par dernier message (plus récent en premier)
              const sortedConversations = conversations.sort((a: Conversation, b: Conversation) => {
                const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
                const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
                return timeB - timeA; // Ordre décroissant
              });
              
              console.log('✅ Conversations chargées et triées:', sortedConversations.length);
              return sortedConversations;
            }),
            tap(conversations => {
              this.conversationsSubject.next(conversations);
            }),
            catchError(error => {
              console.error('❌ Erreur chargement conversations:', error);
              return of([]);
            })
          );
        })
      );
    }),
    retry(1)
  );
}

// 6. NOUVELLE MÉTHODE - Forcer le tri manuel
public sortConversationsByLastMessage(): void {
  const conversations = this.conversationsSubject.value;
  
  const sorted = [...conversations].sort((a, b) => {
    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return timeB - timeA;
  });
  
  this.conversationsSubject.next(sorted);
  console.log('🔄 Conversations retriées manuellement');
}

// 7. MÉTHODE publique pour rafraîchir en temps réel
public enableRealTimeUpdates(): void {
  // S'assurer que les WebSocket sont connectés
  if (!this.isConnected()) {
    this.reconnect();
    return;
  }
  
  // Rafraîchir la liste toutes les 30 secondes comme backup
  interval(30000).pipe(
    takeUntil(this.destroy$),
    switchMap(() => this.getUserConversations(0, 50))
  ).subscribe({
    next: (conversations) => {
      // Fusionner avec les données locales pour garder les mises à jour temps réel
      this.mergeConversationsData(conversations);
    },
    error: (error) => {
      console.warn('⚠️ Erreur rafraîchissement périodique:', error);
    }
  });
}
private mergeConversationsData(serverConversations: Conversation[]): void {
  const localConversations = this.conversationsSubject.value;
  const merged = new Map<number, Conversation>();
  
  // Ajouter conversations serveur
  serverConversations.forEach(conv => merged.set(conv.id, conv));
  
  // Fusionner avec données locales (priorité aux plus récentes)
  localConversations.forEach(localConv => {
    const serverConv = merged.get(localConv.id);
    
    if (serverConv) {
      // Garder le plus récent lastMessageTime
      const localTime = localConv.lastMessageTime ? new Date(localConv.lastMessageTime).getTime() : 0;
      const serverTime = serverConv.lastMessageTime ? new Date(serverConv.lastMessageTime).getTime() : 0;
      
      merged.set(localConv.id, localTime > serverTime ? localConv : serverConv);
    } else {
      // Conversation locale uniquement
      merged.set(localConv.id, localConv);
    }
  });
  
  // Trier et émettre
  const sortedConversations = Array.from(merged.values()).sort((a, b) => {
    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return timeB - timeA;
  });
  
  this.conversationsSubject.next(sortedConversations);
}


  private async ensureUserIdSynchronized(): Promise<number | undefined> {
    if (this.currentUserId && this.currentUserId > 0) {
      console.log('✅ Using existing user ID:', this.currentUserId);
      return this.currentUserId;
    }
    
    console.log('🔄 Synchronizing user ID...');
    
    try {
      const profile = await this.keycloakService.getUserProfile();
      if (!profile?.id) {
        throw new Error('No Keycloak profile available');
      }
      
      console.log('🔍 Keycloak profile ID:', profile.id);
      
      const token = await this.keycloakService.getToken();
      if (token) {
        const realUserId = await this.fetchRealUserIdFromBackend(profile.id, token);
        if (realUserId) {
          this.currentUserId = realUserId;
          console.log('✅ Real user ID fetched from backend:', this.currentUserId);
          return this.currentUserId;
        }
      }
      
      this.currentUserId = this.generateNumericIdFromUUID(profile.id);
      console.log('⚠️ Using generated ID as fallback:', this.currentUserId);
      return this.currentUserId;
      
    } catch (error) {
      console.error('❌ Error synchronizing user ID:', error);
      return undefined;
    }
  }

  

  private fetchConversationsFromAPI(token: string, userId: number, page: number, size: number): Observable<any> {
    const headers = new HttpHeaders({ 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-User-Id': userId.toString()
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
      retry(2),
      catchError(error => {
        console.error('❌ HTTP Error:', {
          status: error.status,
          message: error.message,
          url: error.url,
          error: error.error
        });
        
        return of({ content: [], totalElements: 0 });
      })
    );
  }

  private processConversationsResponse(response: any): Conversation[] {
    console.log('🔄 Processing API response...');
    
    if (!response) {
      console.warn('⚠️ Empty response received');
      return [];
    }
    
    let conversations: Conversation[] = [];
    
    if (Array.isArray(response)) {
      conversations = response;
      console.log('✅ Direct array response:', conversations.length);
    } else if (response.content && Array.isArray(response.content)) {
      conversations = response.content;
      console.log('✅ Paginated response:', {
        content: conversations.length,
        totalElements: response.totalElements,
        totalPages: response.totalPages,
        currentPage: response.number
      });
    } else if (response._embedded?.conversations) {
      conversations = response._embedded.conversations;
      console.log('✅ HAL response:', conversations.length);
    } else if (response.data && Array.isArray(response.data)) {
      conversations = response.data;
      console.log('✅ Data wrapper response:', conversations.length);
    } else {
      console.warn('⚠️ Unknown response format:', response);
    }
    
    return conversations;
  }

  // ===== MÉTHODES API EXISTANTES =====

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
        const messages = response.content || response || [];
        
        // Marquer automatiquement comme lu après chargement (seulement première page)
        if (page === 0 && messages.length > 0) {
          // Déclencher le marquage asynchrone sans bloquer
          setTimeout(() => {
            this.markAsRead(conversationId).subscribe({
              next: () => console.log('✅ Auto-marked as read'),
              error: (err) => console.warn('⚠️ Could not auto-mark as read:', err)
            });
          }, 500);
        }
        
        return messages;
      }),
      retry(2)
    );
  }


  /**
   * ✅ NOUVEAU: Force le recalcul des messages non lus
   */
  forceRecalculateUnread(): Observable<void> {
    console.log('🔄 Force recalculating unread counts');
    
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.post<any>(`${this.apiUrl}/recalculate-unread`, {}, { headers });
      }),
      tap(() => {
        this.syncReadState().subscribe();
      }),
      map(() => void 0)
    );
  }

  /**
   * ✅ NOUVEAU: Réinitialise le cache de lecture (pour debug)
   */
  clearReadCache() {
    console.log('🗑️ Clearing read status cache');
    this.readStatusCache.clear();
    this.unreadCountsSubject.next(new Map());
    this.totalUnreadSubject.next(0);
  }
getConversationReadStatus(conversationId: number): { isRead: boolean; unreadCount: number } {
    const unreadCount = this.unreadCountsSubject.value.get(conversationId) || 0;
    return {
      isRead: unreadCount === 0,
      unreadCount
    };
  }

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
      
      const messageKey = `${payload.conversationId}_${request.senderId}_${payload.content}_${Math.floor(Date.now() / 1000)}`;
      this.recentlyProcessedMessages.add(messageKey);
      
      return this.http.post<Message>(`${this.apiUrl}/send`, payload, { headers });
    }),
    tap(message => {
      console.log('✅ Message sent:', message);
      
      const messages = this.messagesSubject.value;
      
      const exists = messages.some(m => 
        m.id === message.id || 
        (m.content === message.content && 
         m.senderId === message.senderId && 
         m.conversationId === message.conversationId)
      );
      
      if (!exists) {
        this.messagesSubject.next([...messages, message]);
        this.updateConversationListOrder(message.conversationId, message);
      }
      
      // NOUVEAU: Marquer automatiquement comme lu quand on envoie un message
      this.markAsRead(message.conversationId).subscribe();
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

markAsRead(conversationId: number): Observable<any> {
  console.log(`📖 Marking conversation ${conversationId} as read`);
  
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        throw new Error('No token available');
      }
      
      const headers = new HttpHeaders({ 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      });
      
      return this.http.post<any>(
        `${this.apiUrl}/conversation/${conversationId}/read`,
        {},
        { headers }
      );
    }),
    tap(response => {
      console.log('✅ Messages marked as read:', response);
      
      // Mettre à jour le cache local
      this.updateLocalReadState(conversationId, 0);
      
      // Mettre à jour les compteurs
      this.updateUnreadCount(conversationId, 0);
      
      // NOUVEAU: Émettre événement global de synchronisation
      this.emitGlobalReadEvent(conversationId);
      
      // Émettre l'événement de lecture
      this.emitReadReceipt(conversationId);
    }),
    catchError(error => {
      console.error('❌ Error marking as read:', error);
      return of({ success: false, error: error.message });
    }),
    retry(2)
  );
}

// Nouvelle méthode à ajouter :
private emitGlobalReadEvent(conversationId: number) {
  // Émettre vers tous les composants
  window.dispatchEvent(new CustomEvent('globalConversationRead', {
    detail: {
      conversationId: conversationId,
      timestamp: new Date(),
      source: 'messaging-service'
    }
  }));
  
  // Mettre à jour les conversations locales
  const conversations = this.conversationsSubject.value;
  const updated = conversations.map(conv => {
    if (conv.id === conversationId) {
      return { ...conv, unreadCount: 0 };
    }
    return conv;
  });
  
  this.conversationsSubject.next(updated);
}
  private updateLocalReadState(conversationId: number, unreadCount: number) {
    this.readStatusCache.set(conversationId, {
      lastRead: new Date(),
      unreadCount: unreadCount
    });
    
    // Mettre à jour le BehaviorSubject
    const currentCounts = this.unreadCountsSubject.value;
    currentCounts.set(conversationId, unreadCount);
    this.unreadCountsSubject.next(new Map(currentCounts));
    
    // Recalculer le total
    this.recalculateTotalUnread();
  }
    getUnreadCount(conversationId: number): Observable<number> {
    // Vérifier d'abord le cache
    const cached = this.readStatusCache.get(conversationId);
    if (cached && (Date.now() - cached.lastRead.getTime() < 5000)) { // Cache de 5 secondes
      return of(cached.unreadCount);
    }
    
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<any>(
          `${this.apiUrl}/conversation/${conversationId}/unread-count`,
          { headers }
        );
      }),
      map(response => response.unreadCount || 0),
      tap(count => {
        this.updateLocalReadState(conversationId, count);
      }),
      catchError(() => of(0))
    );
  }

  /**
   * ✅ NOUVEAU: Récupère tous les compteurs de messages non lus
   */
  getAllUnreadCounts(): Observable<Map<number, number>> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<{[key: number]: number}>(
          `${this.apiUrl}/unread-per-conversation`,
          { headers }
        );
      }),
      map(counts => {
        const map = new Map<number, number>();
        Object.entries(counts).forEach(([convId, count]) => {
          map.set(Number(convId), count);
        });
        return map;
      }),
      tap(counts => {
        this.unreadCountsSubject.next(counts);
        this.recalculateTotalUnread();
      }),
      catchError(() => of(new Map()))
    );
  }

  /**
   * ✅ NOUVEAU: Force la synchronisation de l'état de lecture
   */
  syncReadState(): Observable<void> {
    console.log('🔄 Syncing read state with server');
    
    return this.getAllUnreadCounts().pipe(
      map(() => void 0)
    );
  }

  /**
   * ✅ NOUVEAU: Initialise la synchronisation WebSocket pour l'état de lecture
   */
private initializeReadStateSync() {
    if (!this.stompClient) return;

    // Écouter les receipts de lecture
    this.stompClient.subscribe('/user/queue/read-receipt', (message: any) => {
      const receipt = JSON.parse(message.body);
      console.log('📖 Read receipt received:', receipt);
      
      // Mettre à jour l'état local
      if (receipt.conversationId) {
        this.updateLocalReadState(receipt.conversationId, 0);
      }
    });

    // Écouter les mises à jour de compteurs
    this.stompClient.subscribe('/user/queue/unread-update', (message: any) => {
      const update = JSON.parse(message.body);
      console.log('🔔 Unread count update:', update);
      
      if (update.conversationId && update.action) {
        const current = this.unreadCountsSubject.value.get(update.conversationId) || 0;
        let newCount = current;
        
        if (update.action === 'INCREMENT') {
          newCount = current + 1;
        } else if (update.action === 'DECREMENT') {
          newCount = Math.max(0, current - (update.count || 1));
        } else if (update.action === 'SET') {
          newCount = update.count || 0;
        }
        
        this.updateLocalReadState(update.conversationId, newCount);
      }
    });

    // Synchronisation multi-device
    this.stompClient.subscribe('/user/queue/sync-read-state', (message: any) => {
      const syncData = JSON.parse(message.body);
      console.log('🔄 Read state sync:', syncData);
      
      if (syncData.conversationId) {
        this.updateLocalReadState(syncData.conversationId, 0);
      }
    });
  }

  /**
   * ✅ NOUVEAU: Recalcule le nombre total de messages non lus
   */
  private recalculateTotalUnread() {
    const total = Array.from(this.unreadCountsSubject.value.values())
      .reduce((sum, count) => sum + count, 0);
    this.totalUnreadSubject.next(total);
  }

  /**
   * ✅ NOUVEAU: Met à jour le compteur pour une conversation
   */
  updateUnreadCount(conversationId: number, count: number) {
    const counts = this.unreadCountsSubject.value;
    counts.set(conversationId, count);
    this.unreadCountsSubject.next(new Map(counts));
    this.recalculateTotalUnread();
  }

  /**
   * ✅ NOUVEAU: Émet un receipt de lecture
   */
  private emitReadReceipt(conversationId: number) {
    const receipts = this.readReceiptsSubject.value;
    receipts.push({
      conversationId,
      timestamp: new Date(),
      userId: this.currentUserId
    });
    this.readReceiptsSubject.next([...receipts]);
  }

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
private formatFileUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  
  // Si l'URL est déjà complète
  if (fileUrl.startsWith('http')) {
    return fileUrl;
  }
  
  // Si c'est un chemin relatif, construire l'URL complète
  // CORRECTION: Utiliser le bon endpoint
  return `http://localhost:8822/message-uploads/${fileUrl}`;
}
  

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

  getCurrentUserRole(): string | undefined {
    return this.currentUserRole;
  }

  setCurrentConversation(conversation: Conversation | null): void {
    this.currentConversationSubject.next(conversation);
  }

  clearMessages(): void {
    this.messagesSubject.next([]);
  }

  forceReloadConversations(): Observable<Conversation[]> {
    console.log('🔄 Force reloading conversations...');
    this.currentUserId = undefined;
    this.conversationsSubject.next([]);
    return this.getUserConversations();
  }

  // ===== POLLING =====
  // ===== POLLING =====
private startPolling() {
  this.pollingInterval = interval(30000).pipe(
    takeUntil(this.destroy$),
    switchMap(() => {
      // Récupérer tous les compteurs non lus au lieu d'un seul
      return this.getAllUnreadCounts().pipe(
        map(() => void 0)
      );
    }),
    catchError(error => {
      console.warn('⚠️ Polling error:', error);
      return of(void 0);
    })
  ).subscribe();
}
  sendConversationActiveStatus(conversationId: number, active: boolean): void {
  if (!this.stompClient || !this.stompClient.connected) {
    console.warn('⚠️ WebSocket not connected, cannot send active status');
    return;
  }

  try {
    const payload = {
      active: active,
      conversationId: conversationId,
      timestamp: new Date().toISOString()
    };

    this.stompClient.publish({
      destination: `/app/conversation/${conversationId}/active`,
      body: JSON.stringify(payload)
    });

    console.log(`📡 Sent conversation active status: ${conversationId} is ${active ? 'active' : 'inactive'}`);
    
    // Si la conversation devient active, marquer automatiquement les messages comme lus
    if (active) {
      // Déclencher le marquage après un petit délai
      setTimeout(() => {
        this.markAsRead(conversationId).subscribe({
          next: () => console.log('✅ Auto-marked as read on activation'),
          error: (err) => console.warn('⚠️ Could not auto-mark as read:', err)
        });
      }, 500);
    }
  } catch (error) {
    console.error('❌ Error sending conversation active status:', error);
  }
}


ngOnDestroy(): void {
  // FIXED: Send offline status before disconnecting
  if (this.currentUserId && this.stompClient?.connected) {
    try {
      this.sendPresenceUpdate(false);
      
      // Wait a moment for the message to be sent
      setTimeout(() => {
        if (this.stompClient) {
          this.stompClient.deactivate();
        }
      }, 200);
    } catch (error) {
      console.error('Error sending offline status on destroy:', error);
    }
  }
  
  this.recentlyProcessedMessages.clear();
  this.destroy$.next();
  this.destroy$.complete();
  
  if (this.presenceCheckInterval) {
    clearInterval(this.presenceCheckInterval);
  }
  
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
  }
  
  if (this.pollingInterval) {
    this.pollingInterval.unsubscribe();
  }
}
  /**
 * ✅ NOUVEAU: Récupère toutes les compétences de l'utilisateur avec leurs utilisateurs
 */
getUserSkillsWithUsers(): Observable<UserSkillsWithUsersResponse> {
  console.log('🎓 Fetching user skills with users via new API...');
  
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      return this.http.get<UserSkillsWithUsersResponse>(`${this.exchangeApiUrl}/my-skills/users`, { headers });
    }),
    tap(response => {
      console.log('✅ User skills with users loaded:', {
        role: response.userPrimaryRole,
        skillsCount: response.skills.length,
        totalUsers: response.globalStats.totalUsers
      });
    }),
    catchError(error => {
      console.error('❌ Error fetching user skills with users:', error);
      return throwError(() => new Error('Failed to fetch skills with users'));
    })
  );
}

/**
 * ✅ MISE À JOUR: Méthode optimisée pour récupérer les compétences disponibles
 */
getAvailableSkills(): Observable<SkillResponse[]> {
  console.log('🎓 Fetching available skills via optimized API...');
  
  return this.getUserSkillsWithUsers().pipe(
    map(response => 
      response.skills.map(skill => ({
        id: skill.skillId,
        name: skill.skillName,
        description: skill.skillDescription || '',
        userId: skill.skillProducer.id,
        categoryName: 'General' // Peut être enrichi si disponible dans l'API
      } as SkillResponse))
    ),
    catchError(error => {
      console.error('❌ Error in getAvailableSkills, falling back to old method:', error);
      return this.getAvailableSkillsFallback();
    })
  );
}

/**
 * ✅ NOUVEAU: Méthode de fallback pour les compétences
 */
private getAvailableSkillsFallback(): Observable<SkillResponse[]> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return of([]);
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      if (this.currentUserRole === 'PRODUCER') {
        return this.http.get<any>(`${this.skillApiUrl}/producer`, { headers }).pipe(
          map(response => {
            if (Array.isArray(response)) return response;
            if (response.content && Array.isArray(response.content)) return response.content;
            return [];
          })
        );
      } else if (this.currentUserRole === 'RECEIVER') {
        return this.http.get<SkillResponse[]>(`${this.exchangeApiUrl}/accepted-skills`, { headers });
      } else {
        return of([]);
      }
    }),
    catchError(() => of([]))
  );
}
/**
 * ✅ NOUVEAU: Méthode pour obtenir des statistiques détaillées sur les compétences
 */
getSkillUsersStats(): Observable<UserSkillsStats> {
  return this.getUserSkillsWithUsers().pipe(
    map(response => response.globalStats),
    catchError(error => {
      console.error('❌ Error getting skill stats:', error);
      return of({
        totalSkills: 0,
        totalUsers: 0,
        totalProducers: 0,
        totalReceivers: 0,
        statusBreakdown: {}
      });
    })
  );
}

/**
 * ✅ NOUVEAU: Vérifie si l'utilisateur peut accéder à une compétence spécifique
 */
canAccessSkill(skillId: number): Observable<boolean> {
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      return response.skills.some(skill => skill.skillId === skillId);
    }),
    catchError(error => {
      console.warn('⚠️ Error checking skill access:', error);
      return of(false);
    })
  );
}

/**
 * ✅ NOUVEAU: Obtient les informations détaillées d'une compétence
 */
getSkillDetails(skillId: number): Observable<SkillWithUsersResponse | null> {
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      return response.skills.find(skill => skill.skillId === skillId) || null;
    }),
    catchError(error => {
      console.error('❌ Error getting skill details:', error);
      return of(null);
    })
  );
}

/**
 * ✅ NOUVEAU: Obtient le rôle de l'utilisateur dans une compétence spécifique
 */
getUserRoleInSkill(skillId: number): Observable<'PRODUCER' | 'RECEIVER' | null> {
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      const skill = response.skills.find(s => s.skillId === skillId);
      return skill ? skill.userRole : null;
    }),
    catchError(() => of(null))
  );
}

/**
 * ✅ NOUVEAU: Validation avant création de conversation
 */
validateSkillConversationAccess(skillId: number): Observable<{
  canAccess: boolean;
  userRole: 'PRODUCER' | 'RECEIVER' | null;
  participantCount: number;
  skillName: string;
}> {
  return this.getUserSkillsWithUsers().pipe(
    map(response => {
      const skill = response.skills.find(s => s.skillId === skillId);
      
      if (!skill) {
        return {
          canAccess: false,
          userRole: null,
          participantCount: 0,
          skillName: 'Compétence non trouvée'
        };
      }
      
      return {
        canAccess: true,
        userRole: skill.userRole,
        participantCount: skill.stats.totalUsers,
        skillName: skill.skillName
      };
    }),
    catchError(error => {
      console.error('❌ Error validating skill access:', error);
      return of({
        canAccess: false,
        userRole: null,
        participantCount: 0,
        skillName: 'Erreur de validation'
      });
    })
  );
}

/**
 * ✅ NOUVEAU: Cache intelligent pour optimiser les performances
 */
private skillsCache: {
  data: UserSkillsWithUsersResponse | null;
  timestamp: number;
  ttl: number; // Time to live en millisecondes
} = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

/**
 * ✅ NOUVEAU: Récupération avec cache
 */
private getUserSkillsWithUsersFromCache(): Observable<UserSkillsWithUsersResponse> {
  const now = Date.now();
  
  // Vérifier si le cache est encore valide
  if (this.skillsCache.data && 
      (now - this.skillsCache.timestamp) < this.skillsCache.ttl) {
    console.log('📋 Using cached skills data');
    return of(this.skillsCache.data);
  }
  
  // Charger de nouvelles données
  console.log('🔄 Loading fresh skills data');
  return this.getUserSkillsWithUsers().pipe(
    tap(data => {
      this.skillsCache.data = data;
      this.skillsCache.timestamp = now;
    })
  );
}

/**
 * ✅ NOUVEAU: Invalider le cache manuellement
 */
invalidateSkillsCache(): void {
  this.skillsCache.data = null;
  this.skillsCache.timestamp = 0;
  console.log('🗑️ Skills cache invalidated');
}

/**
 * ✅ NOUVEAU: Méthode de debug pour vérifier les données
 */
debugSkillsData(): void {
  this.getUserSkillsWithUsers().subscribe(data => {
    console.log('🐛 DEBUG - Skills data:', {
      userRole: data.userPrimaryRole,
      skillsCount: data.skills.length,
      totalUsers: data.globalStats.totalUsers,
      skills: data.skills.map(s => ({
        id: s.skillId,
        name: s.skillName,
        role: s.userRole,
        receiverCount: s.receivers.length,
        producerName: s.skillProducer.firstName + ' ' + s.skillProducer.lastName
      }))
    });
  });
}
// Méthode publique pour forcer le rafraîchissement de la liste
public forceRefreshConversations(): void {
  console.log('🔄 Force refreshing conversations list...');
  
  this.getUserConversations(0, 50).subscribe({
    next: (conversations) => {
      this.conversationsSubject.next(conversations);
      console.log('✅ Conversations list force refreshed:', conversations.length);
    },
    error: (error) => {
      console.error('❌ Error force refreshing:', error);
    }
  });
}
markConversationAsRead(conversationId: number): Observable<any> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const headers = new HttpHeaders({ 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      });
      
      return this.http.post(`${this.apiUrl}/conversations/${conversationId}/mark-read`, {}, { headers });
    })
  );
}

/**
 * ✅ NOUVEAU: Vérifie si une conversation de compétence existe déjà
 */
checkSkillConversationExists(skillId: number): Observable<Conversation | null> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      return this.http.get<Conversation[]>(
        `${this.apiUrl}/conversations?type=SKILL_GROUP`,
        { headers }
      ).pipe(
        map(conversations => {
          // Rechercher spécifiquement une conversation liée à cette compétence
          const skillConversation = conversations.find(conv => 
            conv.skillId === skillId && conv.type === 'SKILL_GROUP'
          );
          return skillConversation || null;
        })
      );
    }),
    catchError(error => {
      console.log('ℹ️ No existing skill conversation found:', error);
      return of(null);
    })
  );
}

/**
 * ✅ NOUVEAU: Récupère une conversation de compétence existante
 */
getSkillConversation(skillId: number): Observable<Conversation | null> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      return this.http.get<Conversation | null>(
        `${this.apiUrl}/conversations/skill/${skillId}`,
        { headers }
      );
    }),
    catchError(error => {
      console.error('❌ Error fetching skill conversation:', error);
      return of(null);
    })
  );
}

getSkillConversationBySkillId(skillId: number): Observable<Conversation | null> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      return this.http.get<Conversation | null>(
        `${this.apiUrl}/conversations/by-skill/${skillId}`,
        { headers }
      );
    }),
    catchError(error => {
      console.error('❌ Error fetching skill conversation by skill ID:', error);
      return of(null);
    })
  );
}

}