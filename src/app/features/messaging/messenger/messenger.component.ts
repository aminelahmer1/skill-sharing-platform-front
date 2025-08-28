// messenger.component.ts - VERSION AVEC DEBUG ET S
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, tap, distinctUntilChanged, interval } from 'rxjs';import { ConversationListComponent } from '../conversation-list/conversation-list.component';
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
  
  private conversationsCache: {
  data: Conversation[];
  timestamp: number;
  ttl: number;
} = {
  data: [],
  timestamp: 0,
  ttl: 30000 // 30 secondes
};

 private syncInterval?: any;
 // AJOUTER dans le constructor:
constructor(
  private messagingService: MessagingService,
  private keycloakService: KeycloakService,
  private cdr: ChangeDetectorRef 
) {
  console.log('🚀 MessengerComponent initializing...');
}

async ngOnInit() {
    console.log('🚀 MessengerComponent ngOnInit started');
    
    try {
        // IMPORTANT: Attendre que l'ID soit complètement résolu
        await this.loadUserInfo();
        
        // Vérifier que l'ID est bien défini
        if (!this.currentUserId) {
            console.error('❌ No user ID available after loading');
            this.hasError = true;
            this.errorMessage = 'Impossible de charger l\'identifiant utilisateur';
            return;
        }
        
        console.log('✅ User ID resolved:', this.currentUserId);
        
        // Maintenant charger les conversations
        this.setupSearch();
        this.loadConversations();
        this.subscribeToUpdates();
        this.subscribeToConnectionStatus();
         this.initializeReadStateManagement();
         this.startPeriodicSync();

        
        
        console.log('✅ MessengerComponent initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing MessengerComponent:', error);
        this.hasError = true;
        this.errorMessage = 'Erreur lors de l\'initialisation';
    }

    // ✅ FIXED: Properly typed event listener
    const handleNewConversation = (event: Event) => {
        const customEvent = event as CustomEvent<Conversation>;
        console.log('🆕 New conversation event received:', customEvent.detail);
        this.onNewConversationReceived(customEvent.detail);
    };

    window.addEventListener('newConversationAdded', (event: any) => {
    console.log('📬 New conversation added event:', event.detail);
    
    // Forcer la mise à jour de la vue
    this.cdr.detectChanges();
    
    // Optionnel: Sélectionner automatiquement la nouvelle conversation
    if (this.conversations.length === 1) {
      this.selectedConversation = event.detail;
    }
  });

   this.messagingService.enableRealTimeUpdates();
  
  // Écouter les changements de conversations avec détection automatique
  this.messagingService.conversations$.pipe(
    takeUntil(this.destroy$),
    distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
    tap(() => console.log('🔄 Conversations list updated'))
  ).subscribe(conversations => {
    this.conversations = conversations;
    this.applyCurrentFilter();
    this.cdr.detectChanges(); // Forcer la mise à jour de l'affichage
  });

}
private newConversationHandler?: (event: Event) => void;

private onNewConversationReceived(conversation: Conversation) {
  console.log('🆕 Processing new conversation in messenger:', conversation);
  
  // Vérifier si elle n'existe pas déjà localement
  const exists = this.conversations.find(c => c.id === conversation.id);
  
  if (!exists) {
    // Ajouter en début de liste
    this.conversations = [conversation, ...this.conversations];
    
    // Appliquer le filtre
    this.applyCurrentFilter();
    
    // Forcer la détection de changements
    this.cdr.detectChanges();
    
    // Notification visuelle
    this.showNotification(`Nouvelle conversation: ${conversation.name}`, 'info');
  }
}

