// chat-window.component.ts - CORRECTION DU PROBLÈME DE PREMIER MESSAGE DOUBLE

import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy, 
  ViewChild, 
  ElementRef, 
  AfterViewInit,
  AfterViewChecked,
  OnChanges, 
  SimpleChanges,
  ChangeDetectorRef,
  NgZone,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ConversationHeaderComponent } from '../conversation-header/conversation-header.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { MessageInputComponent } from '../message-input/message-input.component';
import { 
  MessagingService, 
  Conversation, 
  Message, 
  MessageRequest, 
  TypingIndicator 
} from '../../../core/services/messaging/messaging.service';

interface ExtendedMessage extends Message {
  isOptimistic?: boolean;
}

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConversationHeaderComponent,
    MessageBubbleComponent,
    MessageInputComponent
  ],
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.css']
})

export class ChatWindowComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked, OnChanges {
  @Input() conversation!: Conversation;
  @Input() currentUserId!: number;
  @ViewChild('scrollContainer', { static: false }) private scrollContainer!: ElementRef<HTMLDivElement>;

  // ===== CORRECTION: Amélioration de la déduplication =====
  private isProcessingOwnMessage = false;
  private lastProcessedMessageId: number | null = null;
  private processedMessageIds = new Set<number>();
  
  // NOUVEAU: Système de hachage pour détecter les doublons par contenu
  private messageContentHashes = new Set<string>();
  
  // NOUVEAU: Timer pour nettoyer les anciens hachages
  private cleanupTimer?: any;

  // État des messages
  messages: Message[] = [];
  typingUsers: TypingIndicator[] = [];
  
  // États de chargement
  isLoading = true;
  isLoadingMore = false;
  hasError = false;
  errorMessage = '';
  
  // Pagination
  currentPage = 0;
  pageSize = 50;
  hasMoreMessages = true;
  
  // Contrôle du scroll
  showScrollToBottomButton = false;
  private shouldAutoScroll = true;
  private isUserScrolling = false;
  private lastScrollHeight = 0;
  private lastMessageCount = 0;
  private scrollThreshold = 150;
  
  // Observables
  private typingSubject = new Subject<void>();
   private destroy$ = new Subject<void>();
  private markAsReadSubject = new Subject<void>();
  private hasMarkedAsRead = false;
  private lastMarkAsReadTime = 0;
  
  // Flags
  private isInitialized = false;
  private pendingScrollToBottom = false;

  private isConversationActive = false;
  private autoReadEnabled = true;

  constructor(
    private messagingService: MessagingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    console.log('🚀 ChatWindow initialized for conversation:', this.conversation?.id);
    this.setupTypingIndicator();
    this.subscribeToUpdates();
    this.startCleanupTimer();
      this.setupAutoRead();
    this.notifyConversationActive(true);
    this.subscribeToReadReceipts();
  }

  ngAfterViewInit() {
    this.isInitialized = true;
    this.initializeScrollListener();
    setTimeout(() => this.scrollToBottom(), 100);
    
    // Marquer comme lu après l'affichage
    if (this.conversation) {
      this.markAllAsReadOnActivity();
    }
  }

  ngAfterViewChecked() {
    if (this.pendingScrollToBottom) {
      this.pendingScrollToBottom = false;
      this.performScrollToBottom();
    }
  }
  

  ngOnChanges(changes: SimpleChanges) {
    if (changes['conversation'] && this.conversation) {
      console.log('Conversation changed:', this.conversation.id);
      this.resetForNewConversation();
      this.resetAndLoadMessages();
      this.notifyConversationActive(true);
    }
  }

  private resetForNewConversation() {
    this.isProcessingOwnMessage = false;
    this.lastProcessedMessageId = null;
    this.processedMessageIds.clear();
    this.messageContentHashes.clear(); 
    this.messages = [];
    this.lastMessageCount = 0;
    console.log('🔄 Chat window reset for new conversation');
  }

