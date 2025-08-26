// messenger.component.ts - VERSION AVEC DEBUG ET S
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, tap, distinctUntilChanged } from 'rxjs';import { ConversationListComponent } from '../conversation-list/conversation-list.component';
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


 // AJOUTER dans le constructor:
constructor(
  private messagingService: MessagingService,
  private keycloakService: KeycloakService,
  private cdr: ChangeDetectorRef // ✅ Ajouter ChangeDetectorRef
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

  // REMPLACER subscribeToUpdates():
private subscribeToUpdates() {
  this.messagingService.conversations$
    .pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged((prev, curr) => {
        // Comparer par longueur ET contenu
        if (prev.length !== curr.length) return false;
        
        const prevIds = prev.map(c => c.id).sort().join(',');
        const currIds = curr.map(c => c.id).sort().join(',');
        return prevIds === currIds;
      })
    )
    .subscribe(conversations => {
      console.log('🔄 Conversations updated:', conversations.length);
      
      this.conversations = conversations;
      this.applyCurrentFilter();
      
      // ✅ IMPORTANT: Forcer Angular à détecter les changements
      this.cdr.detectChanges();
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

  // REMPLACER onConversationCreated():
onConversationCreated(conversation: Conversation) {
  console.log('✅ New conversation created:', conversation);
  this.showNewConversationDialog = false;
  
  // ✅ S'assurer que la conversation est ajoutée localement immédiatement
  const existingIndex = this.conversations.findIndex(c => c.id === conversation.id);
  
  if (existingIndex === -1) {
    // Ajouter en début de liste
    this.conversations = [conversation, ...this.conversations];
    console.log('📋 Added new conversation to local list');
  } else {
    // Si elle existe déjà, la mettre à jour
    this.conversations[existingIndex] = conversation;
    console.log('📋 Updated existing conversation in local list');
  }
  
  // ✅ Appliquer le filtre pour mettre à jour la vue
  this.applyCurrentFilter();
  
  // ✅ Sélectionner automatiquement la nouvelle conversation
  this.selectedConversation = conversation;
  this.messagingService.setCurrentConversation(conversation);
  
  // ✅ Forcer la détection de changements
  this.cdr.detectChanges();
  
  // Notification de succès
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