// ✅ NOUVEAU: Méthode de notification améliorée
private showNotification(message: string, type: 'success' | 'info' | 'error' = 'info') {
  const notification = document.createElement('div');
  notification.textContent = message;
  
  const bgColor = type === 'success' ? '#28a745' : 
                  type === 'error' ? '#dc3545' : '#17a2b8';
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    z-index: 10001;
    font-weight: 500;
    animation: slideInRight 0.3s ease;
    max-width: 350px;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

  ngOnDestroy() {
     if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.destroy$.next();
    this.destroy$.complete();
    
    // ✅ FIXED: Proper event listener cleanup
    if (this.newConversationHandler) {
        window.removeEventListener('newConversationReceived', this.newConversationHandler);
    }
}
  // ===== CHARGEMENT UTILISATEUR =====
private async loadUserInfo() {
  console.log('👤 Loading user info...');
  
  try {
    // Attendre que le messaging service ait chargé l'ID
    await this.messagingService.syncUserId();
    
    // Récupérer l'ID du messaging service
    this.currentUserId = this.messagingService.getCurrentUserId();
    
    if (!this.currentUserId) {
      // Essayer de charger directement
      const profile = await this.keycloakService.getUserProfile();
      if (profile?.id) {
        const token = await this.keycloakService.getToken();
        if (token) {
          const realUserId = await this.fetchRealUserIdDirectly(profile.id, token);
          if (realUserId) {
            this.currentUserId = realUserId;
          }
        }
      }
    }
    
    if (!this.currentUserId) {
      throw new Error('Cannot load user ID');
    }
    
    const roles = this.keycloakService.getRoles();
    this.userRole = roles.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER';
    
    console.log('✅ User info loaded:', {
      userId: this.currentUserId,
      role: this.userRole
    });
    
  } catch (error) {
    console.error('❌ Error loading user info:', error);
    this.hasError = true;
    this.errorMessage = 'Impossible de charger l\'identifiant utilisateur';
  }
}

// AJOUTER cette méthode:
private async fetchRealUserIdDirectly(keycloakId: string, token: string): Promise<number | null> {
  try {
    const response = await fetch(
      `http://localhost:8822/api/v1/users/by-keycloak-id?keycloakId=${keycloakId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.id || null;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching user ID:', error);
    return null;
  }
}

// SUPPRIMER generateNumericIdFromUUID() et fetchRealUserIdFromAPI()

  // ✅ NOUVEAU: Récupérer l'ID réel depuis l'API utilisateur
  private async fetchRealUserIdFromAPI(keycloakId: string): Promise<number | null> {
    try {
      const token = await this.keycloakService.getToken();
      if (!token) return null;

      const response = await fetch(
        `http://localhost:8822/api/v1/users/by-keycloak-id?keycloakId=${keycloakId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const userData = await response.json();
        console.log('✅ Real user data from API:', userData);
        return userData.id || null;
      }

      console.warn('⚠️ User not found in API');
      return null;
    } catch (error) {
      console.error('❌ Error fetching real user ID from API:', error);
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

private loadConversations() {
  // Vérifier cache
  const now = Date.now();
  if (this.conversationsCache.data.length > 0 && 
      (now - this.conversationsCache.timestamp) < this.conversationsCache.ttl) {
    console.log('📋 Using cached conversations');
    this.conversations = this.conversationsCache.data;
    this.applyCurrentFilter();
    this.isLoading = false;
    return;
  }
  
  // Charger depuis API
  this.isLoading = true;
  this.messagingService.getUserConversations(0, 50)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (conversations) => {
        this.conversationsCache.data = conversations;
        this.conversationsCache.timestamp = now;
        
        this.conversations = conversations;
        this.applyCurrentFilter();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('❌ Error loading conversations:', error);
        this.isLoading = false;
        this.hasError = true;
        this.errorMessage = 'Erreur lors du chargement des conversations';
      }
    });
}

  // ✅ NOUVEAU: Méthode de diagnostic
  diagnoseUserIdIssue() {
    console.log('🔍 DIAGNOSTIC - User ID Issue:');
    console.log('- Current User ID:', this.currentUserId);
    console.log('- Messaging Service User ID:', this.messagingService.getCurrentUserId());
    
    this.keycloakService.getUserProfile().then(profile => {
      console.log('- Keycloak Profile:', profile);
      console.log('- Generated ID would be:', this.generateNumericIdFromUUID(profile?.id || ''));
    });
  }

  // ✅ NOUVEAU: Forcer la synchronisation des IDs
  async forceSyncUserIds() {
    console.log('🔄 Force syncing user IDs...');
    
    try {
      const realUserId = await this.messagingService.syncUserId();
      if (realUserId) {
        this.currentUserId = realUserId;
        console.log('✅ User ID synchronized:', this.currentUserId);
        this.loadConversations(); // Recharger les conversations
      }
    } catch (error) {
      console.error('❌ Error syncing user IDs:', error);
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
  this.subscribeToConversationsUpdates();
  this.subscribeToMessagesUpdates();
}
private subscribeToConversationsUpdates() {
  this.messagingService.conversations$
    .pipe(takeUntil(this.destroy$))
    .subscribe(conversations => {
      // ✅ Fusionner sans doublon
      const unique = new Map<number, Conversation>();
      for (const c of conversations) {
        unique.set(c.id, c);
      }
      this.conversations = Array.from(unique.values());
      this.applyCurrentFilter();
      this.cdr.detectChanges();
    });
}
private subscribeToMessagesUpdates() {
  this.messagingService.messages$
    .pipe(takeUntil(this.destroy$))
    .subscribe(allMessages => {
      this.updateConversationsWithLatestMessages(allMessages);
    });
}

private updateConversationsWithLatestMessages(allMessages: any[]) {
  const messageMap = new Map<number, any>();

  for (const msg of allMessages) {
    const existing = messageMap.get(msg.conversationId);
    if (!existing || new Date(msg.timestamp) > new Date(existing.timestamp)) {
      messageMap.set(msg.conversationId, msg);
    }
  }

  this.conversations = this.conversations.map(conv => {
    const latest = messageMap.get(conv.id);
    if (!latest) return conv;

    return {
      ...conv,
      lastMessage: latest.content || '',
      lastMessageTime: this.parseDateSafely(latest.timestamp),
      unreadCount: conv.unreadCount ?? 0
    };
  });

  this.applyCurrentFilter();
  this.cdr.detectChanges();
}

private parseDateSafely(dateInput: string | Date): Date {
  if (!dateInput) return new Date();
  const date = new Date(dateInput);
  return isNaN(date.getTime()) ? new Date() : date;
}
onConversationCreated(conversation: Conversation) {
  console.log('✅ New conversation created:', conversation);

  this.showNewConversationDialog = false;

  //  Toujours sélectionner la nouvelle conversation créée
  // Ne pas chercher de conversation existante car on vient de la créer
  
  // Vérifier si elle existe déjà dans la liste
  const existsInList = this.conversations.find(c => c.id === conversation.id);
  
  if (!existsInList) {
    // Ajouter la nouvelle conversation en tête de liste
    this.conversations = [conversation, ...this.conversations];
    this.applyCurrentFilter();
    console.log('📋 Nouvelle conversation ajoutée à la liste:', conversation.name);
  }

  // ✅ IMPORTANT: Toujours sélectionner la conversation qui vient d'être créée/retournée
  console.log('📌 Sélection de la conversation créée:', {
    id: conversation.id,
    name: conversation.name,
    type: conversation.type,
    skillId: conversation.skillId
  });
  
  this.selectedConversation = conversation;
  this.messagingService.setCurrentConversation(conversation);
  
  // Marquer comme lu immédiatement
  if (conversation.id) {
    this.messagingService.markAsRead(conversation.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => console.log('✅ Nouvelle conversation marquée comme lue'),
      error: (error) => console.warn('⚠️ Erreur marquage lecture:', error)
    });
  }

  this.cdr.detectChanges();
}









  // ===== HANDLERS D'ÉVÉNEMENTS =====
  onConversationSelect(conversation: Conversation) {
    console.log('📋 Selecting conversation:', conversation.id, conversation.name);
    this.selectedConversation = conversation;
    this.messagingService.setCurrentConversation(conversation);
    if (conversation.unreadCount > 0) {
      this.markConversationAsRead(conversation);
    }
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
 private markConversationAsRead(conversation: Conversation) {
    console.log(`📖 Marking conversation ${conversation.id} as read`);
    
    // Mise à jour optimiste
    const previousCount = conversation.unreadCount;
    conversation.unreadCount = 0;
    this.cdr.detectChanges();
    
    // Appel serveur
    this.messagingService.markAsRead(conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success !== false) {
            console.log('✅ Conversation marked as read successfully');
          } else {
            // Restaurer le compteur en cas d'échec
            conversation.unreadCount = previousCount;
            this.cdr.detectChanges();
          }
        },
        error: (error) => {
          console.error('❌ Failed to mark as read:', error);
          // Restaurer le compteur
          conversation.unreadCount = previousCount;
          this.cdr.detectChanges();
          
          // Réessayer après 2 secondes
          setTimeout(() => {
            this.markConversationAsRead(conversation);
          }, 2000);
        }
      });
  }
 forceSync() {
    console.log('🔄 Force sync triggered');
    this.syncAllReadStates();
    
    // Si une conversation est sélectionnée, forcer son rechargement
    if (this.selectedConversation) {
      this.messagingService.getUnreadCount(this.selectedConversation.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe(count => {
          if (this.selectedConversation) {
            this.selectedConversation.unreadCount = count;
            this.cdr.detectChanges();
          }
        });
    }
  }

  /**
   * ✅ NOUVEAU: Réinitialise tous les compteurs (pour debug)
   */
  resetAllUnreadCounts() {
    console.log('🔄 Resetting all unread counts');
    
    this.messagingService.forceRecalculateUnread()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Unread counts recalculated');
          this.syncAllReadStates();
        },
        error: (error) => {
          console.error('❌ Error recalculating:', error);
        }
      });
  }
  onCreateConversation() {
    console.log('➕ Opening new conversation dialog...');
    if (this.canCreateConversations()) {
      this.showNewConversationDialog = true;
    }
  }