  ngOnDestroy() {
    this.notifyConversationActive(false);
    this.destroy$.next();
    this.destroy$.complete();
    
    // NOUVEAU: Nettoyer le timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
// Remplacer la méthode notifyConversationActive dans chat-window.component.ts

private notifyConversationActive(active: boolean) {
    if (!this.conversation) return;
    
    this.isConversationActive = active;
    
    // Utiliser MessagingService pour envoyer le message via WebSocket
    // au lieu d'accéder directement à stompClient qui n'existe pas
    if (this.messagingService) {
        // Envoyer le statut actif/inactif au backend
        this.messagingService.sendConversationActiveStatus(
            this.conversation.id, 
            active
        );
        
        console.log(`Conversation ${this.conversation.id} is now ${active ? 'active' : 'inactive'}`);
        
        // Si on active la conversation et qu'il y a des messages non lus, les marquer comme lus
        if (active && this.conversation.unreadCount > 0) {
            this.markAllAsReadOnActivity();
        }
    }
}
  // ===== NOUVEAU: Système de nettoyage automatique =====
  private startCleanupTimer() {
    // Nettoyer les hachages anciens toutes les 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldHashes();
    }, 5 * 60 * 1000);
  }

  private cleanupOldHashes() {
    // Conserver uniquement les hachages des 100 derniers messages
    if (this.messages.length > 100) {
      this.messageContentHashes.clear();
      
      // Reconstruire avec les messages actuels
      this.messages.slice(-100).forEach(msg => {
        const hash = this.createMessageHash(msg);
        this.messageContentHashes.add(hash);
      });
    }
  }

  // ===== CORRECTION: Fonction de hachage améliorée =====
  private createMessageHash(message: Message): string {
    // Créer un hash unique basé sur le contenu, l'expéditeur, et le timestamp arrondi
    const roundedTimestamp = Math.floor(new Date(message.sentAt).getTime() / 1000) * 1000;
    const contentKey = `${message.conversationId}_${message.senderId}_${message.content.trim()}_${roundedTimestamp}`;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < contentKey.length; i++) {
      const char = contentKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString();
  }
