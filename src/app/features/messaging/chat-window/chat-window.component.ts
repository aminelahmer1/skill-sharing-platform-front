// chat-window.component.ts - VERSION DÉFINITIVE AVEC SCROLL INTELLIGENT
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
  NgZone
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
  private scrollThreshold = 150; // Distance du bas pour auto-scroll
  
  // Observables
  private destroy$ = new Subject<void>();
  private typingSubject = new Subject<void>();
  
  // Flags
  private isInitialized = false;
  private pendingScrollToBottom = false;

  constructor(
    private messagingService: MessagingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    console.log('🚀 ChatWindow initialized for conversation:', this.conversation?.id);
    this.setupTypingIndicator();
    this.subscribeToUpdates();
  }

  ngAfterViewInit() {
    this.isInitialized = true;
    this.initializeScrollListener();
    
    // Scroll initial après le rendu
    setTimeout(() => this.scrollToBottom(), 100);
  }

  ngAfterViewChecked() {
    // Auto-scroll si nécessaire après mise à jour du DOM
    if (this.pendingScrollToBottom) {
      this.pendingScrollToBottom = false;
      this.performScrollToBottom();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['conversation'] && this.conversation) {
      console.log('📋 Conversation changed:', this.conversation.id);
      this.resetAndLoadMessages();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========== GESTION DU SCROLL ==========

  private initializeScrollListener() {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    
    // Écouter les événements de scroll
    container.addEventListener('scroll', () => {
      this.ngZone.runOutsideAngular(() => {
        this.handleScroll();
      });
    });
  }

  private handleScroll() {
    if (!this.scrollContainer) return;

    const container = this.scrollContainer.nativeElement;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Distance du bas
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom <= this.scrollThreshold;
    
    // Détection du scroll utilisateur
    this.isUserScrolling = true;
    clearTimeout((this as any).scrollTimeout);
    (this as any).scrollTimeout = setTimeout(() => {
      this.isUserScrolling = false;
    }, 200);

    // Mise à jour du bouton "scroll to bottom"
    this.ngZone.run(() => {
      this.showScrollToBottomButton = !isNearBottom && this.messages.length > 5;
      
      // Auto-scroll si près du bas
      this.shouldAutoScroll = isNearBottom;
    });

    // Charger plus si en haut
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

    // Sauvegarder la hauteur avant chargement (pour "load more")
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
          // Première page : remplacer les messages
          this.messages = newMessages || [];
          this.lastMessageCount = this.messages.length;
          
          // Scroll au bas après le rendu
          this.pendingScrollToBottom = true;
        } else {
          // Pages suivantes : ajouter au début
          this.messages = [...(newMessages || []), ...this.messages];
          
          // Maintenir la position de scroll
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

  // ========== SOUSCRIPTIONS AUX MISES À JOUR ==========

  private subscribeToUpdates() {
    // Nouveaux messages en temps réel
    this.messagingService.messages$
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged((prev, curr) => prev.length === curr.length)
      )
      .subscribe(allMessages => {
        if (!this.conversation) return;
        
        const conversationMessages = allMessages.filter(
          m => m.conversationId === this.conversation.id
        );
        
        const newCount = conversationMessages.length;
        if (newCount > this.lastMessageCount) {
          const newMessages = conversationMessages.slice(this.lastMessageCount);
          
          // Ajouter les nouveaux messages
          this.messages = [...this.messages, ...newMessages];
          this.lastMessageCount = newCount;
          
          // Décider si on doit auto-scroll
          const lastMessage = newMessages[newMessages.length - 1];
          const isOwnMessage = lastMessage.senderId === this.currentUserId;
          
          if (isOwnMessage || this.shouldAutoScroll) {
            this.pendingScrollToBottom = true;
          } else {
            this.showScrollToBottomButton = true;
          }
          
          this.cdr.detectChanges();
        }
      });

    // Indicateurs de frappe
    this.messagingService.typingIndicators$
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicators => {
        if (!this.conversation) return;
        
        this.typingUsers = indicators.filter(i => 
          i.conversationId === this.conversation.id && 
          i.userId !== this.currentUserId
        );
        
        // Auto-scroll si quelqu'un tape et on est près du bas
        if (this.typingUsers.length > 0 && this.shouldAutoScroll) {
          this.pendingScrollToBottom = true;
        }
        
        this.cdr.detectChanges();
      });
  }

  // ========== GESTION DE LA FRAPPE ==========

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

    // Arrêter après 2 secondes d'inactivité
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

  onTyping() {
    this.typingSubject.next();
  }

  // ========== ENVOI DE MESSAGES ==========

  onSendMessage(content: string) {
    if (!content.trim() || !this.conversation) return;

    const request: MessageRequest = {
      conversationId: this.conversation.id,
      content: content.trim(),
      type: 'TEXT'
    };

    // Force scroll au bas quand on envoie
    this.shouldAutoScroll = true;
    this.pendingScrollToBottom = true;
    this.showScrollToBottomButton = false;

    this.messagingService.sendMessage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (message) => {
          console.log('✅ Message sent:', message.id);
        },
        error: (error) => {
          console.error('❌ Error sending message:', error);
          this.showErrorNotification('Erreur lors de l\'envoi du message');
        }
      });
  }

  onFileSelect(file: File) {
    if (!this.conversation) return;

    // Validation du fichier
    if (file.size > 10 * 1024 * 1024) {
      this.showErrorNotification('Fichier trop volumineux (max 10MB)');
      return;
    }

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
          
          this.shouldAutoScroll = true;
          this.pendingScrollToBottom = true;
          
          this.messagingService.sendMessage(request)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => console.log('✅ File sent'),
              error: () => this.showErrorNotification('Erreur envoi fichier')
            });
        },
        error: () => this.showErrorNotification('Erreur upload fichier')
      });
  }

  // ========== MÉTHODES UTILITAIRES ==========

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

  private getFileType(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('video/')) return 'VIDEO';
    if (file.type.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
  }

  private getErrorMessage(error: any): string {
    if (error.status === 403) return 'Accès refusé';
    if (error.status === 404) return 'Conversation introuvable';
    if (error.status === 503) return 'Service indisponible';
    return 'Erreur de chargement';
  }

  private showErrorNotification(message: string) {
    // Utiliser un service de notification ou créer un toast
    console.error('🔴 Error:', message);
    
    // Notification temporaire DOM
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

  // ========== ACTIONS SUR LES MESSAGES ==========

  onEditMessage(message: Message) {
    if (message.senderId !== this.currentUserId) return;
    
    // TODO: Implémenter édition via dialog modal
    console.log('Edit message:', message.id);
  }

  onDeleteMessage(message: Message) {
    if (message.senderId !== this.currentUserId) return;
    
    if (confirm('Supprimer ce message ?') && message.id) {
      // TODO: Implémenter suppression
      console.log('Delete message:', message.id);
    }
  }

  onRetry() {
    this.resetAndLoadMessages();
  }
}