/**
   * ✅ Obtient le nombre total de messages non lus
   */
  getTotalUnreadCount(): number {
    return this.conversations.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
  }

  /**
   * ✅ Vérifie si des messages non lus existent
   */
  hasUnreadMessages(): boolean {
    return this.getTotalUnreadCount() > 0;
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

   private initializeReadStateManagement() {
    console.log('🚀 Initializing read state management');
    
    // Synchroniser l'état au démarrage
    this.syncAllReadStates();
    
    // Écouter les changements de visibilité de la page
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Écouter le focus/blur de la fenêtre
    window.addEventListener('focus', this.handleWindowFocus.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));
    
    // S'abonner aux mises à jour en temps réel
    this.subscribeToReadStateUpdates();
  }

  /**
   * ✅ NOUVEAU: Synchronise tous les états de lecture
   */
  private syncAllReadStates() {
    console.log('🔄 Syncing all read states');
    
    // Récupérer tous les compteurs non lus
    this.messagingService.getAllUnreadCounts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (counts) => {
          // Mettre à jour chaque conversation
          this.conversations.forEach(conv => {
            const unreadCount = counts.get(conv.id) || 0;
            if (conv.unreadCount !== unreadCount) {
              conv.unreadCount = unreadCount;
              console.log(`Updated unread count for ${conv.id}: ${unreadCount}`);
            }
          });
          
          // Forcer la détection de changements
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error syncing read states:', error);
        }
      });
  }

  /**
   * ✅ NOUVEAU: Démarre la synchronisation périodique
   */
  private startPeriodicSync() {
    // Synchroniser toutes les 30 secondes
    this.syncInterval = interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (document.visibilityState === 'visible') {
          this.syncAllReadStates();
        }
      });
  }

  /**
   * ✅ NOUVEAU: S'abonne aux mises à jour d'état de lecture
   */
  private subscribeToReadStateUpdates() {
    // Écouter les mises à jour de compteurs non lus
    this.messagingService.unreadCounts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(counts => {
        let hasChanges = false;
        
        this.conversations.forEach(conv => {
          const newCount = counts.get(conv.id) || 0;
          if (conv.unreadCount !== newCount) {
            conv.unreadCount = newCount;
            hasChanges = true;
          }
        });
        
        if (hasChanges) {
          this.cdr.detectChanges();
        }
      });

    // Écouter les receipts de lecture
    this.messagingService.readReceipts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(receipts => {
        receipts.forEach(receipt => {
          const conv = this.conversations.find(c => c.id === receipt.conversationId);
          if (conv && receipt.userId === this.currentUserId) {
            conv.unreadCount = 0;
          }
        });
        
        this.cdr.detectChanges();
      });
  }

  /**
   * ✅ NOUVEAU: Gestion du changement de visibilité
   */
  private handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      console.log('📱 Page became visible, syncing read states');
      this.syncAllReadStates();
      
      // Si une conversation est sélectionnée, la marquer comme lue
      if (this.selectedConversation && this.selectedConversation.unreadCount > 0) {
        this.markConversationAsRead(this.selectedConversation);
      }
    }
  }

  /**
   * ✅ NOUVEAU: Gestion du focus de la fenêtre
   */
  private handleWindowFocus() {
    console.log('🔍 Window focused');
    
    // Synchroniser après un court délai
    setTimeout(() => {
      this.syncAllReadStates();
    }, 500);
  }

  /**
   * ✅ NOUVEAU: Gestion de la perte de focus
   */
  private handleWindowBlur() {
    console.log('👋 Window blurred');
    // Pas d'action particulière
  }

}