private setupAutoRead() {
    // Écouter les nouveaux messages
    this.messagingService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        if (!this.conversation || !this.isConversationActive) return;
        
        // Filtrer les messages de cette conversation
        const conversationMessages = messages.filter(m => 
          m.conversationId === this.conversation.id
        );
        
        // Pour chaque nouveau message qui n'est pas de nous
        conversationMessages.forEach(msg => {
          if (msg.senderId !== this.currentUserId && msg.status !== 'READ') {
            // Si la conversation est active, marquer comme lu immédiatement
            this.autoMarkAsRead(msg);
          }
        });
      });
  }

  /**
   * CORRECTION: Marquer automatiquement comme lu
   */
  private autoMarkAsRead(message: Message) {
    if (!this.autoReadEnabled || !this.isConversationActive) return;
    
    console.log(`Auto-marking message ${message.id} as read`);
    
    // Mise à jour locale immédiate
    message.status = 'READ';
    
    // Appel serveur
    this.messagingService.markAsRead(this.conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => console.log('✅ Auto-marked as read'),
        error: (err) => console.warn('⚠️ Auto-mark failed:', err)
      });
  }

  /**
   * CORRECTION: Quand l'utilisateur tape, marquer comme lu
   */
  onTyping() {
    this.typingSubject.next();
    
    // NOUVEAU: Si on tape, on est actif donc marquer tout comme lu
    if (this.conversation && this.conversation.unreadCount > 0) {
      this.markAllAsReadOnActivity();
    }
  }

  /**
   * CORRECTION: Marquer comme lu sur activité utilisateur
   */
  private markAllAsReadOnActivity() {
    if (!this.conversation || this.conversation.unreadCount === 0) return;
    
    console.log('📖 Marking as read on user activity');
    
    // Mise à jour locale
    this.conversation.unreadCount = 0;
    
    // Mise à jour serveur
    this.messagingService.markAsRead(this.conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  // ===== CORRECTION: Fonction de déduplication robuste =====
  private isDuplicateMessage(newMessage: Message): boolean {
    // 1. Vérifier par ID exact
    if (newMessage.id && this.processedMessageIds.has(newMessage.id)) {
      console.log('🔍 Message déjà traité (ID):', newMessage.id);
      return true;
    }

    // 2. Vérifier par ID dans les messages existants
    const existsById = this.messages.find(msg => msg.id === newMessage.id);
    if (existsById) {
      console.log('🔍 Message existe déjà (ID):', newMessage.id);
      return true;
    }

    // 3. CORRECTION: Vérification par contenu avec hash
    const messageHash = this.createMessageHash(newMessage);
    if (this.messageContentHashes.has(messageHash)) {
      console.log('🔍 Message duplicat détecté (hash):', messageHash);
      return true;
    }

    // 4. Vérification de sécurité par contenu exact
    const duplicateByContent = this.messages.find(existing => {
      if (existing.conversationId === newMessage.conversationId &&
          existing.senderId === newMessage.senderId &&
          existing.content.trim() === newMessage.content.trim()) {
        
        const timeDiff = Math.abs(
          new Date(existing.sentAt).getTime() - new Date(newMessage.sentAt).getTime()
        );
        
        // CORRECTION: Réduire la fenêtre de temps pour être plus strict
        return timeDiff < 2000; // 2 secondes au lieu de 5
      }
      return false;
    });

    if (duplicateByContent) {
      console.log('🔍 Message duplicat par contenu:', newMessage.content.substring(0, 50));
      return true;
    }

    return false;
  }

  // ===== CORRECTION: Ajout de message sécurisé =====
  private addMessageSecurely(message: Message): boolean {
    if (this.isDuplicateMessage(message)) {
      return false;
    }

    // Ajouter le message
    this.messages.push(message);
    
    // Marquer comme traité
    if (message.id) {
      this.processedMessageIds.add(message.id);
    }
    
    // Ajouter le hash
    const messageHash = this.createMessageHash(message);
    this.messageContentHashes.add(messageHash);
    
    console.log('✅ Message ajouté:', message.id, message.content.substring(0, 50));
    return true;
  }

  // ========== GESTION DU SCROLL (inchangé) ==========
  
  private initializeScrollListener() {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    
    container.addEventListener('scroll', () => {
      this.ngZone.runOutsideAngular(() => {
        this.handleScroll();
      });
    });
  }

  private handleScroll() {
    if (!this.scrollContainer) return;

    // Si on scrolle, on est actif
    if (this.isConversationActive && this.conversation?.unreadCount > 0) {
      this.markAllAsReadOnActivity();
    }
    const container = this.scrollContainer.nativeElement;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom <= this.scrollThreshold;
    
    this.isUserScrolling = true;
    clearTimeout((this as any).scrollTimeout);
    (this as any).scrollTimeout = setTimeout(() => {
      this.isUserScrolling = false;
    }, 200);

    this.ngZone.run(() => {
      this.showScrollToBottomButton = !isNearBottom && this.messages.length > 5;
      this.shouldAutoScroll = isNearBottom;
    });

    if (scrollTop < 100 && this.hasMoreMessages && !this.isLoadingMore) {
      this.loadMoreMessages();
    }
  }

  scrollToBottom(): void {
    if (!this.scrollContainer) {
      this.pendingScrollToBottom = true;
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.performScrollToBottom();
      });
    });
  }

  private performScrollToBottom(): void {
    if (!this.scrollContainer) return;
    
    const container = this.scrollContainer.nativeElement;
    container.scrollTop = container.scrollHeight;
    
    this.showScrollToBottomButton = false;
    this.shouldAutoScroll = true;
  }

  private maintainScrollPosition(): void {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    const newScrollHeight = container.scrollHeight;
    const heightDifference = newScrollHeight - this.lastScrollHeight;
    
    if (heightDifference > 0) {
      container.scrollTop += heightDifference;
    }
    
    this.lastScrollHeight = newScrollHeight;
  }

  // ========== CHARGEMENT DES MESSAGES ==========

  private resetAndLoadMessages() {
    this.messages = [];
    this.currentPage = 0;
    this.hasMoreMessages = true;
    this.isLoading = true;
    this.hasError = false;
    this.lastMessageCount = 0;
    this.shouldAutoScroll = true;
    
    this.loadMessages();
  }

  private loadMessages() {
    if (!this.conversation) {
      console.error('❌ No conversation to load messages for');
      return;
    }

    if (this.currentPage > 0 && this.scrollContainer) {
      this.lastScrollHeight = this.scrollContainer.nativeElement.scrollHeight;
    }

    this.isLoading = this.currentPage === 0;
    this.isLoadingMore = this.currentPage > 0;

    console.log(`📥 Loading messages - Page ${this.currentPage}`);

    this.messagingService.getConversationMessages(
      this.conversation.id, 
      this.currentPage, 
      this.pageSize
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (newMessages) => {
        console.log(`✅ Loaded ${newMessages.length} messages`);
        
        if (this.currentPage === 0) {
          // CORRECTION: Reconstruction complète avec déduplication
          this.messages = [];
          this.messageContentHashes.clear();
          this.processedMessageIds.clear();
          
          newMessages.forEach(msg => this.addMessageSecurely(msg));
          this.lastMessageCount = this.messages.length;
          this.pendingScrollToBottom = true;
        } else {
          // Pages suivantes : ajouter au début
          const oldLength = this.messages.length;
          newMessages.forEach(msg => {
            if (!this.isDuplicateMessage(msg)) {
              this.messages.unshift(msg);
              if (msg.id) this.processedMessageIds.add(msg.id);
              this.messageContentHashes.add(this.createMessageHash(msg));
            }
          });
          
          // Trier si nécessaire
          this.messages.sort((a, b) => 
            new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
          
          this.cdr.detectChanges();
          this.maintainScrollPosition();
        }
        
        this.hasMoreMessages = newMessages.length === this.pageSize;
        this.isLoading = false;
        this.isLoadingMore = false;
        
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error loading messages:', error);
        this.isLoading = false;
        this.isLoadingMore = false;
        this.hasError = true;
        this.errorMessage = this.getErrorMessage(error);
      }
    });
  }

  loadMoreMessages() {
    if (this.isLoadingMore || !this.hasMoreMessages) return;
    
    console.log('📄 Loading more messages...');
    this.currentPage++;
    this.loadMessages();
  }

  // ===== CORRECTION: Souscription aux mises à jour =====

  private subscribeToUpdates() {
    this.messagingService.messages$
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged((prev, curr) => prev.length === curr.length)
      )
      .subscribe(allMessages => {
        if (!this.conversation) return;
        
        console.log('🔄 Messages update received:', allMessages.length);
        
        const conversationMessages = allMessages.filter(
          m => m.conversationId === this.conversation.id
        );
        
        // CORRECTION: Traitement intelligent des nouveaux messages
        let hasNewMessages = false;
        let shouldAutoScroll = false;
        
        conversationMessages.forEach(msg => {
          // Ignorer nos propres messages en cours de traitement
          if (this.isProcessingOwnMessage && msg.senderId === this.currentUserId) {
            console.log('⏸️ Ignoring own message being processed');
            return;
          }
          
          // Tenter d'ajouter le message
          const wasAdded = this.addMessageSecurely(msg);
          if (wasAdded) {
            hasNewMessages = true;
            
            // Auto-scroll uniquement pour les messages d'autrui
            if (msg.senderId !== this.currentUserId && this.shouldAutoScroll) {
              shouldAutoScroll = true;
            }
          }
        });
        
        if (hasNewMessages) {
          // Trier les messages par date
          this.messages.sort((a, b) => 
            new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
          
          this.lastMessageCount = this.messages.length;
          
          if (shouldAutoScroll) {
            this.pendingScrollToBottom = true;
          }
          
          console.log('✅ Messages updated:', this.messages.length);
          this.cdr.detectChanges();
        }
      });

    // Indicateurs de frappe (inchangé)
    this.messagingService.typingIndicators$
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicators => {
        if (!this.conversation) return;
        
        this.typingUsers = indicators.filter(i => 
          i.conversationId === this.conversation.id && 
          i.userId !== this.currentUserId
        );
        
        if (this.typingUsers.length > 0 && this.shouldAutoScroll) {
          this.pendingScrollToBottom = true;
        }
        
        this.cdr.detectChanges();
      });
  }

  // ========== GESTION DE LA FRAPPE (inchangé) ==========

  private setupTypingIndicator() {
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300)
      )
      .subscribe(() => {
        if (this.conversation) {
          this.messagingService.sendTypingIndicator(this.conversation.id, true);
        }
      });

    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(2000)
      )
      .subscribe(() => {
        if (this.conversation) {
          this.messagingService.sendTypingIndicator(this.conversation.id, false);
        }
      });
  }

 

  // ===== CORRECTION: Envoi de messages =====

 

  trackByMessageId(index: number, message: Message): number {
    return message.id || index;
  }

  canSendMessages(): boolean {
    return this.conversation?.status === 'ACTIVE' && 
           this.conversation?.canSendMessage !== false;
  }

  getDisabledInputText(): string {
    if (this.conversation?.status !== 'ACTIVE') {
      return `Conversation ${this.conversation?.status === 'ARCHIVED' ? 'archivée' : 'terminée'}`;
    }
    return 'Permission refusée';
  }

  getEmptyStateText(): string {
    if (!this.canSendMessages()) {
      return this.getDisabledInputText();
    }
    return 'Envoyez le premier message !';
  }

  getTypingText(): string {
    const count = this.typingUsers.length;
    if (count === 0) return '';
    if (count === 1) return `${this.typingUsers[0].userName} écrit...`;
    if (count === 2) {
      return `${this.typingUsers[0].userName} et ${this.typingUsers[1].userName} écrivent...`;
    }
    return `${count} personnes écrivent...`;
  }

  shouldShowDateSeparator(current: Message, previous?: Message): boolean {
    if (!previous) return true;
    
    const currentDate = new Date(current.sentAt).toDateString();
    const previousDate = new Date(previous.sentAt).toDateString();
    
    return currentDate !== previousDate;
  }

  formatDateSeparator(date: Date): string {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Aujourd\'hui';
    }
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    }
    
    return messageDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }


  private getErrorMessage(error: any): string {
    if (error.status === 403) return 'Accès refusé';
    if (error.status === 404) return 'Conversation introuvable';
    if (error.status === 503) return 'Service indisponible';
    return 'Erreur de chargement';
  }

 

  onEditMessage(message: Message) {
    if (message.senderId !== this.currentUserId) return;
    console.log('Edit message:', message.id);
  }

  onDeleteMessage(message: Message) {
    if (message.senderId !== this.currentUserId) return;
    
    if (confirm('Supprimer ce message ?') && message.id) {
      console.log('Delete message:', message.id);
    }
  }

  onRetry() {
    this.resetAndLoadMessages();
  }private performMarkAsRead() {
    if (!this.conversation || this.hasMarkedAsRead) {
      return;
    }

    console.log(`📖 Marking conversation ${this.conversation.id} as read`);
    
    this.lastMarkAsReadTime = Date.now();
    
    this.messagingService.markAsRead(this.conversation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success !== false) {
            console.log('✅ Conversation marked as read');
            this.hasMarkedAsRead = true;
            
            // Mettre à jour le compteur local
            if (this.conversation) {
              this.conversation.unreadCount = 0;
            }
            
            // Émettre un événement pour mettre à jour la liste
            this.emitConversationRead();
          }
        },
        error: (error) => {
          console.warn('⚠️ Could not mark as read:', error);
          // Réessayer après 3 secondes
          setTimeout(() => {
            this.hasMarkedAsRead = false;
            this.triggerMarkAsRead();
          }, 3000);
        }
      });
  }
  private emitConversationRead() {
    window.dispatchEvent(new CustomEvent('conversationRead', {
      detail: {
        conversationId: this.conversation.id,
        timestamp: new Date()
      }
    }));
  }
