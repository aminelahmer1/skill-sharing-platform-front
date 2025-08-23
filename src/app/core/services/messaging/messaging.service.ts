//2


// messaging.service.ts - VERSION COMPLÈTE MISE À JOUR AVEC EXCHANGE SERVICE
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

// ✅ NOUVEAU: Interfaces pour Exchange Service
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
        
        const realUserId = await this.getRealUserId(profile.id);
        if (realUserId) {
          this.currentUserId = realUserId;
          console.log('✅ Real user ID loaded from backend:', this.currentUserId);
        } else {
          this.currentUserId = this.generateNumericIdFromUUID(profile.id);
          console.log('⚠️ Using generated ID as fallback:', this.currentUserId);
        }

        // ✅ NOUVEAU: Déterminer le rôle de l'utilisateur
        const roles = this.keycloakService.getRoles();
        this.currentUserRole = roles.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER';
        console.log('👤 User role determined:', this.currentUserRole);
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
      this.stompClient.subscribe(`/user/${this.currentUserId}/queue/conversation`, (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('📨 Received user message:', data);
          this.handleNewMessage(data);
        } catch (error) {
          console.error('❌ Error parsing user message:', error);
        }
      });

      this.stompClient.subscribe('/topic/conversation/*', (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('📨 Received conversation message:', data);
          this.handleNewMessage(data);
        } catch (error) {
          console.error('❌ Error parsing conversation message:', error);
        }
      });

      this.stompClient.subscribe('/topic/typing', (message) => {
        try {
          const data = JSON.parse(message.body);
          console.log('⌨️ Received typing indicator:', data);
          this.handleTypingIndicator(data);
        } catch (error) {
          console.error('❌ Error parsing typing indicator:', error);
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
        throw this.handleConversationError(error);
      }),
      retry(1)
    );
  }

  /**
   * ✅ MISE À JOUR: Crée ou récupère une conversation de compétence avec validation des utilisateurs autorisés
   */
  createSkillConversation(skillId: number): Observable<Conversation> {
  console.log('📤 Creating skill conversation for skill:', skillId);
  
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
      
      // Ajouter à la liste des conversations si pas déjà présente
      const conversations = this.conversationsSubject.value;
      const exists = conversations.find(c => c.id === conversation.id);
      if (!exists) {
        this.conversationsSubject.next([conversation, ...conversations]);
      }
    }),
    catchError(error => {
      console.error('❌ Error creating skill conversation:', error);
      throw this.handleConversationError(error);
    }),
    retry(1)
  );
}


  /**
   * ✅ MISE À JOUR: Crée une conversation de groupe avec validation des participants autorisés
   */
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
        throw this.handleConversationError(error);
      }),
      retry(1)
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
              console.log('✅ Conversations loaded:', conversations.length);
              return conversations;
            }),
            tap(conversations => {
              this.conversationsSubject.next(conversations);
            }),
            catchError(error => {
              console.error('❌ Error loading conversations:', error);
              return of([]);
            })
          );
        })
      );
    }),
    retry(1)
  );
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


}