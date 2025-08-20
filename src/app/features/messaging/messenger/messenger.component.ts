// messenger.component.ts - VERSION AVEC DEBUG ET S
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, tap } from 'rxjs';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { ChatWindowComponent } from '../chat-window/chat-window.component';
import { NewConversationDialogComponent } from '../new-conversation-dialog/new-conversation-dialog.component';
import { MessagingService, Conversation } from '../../../core/services/messaging/messaging.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-messenger',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConversationListComponent,
    ChatWindowComponent,
    NewConversationDialogComponent
  ],
  templateUrl: './messenger.component.html',
  styleUrls: ['./messenger.component.css'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(-100%)' }),
        animate('300ms ease-in', style({ transform: 'translateX(0%)' }))
      ])
    ])
  ]
})
export class MessengerComponent implements OnInit, OnDestroy {
  selectedConversation: Conversation | null = null;
  conversations: Conversation[] = [];
  filteredConversations: Conversation[] = [];
  searchQuery = '';
  isLoading = true;
  currentUserId?: number;
  userRole?: string;
  
  // États pour le dialog et la gestion d'erreurs
  showNewConversationDialog = false;
  hasError = false;
  errorMessage = '';
  connectionStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR' = 'DISCONNECTED';
  
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    private messagingService: MessagingService,
    private keycloakService: KeycloakService
  ) {}

  async ngOnInit() {
    console.log('🚀 MessengerComponent initializing...');
    
    try {
      await this.loadUserInfo();
      this.setupSearch();
      await this.loadConversations();
      this.subscribeToUpdates();
      this.subscribeToConnectionStatus();
      
      console.log('✅ MessengerComponent initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing MessengerComponent:', error);
      this.hasError = true;
      this.errorMessage = 'Erreur lors de l\'initialisation';
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== CHARGEMENT UTILISATEUR =====
  private async loadUserInfo() {
    try {
      console.log('👤 Loading user info...');
      
      const profile = await this.keycloakService.getUserProfile();
      console.log('👤 Keycloak profile:', profile);
      
      if (profile) {
        if (!isNaN(Number(profile.id))) {
          this.currentUserId = parseInt(profile.id || '0');
        } else {
          this.currentUserId = this.generateNumericIdFromUUID(profile.id || '');
        }
        
        const roles = this.keycloakService.getRoles();
        this.userRole = roles.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER';
        
        console.log('✅ User info loaded:', { 
          userId: this.currentUserId, 
          role: this.userRole,
          keycloakId: profile.id 
        });
      } else {
        throw new Error('No user profile found');
      }
    } catch (error) {
      console.error('❌ Error loading user info:', error);
      this.hasError = true;
      this.errorMessage = 'Impossible de charger les informations utilisateur';
      throw error;
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

  // ===== CHARGEMENT CONVERSATIONS =====
  private async loadConversations() {
    console.log('📋 Loading conversations...');
    
    this.isLoading = true;
    this.hasError = false;
    
    try {
      // ✅ : S'assurer que l'utilisateur est chargé
      if (!this.currentUserId) {
        console.warn('⚠️ No current user ID, retrying user load...');
        await this.loadUserInfo();
      }
      
      console.log('📡 Fetching conversations from service...');
      
      const conversations$ = this.messagingService.getUserConversations();
      
      // ✅ AJOUT: Debug des appels réseau
      conversations$.pipe(
        tap(conversations => {
          console.log('📋 Raw conversations response:', conversations);
          console.log('📋 Number of conversations:', conversations?.length || 0);
          
          if (conversations && conversations.length > 0) {
            conversations.forEach((conv, index) => {
              console.log(`📋 Conversation ${index + 1}:`, {
                id: conv.id,
                name: conv.name,
                type: conv.type,
                participants: conv.participants?.length || 0,
                lastMessage: conv.lastMessage,
                unreadCount: conv.unreadCount
              });
            });
          }
        }),
        takeUntil(this.destroy$)
      ).subscribe({
        next: (conversations) => {
          console.log('✅ Conversations loaded successfully:', conversations.length);
          
          this.conversations = conversations || [];
          this.applyCurrentFilter();
          this.isLoading = false;
          this.hasError = false;
          
          // ✅ AJOUT: Log détaillé de l'état final
          console.log('📋 Final state:', {
            totalConversations: this.conversations.length,
            filteredConversations: this.filteredConversations.length,
            isLoading: this.isLoading,
            hasError: this.hasError,
            currentUserId: this.currentUserId
          });
        },
        error: (error) => {
          console.error('❌ Error loading conversations:', error);
          
          // ✅ AJOUT: Log détaillé de l'erreur
          console.error('❌ Error details:', {
            status: error.status,
            statusText: error.statusText,
            message: error.message,
            url: error.url,
            error: error.error
          });
          
          this.isLoading = false;
          this.hasError = true;
          
          if (error.status === 401) {
            this.errorMessage = 'Session expirée. Veuillez vous reconnecter.';
          } else if (error.status === 403) {
            this.errorMessage = 'Accès refusé aux conversations';
          } else if (error.status === 503) {
            this.errorMessage = 'Service temporairement indisponible';
          } else if (error.status === 0) {
            this.errorMessage = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
          } else {
            this.errorMessage = `Erreur lors du chargement des conversations (${error.status})`;
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Exception in loadConversations:', error);
      this.isLoading = false;
      this.hasError = true;
      this.errorMessage = 'Erreur inattendue lors du chargement';
    }
  }

  // ===== AUTRES MÉTHODES =====
  private setupSearch() {
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  private performSearch(query: string) {
    console.log('🔍 Performing search:', query);
    
    if (!query.trim()) {
      this.filteredConversations = [...this.conversations];
      return;
    }

    const lowerQuery = query.toLowerCase().trim();
    
    this.filteredConversations = this.conversations.filter(conv => {
      const matchesName = conv.name.toLowerCase().includes(lowerQuery);
      const matchesParticipant = conv.participants.some(p => 
        p.userName.toLowerCase().includes(lowerQuery)
      );
      const matchesLastMessage = conv.lastMessage && 
        conv.lastMessage.toLowerCase().includes(lowerQuery);
      
      return matchesName || matchesParticipant || matchesLastMessage;
    });

    console.log(`🔍 Search "${query}" found ${this.filteredConversations.length} results`);
  }

  private applyCurrentFilter() {
    console.log('🔧 Applying current filter...');
    
    if (this.searchQuery) {
      this.performSearch(this.searchQuery);
    } else {
      this.filteredConversations = [...this.conversations];
    }
    
    console.log('🔧 Filter applied:', {
      total: this.conversations.length,
      filtered: this.filteredConversations.length,
      searchQuery: this.searchQuery
    });
  }

  private subscribeToConnectionStatus() {
    this.messagingService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        console.log('📡 Connection status changed:', status);
        this.connectionStatus = status;
        
        if (status === 'CONNECTED' && this.hasError) {
          console.log('🔄 Connection restored, reloading conversations...');
          this.loadConversations();
        }
      });
  }

  private subscribeToUpdates() {
    this.messagingService.conversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversations => {
        console.log('🔄 Conversations updated via subscription:', conversations.length);
        this.conversations = conversations;
        this.applyCurrentFilter();
      });
  }

  // ===== HANDLERS D'ÉVÉNEMENTS =====
  onConversationSelect(conversation: Conversation) {
    console.log('📋 Selecting conversation:', conversation.id, conversation.name);
    this.selectedConversation = conversation;
    this.messagingService.setCurrentConversation(conversation);
    
    // Marquer comme lu
    this.messagingService.markAsRead(conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Conversation marked as read');
          this.updateConversationUnreadCount(conversation.id, 0);
        },
        error: (error) => {
          console.warn('⚠️ Failed to mark conversation as read:', error);
        }
      });
  }

  onCreateConversation() {
    console.log('➕ Opening new conversation dialog...');
    if (this.canCreateConversations()) {
      this.showNewConversationDialog = true;
    }
  }

  onConversationCreated(conversation: Conversation) {
    console.log('✅ New conversation created:', conversation);
    this.showNewConversationDialog = false;
    
    const existingIndex = this.conversations.findIndex(c => c.id === conversation.id);
    if (existingIndex === -1) {
      this.conversations.unshift(conversation);
      this.applyCurrentFilter();
    }
    
    this.selectedConversation = conversation;
    this.messagingService.setCurrentConversation(conversation);
    
    this.showSuccessNotification('Conversation créée avec succès !');
  }

  onNewConversationCancelled() {
    console.log('❌ New conversation dialog cancelled');
    this.showNewConversationDialog = false;
  }

  onSearchChange() {
    this.searchSubject.next(this.searchQuery);
  }

  onRetry() {
    console.log('🔄 Manual retry triggered');
    this.loadConversations();
  }

  onReconnect() {
    console.log('🔌 Manual reconnection triggered');
    this.messagingService.reconnect();
  }

  // ===== MÉTHODES UTILITAIRES =====
  private updateConversationUnreadCount(conversationId: number, count: number) {
    this.conversations = this.conversations.map(c => {
      if (c.id === conversationId) {
        return { ...c, unreadCount: count };
      }
      return c;
    });
    this.applyCurrentFilter();
  }

  private showSuccessNotification(message: string) {
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
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      z-index: 10001;
      font-weight: 500;
      animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }
    }, 3000);
  }

  canCreateConversations(): boolean {
    return !!this.currentUserId && this.connectionStatus === 'CONNECTED' && !this.hasError;
  }

  getConnectionStatusText(): string {
    switch (this.connectionStatus) {
      case 'CONNECTING': return 'Connexion...';
      case 'CONNECTED': return 'Connecté';
      case 'DISCONNECTED': return 'Déconnecté';
      case 'ERROR': return 'Erreur de connexion';
      default: return 'Inconnu';
    }
  }

  getConnectionStatusClass(): string {
    switch (this.connectionStatus) {
      case 'CONNECTING': return 'status-connecting';
      case 'CONNECTED': return 'status-connected';
      case 'DISCONNECTED': return 'status-disconnected';
      case 'ERROR': return 'status-error';
      default: return '';
    }
  }

  getSearchPlaceholder(): string {
    if (this.conversations.length === 0) {
      return 'Aucune conversation...';
    }
    return `Rechercher parmi ${this.conversations.length} conversation${this.conversations.length > 1 ? 's' : ''}...`;
  }

  getEmptyStateText(): string {
    if (this.isLoading) {
      return 'Chargement des conversations...';
    }
    
    if (this.hasError) {
      return this.errorMessage;
    }
    
    if (this.searchQuery && this.filteredConversations.length === 0) {
      return `Aucun résultat pour "${this.searchQuery}"`;
    }
    
    if (this.conversations.length === 0) {
      return 'Aucune conversation. Créez-en une nouvelle !';
    }
    
    return 'Sélectionnez une conversation pour commencer';
  }

  shouldShowRetryButton(): boolean {
    return this.hasError && !this.isLoading;
  }

  shouldShowReconnectButton(): boolean {
    return this.connectionStatus === 'DISCONNECTED' || this.connectionStatus === 'ERROR';
  }

  getCreateButtonText(): string {
    if (!this.canCreateConversations()) {
      return 'Connexion requise';
    }
    return 'Nouvelle conversation';
  }

  hasActiveSearch(): boolean {
    return !!this.searchQuery && this.searchQuery.trim().length > 0;
  }

  clearSearch() {
    this.searchQuery = '';
    this.onSearchChange();
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'n') {
      event.preventDefault();
      if (this.canCreateConversations()) {
        this.onCreateConversation();
      }
    }
    
    if (event.key === 'Escape') {
      if (this.showNewConversationDialog) {
        this.showNewConversationDialog = false;
      }
    }
  }

  // ===== MÉTHODES DE DEBUG =====
  debugCurrentState() {
    console.log('🐛 DEBUG - Current state:', {
      isLoading: this.isLoading,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
      connectionStatus: this.connectionStatus,
      currentUserId: this.currentUserId,
      userRole: this.userRole,
      totalConversations: this.conversations.length,
      filteredConversations: this.filteredConversations.length,
      selectedConversation: this.selectedConversation?.id,
      searchQuery: this.searchQuery
    });
  }

  forceReload() {
    console.log('🔄 Force reload triggered');
    this.conversations = [];
    this.filteredConversations = [];
    this.selectedConversation = null;
    this.loadConversations();
  }
}