private triggerMarkAsRead() {
    // Éviter les marquages répétés trop rapides
    const now = Date.now();
    if (now - this.lastMarkAsReadTime < 5000) { // 5 secondes minimum entre les marquages
      return;
    }
    
    this.markAsReadSubject.next();
  }
  /**
   * ✅ NOUVEAU: Écoute les receipts de lecture
   */
   private subscribeToReadReceipts() {
    // Écouter les notifications de lecture via le service
    this.messagingService.readReceipts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(receipts => {
        receipts.forEach(receipt => {
          if (receipt.conversationId === this.conversation?.id) {
            this.updateMessageReadStatus(receipt);
          }
        });
      });

    // Écouter aussi directement les topics WebSocket si disponible
    this.subscribeToWebSocketReadReceipts();
  }
private subscribeToWebSocketReadReceipts() {
    // Utiliser le service messaging pour accéder au client STOMP
    const stompConnection = (this.messagingService as any).stompClient;
    if (!stompConnection || !stompConnection.connected) {
      // Réessayer après connexion
      setTimeout(() => this.subscribeToWebSocketReadReceipts(), 1000);
      return;
    }

    // S'abonner au topic de lecture de cette conversation
    stompConnection.subscribe(`/topic/conversation/${this.conversation.id}/read`, (message: any) => {
      const readData = JSON.parse(message.body);
      console.log('✅ Read receipt received:', readData);
      this.handleReadReceipt(readData);
    });
  }
private handleReadReceipt(readData: any) {
    this.ngZone.run(() => {
      // Mettre à jour le statut des messages
      this.messages.forEach(msg => {
        // Si c'est un de nos messages et qu'il a été lu par quelqu'un d'autre
        if (msg.senderId === this.currentUserId && 
            readData.userId !== this.currentUserId) {
          
          // Passer de SENT à READ (✓ vers ✓✓)
          if (msg.status !== 'READ') {
            msg.status = 'READ';
            msg.readAt = new Date();
            console.log(`Message ${msg.id} marked as READ ✓✓`);
          }
        }
      });
      
      // Forcer la mise à jour de l'affichage
      this.cdr.detectChanges();
    });
  }
private updateMessageReadStatus(receipt: any) {
    const message = this.messages.find(m => m.id === receipt.messageId);
    if (message && message.senderId === this.currentUserId) {
      message.status = 'READ';
      message.readAt = receipt.timestamp || new Date();
      this.cdr.detectChanges();
    }
  }

  /**
   * ✅ NOUVEAU: Met à jour le statut de lecture des messages
   */
  private updateMessagesReadStatus(receipt: any) {
    if (receipt.readByUserId === this.currentUserId) {
      // Marquer tous les messages comme lus visuellement
      this.messages.forEach(msg => {
        if (msg.senderId !== this.currentUserId && msg.status !== 'READ') {
          msg.status = 'READ';
        }
      });
    }
  }
onVoiceMessageReceived(audioFile: File) {
    console.log('🎵 Message vocal reçu du MessageInput:', audioFile);
    
    // Afficher un indicateur de chargement si nécessaire
    this.showUploadingIndicator(true, 'Envoi du message vocal...');
    
    // Uploader le fichier audio d'abord
    this.messagingService.uploadFile(audioFile).subscribe({
      next: (uploadUrl) => {
        console.log('✅ Fichier vocal uploadé:', uploadUrl);
        
        // Créer le message vocal avec métadonnées
        const duration = (audioFile as any).durationText || 'Message vocal';
        const messageRequest: MessageRequest = {
          conversationId: this.conversation.id,
          content: `Message vocal (${duration})`,
          type: 'AUDIO',
          attachmentUrl: uploadUrl
        };
        
        // Envoyer le message vocal
        this.messagingService.sendMessage(messageRequest).subscribe({
          next: (message) => {
            console.log('✅ Message vocal envoyé avec succès:', message.id);
            this.hideUploadingIndicator();
            
            // Le message sera automatiquement ajouté via WebSocket
            // Pas besoin de l'ajouter manuellement pour éviter les doublons
            
            // Scroll automatique vers le bas
            this.pendingScrollToBottom = true;
          },
          error: (error) => {
            console.error('❌ Erreur envoi message vocal:', error);
            this.hideUploadingIndicator();
            this.showErrorNotification('Erreur lors de l\'envoi du message vocal');
          }
        });
      },
      error: (error) => {
        console.error('❌ Erreur upload fichier vocal:', error);
        this.hideUploadingIndicator();
        this.showErrorNotification('Erreur lors de l\'upload du fichier vocal');
      }
    });
  }
  
  // ========== MÉTHODES D'INTERFACE UTILISATEUR ==========
  
  private showUploadingIndicator(show: boolean, message?: string) {
    // Implémentez votre logique d'indicateur de chargement
    // Par exemple, afficher un spinner dans l'interface
    if (show) {
      console.log('⏳', message || 'Upload en cours...');
      // Vous pouvez ajouter un état isUploading = true
      // et afficher un spinner dans le template
    } else {
      console.log('✅ Upload terminé');
      // isUploading = false
    }
  }
  
  private hideUploadingIndicator() {
    this.showUploadingIndicator(false);
  }
  
  private showErrorNotification(message: string) {
    // Réutilisez votre méthode existante ou créez-en une nouvelle
    console.error('🔴 Erreur:', message);
    
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #dc3545;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }
  
  // ========== GESTIONNAIRES EXISTANTS (MODIFIÉS) ==========
  
  onSendMessage(content: string) {
    // Votre logique existante pour les messages texte
    if (!content.trim() || !this.conversation) return;

    const request: MessageRequest = {
      conversationId: this.conversation.id,
      content: content.trim(),
      type: 'TEXT'
    };

    console.log('📤 Sending text message:', content.substring(0, 50));

    this.messagingService.sendMessage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (message) => {
          console.log('✅ Text message sent successfully:', message.id);
          // Le reste de votre logique existante...
        },
        error: (error) => {
          console.error('❌ Error sending text message:', error);
          this.showErrorNotification('Erreur lors de l\'envoi du message');
        }
      });
  }
  
  onFileSelect(file: File) {
    // Votre logique existante pour les fichiers
    if (!this.conversation) return;

    if (file.size > 10 * 1024 * 1024) {
      this.showErrorNotification('Fichier trop volumineux (max 10MB)');
      return;
    }

    this.showUploadingIndicator(true, 'Upload du fichier...');

    this.messagingService.uploadFile(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (url) => {
          const request: MessageRequest = {
            conversationId: this.conversation.id,
            content: file.name,
            type: this.getFileType(file),
            attachmentUrl: url
          };
          
          this.messagingService.sendMessage(request)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                console.log('✅ File sent successfully');
                this.hideUploadingIndicator();
                this.pendingScrollToBottom = true;
              },
              error: () => {
                this.hideUploadingIndicator();
                this.showErrorNotification('Erreur envoi fichier');
              }
            });
        },
        error: () => {
          this.hideUploadingIndicator();
          this.showErrorNotification('Erreur upload fichier');
        }
      });
  }
  
  private getFileType(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('video/')) return 'VIDEO';
    if (file.type.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
  }
  @HostListener('window:focus')
  onWindowFocus() {
    this.isConversationActive = true;
    this.notifyConversationActive(true);
    
    if (this.conversation && this.conversation.unreadCount > 0) {
      this.markAllAsReadOnActivity();
    }
  }

  @HostListener('window:blur')
  onWindowBlur() {
    this.isConversationActive = false;
    this.notifyConversationActive(false);
  }

  @HostListener('click')
  onConversationClick() {
    if (this.conversation?.unreadCount > 0) {
      this.markAllAsReadOnActivity();
    }
  }
}