// chat-window.component.ts - VERSION COMPLÈTEMENT CORRIGÉE
import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ConversationHeaderComponent } from '../conversation-header/conversation-header.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { MessageInputComponent } from '../message-input/message-input.component';
import { MessagingService, Conversation, Message, MessageRequest, TypingIndicator } from '../../../core/services/messaging/messaging.service';

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
export class ChatWindowComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges {
  @Input() conversation!: Conversation;
  @Input() currentUserId!: number;
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  messages: Message[] = [];
  typingUsers: TypingIndicator[] = [];
  isLoading = true;
  isLoadingMore = false;
  isTyping = false;
  hasError = false;
  errorMessage = '';
  
  // ✅ Pagination
  currentPage = 0;
  pageSize = 50;
  hasMoreMessages = true;
  
  private destroy$ = new Subject<void>();
  private typingSubject = new Subject<void>();
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;
  private joinAttempted = false; // ✅ Nouveau: Pour éviter les boucles de join

  constructor(private messagingService: MessagingService) {}

  ngOnInit() {
    this.setupTypingIndicator();
    this.subscribeToUpdates();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['conversation'] && this.conversation) {
      console.log('📋 Conversation changed:', this.conversation.id);
      this.resetAndLoadMessages();
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    this.stopTyping();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== INITIALISATION ET CHARGEMENT =====

  // ✅ Réinitialiser et charger les messages
  private resetAndLoadMessages() {
    this.messages = [];
    this.currentPage = 0;
    this.hasMoreMessages = true;
    this.isLoading = true;
    this.hasError = false;
    this.shouldScrollToBottom = true;
    this.joinAttempted = false; // ✅ Reset du flag de join
    this.loadMessages();
  }

  // ✅ CORRECTION: Charger les messages avec gestion d'erreur améliorée
  private loadMessages() {
    if (!this.conversation) {
      console.error('❌ Cannot load messages: no conversation');
      return;
    }

    this.isLoading = this.currentPage === 0;
    this.isLoadingMore = this.currentPage > 0;
    this.hasError = false;

    console.log(`📥 Loading messages for conversation ${this.conversation.id}, page ${this.currentPage}`);

    this.messagingService.getConversationMessages(this.conversation.id, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newMessages) => {
          console.log(`✅ Messages loaded for conversation ${this.conversation.id}:`, newMessages.length);
          
          if (this.currentPage === 0) {
            // ✅ Première page : remplacer tous les messages
            this.messages = newMessages || [];
            this.shouldScrollToBottom = true;
          } else {
            // ✅ Pages suivantes : ajouter au début (messages plus anciens)
            this.messages = [...(newMessages || []), ...this.messages];
          }
          
          this.lastMessageCount = this.messages.length;
          this.hasMoreMessages = (newMessages?.length || 0) === this.pageSize;
          this.isLoading = false;
          this.isLoadingMore = false;
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

  // ✅ Obtenir un message d'erreur approprié
  private getErrorMessage(error: any): string {
    if (error.status === 403) {
      return 'Accès refusé à cette conversation';
    } else if (error.status === 404) {
      return 'Conversation introuvable';
    } else if (error.status === 503) {
      return 'Service temporairement indisponible';
    } else {
      return 'Erreur lors du chargement des messages';
    }
  }

  // ✅ Charger plus de messages (pagination)
  loadMoreMessages() {
    if (this.isLoadingMore || !this.hasMoreMessages) {
      return;
    }
    
    this.currentPage++;
    this.loadMessages();
  }

  // ===== SOUSCRIPTIONS =====

  // ✅ Souscrire aux mises à jour en temps réel
  private subscribeToUpdates() {
    // ✅ Nouveaux messages
    this.messagingService.messages$
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged((prev, curr) => prev.length === curr.length)
      )
      .subscribe(allMessages => {
        if (!this.conversation) return;
        
        // ✅ Filtrer les messages de cette conversation
        const conversationMessages = allMessages.filter(m => m.conversationId === this.conversation.id);
        
        // ✅ Vérifier s'il y a de nouveaux messages
        const newMessageCount = conversationMessages.length;
        if (newMessageCount > this.lastMessageCount) {
          const newMessages = conversationMessages.slice(this.lastMessageCount);
          
          // ✅ Ajouter les nouveaux messages à la fin
          this.messages = [...this.messages, ...newMessages];
          this.lastMessageCount = newMessageCount;
          
          // ✅ Scroller vers le bas si c'est un message de l'utilisateur actuel ou si on est près du bas
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.senderId === this.currentUserId || this.isNearBottom()) {
            this.shouldScrollToBottom = true;
          }
        }
      });

    // ✅ Indicateurs de frappe
    this.messagingService.typingIndicators$
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicators => {
        if (!this.conversation) return;
        
        this.typingUsers = indicators.filter(i => 
          i.conversationId === this.conversation.id && 
          i.userId !== this.currentUserId
        );
      });
  }

  // ===== CONFIGURATION FRAPPE =====

  // ✅ Configuration de l'indicateur de frappe
  private setupTypingIndicator() {
    // ✅ Démarrer la frappe
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300)
      )
      .subscribe(() => {
        if (!this.isTyping && this.conversation) {
          this.isTyping = true;
          this.messagingService.sendTypingIndicator(this.conversation.id, true);
        }
      });

    // ✅ Arrêter la frappe après 2 secondes d'inactivité
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(2000)
      )
      .subscribe(() => {
        this.stopTyping();
      });
  }

  // ✅ Arrêter l'indicateur de frappe
  private stopTyping() {
    if (this.isTyping && this.conversation) {
      this.isTyping = false;
      this.messagingService.sendTypingIndicator(this.conversation.id, false);
    }
  }

  // ===== HANDLERS D'ÉVÉNEMENTS =====

  // ✅ CORRECTION MAJEURE: Envoyer un message avec auto-join
  onSendMessage(content: string) {
    if (!content.trim() || !this.conversation) {
      return;
    }

    // ✅ CORRECTION: Si pas le droit d'envoyer, essayer de rejoindre automatiquement
    if (!this.canSendMessages() && this.conversation.type === 'SKILL_GROUP' && !this.joinAttempted) {
      console.log('🔄 Attempting to join skill conversation before sending message');
      this.joinAttempted = true; // ✅ Éviter les boucles
      
      this.joinSkillConversation().then(() => {
        this.sendMessageInternal(content);
      }).catch(error => {
        console.error('❌ Failed to join conversation:', error);
        this.joinAttempted = false; // ✅ Reset en cas d'échec
        this.showErrorMessage('Impossible de rejoindre cette conversation');
      });
      
      return;
    }

    this.sendMessageInternal(content);
  }

  // ✅ NOUVEAU: Méthode pour rejoindre une conversation de compétence
  private joinSkillConversation(): Promise<void> {
    if (!this.conversation?.skillId) {
      return Promise.reject('No skill ID available');
    }
    
    return this.messagingService.createSkillConversation(this.conversation.skillId)
      .pipe(takeUntil(this.destroy$))
      .toPromise()
      .then((updatedConversation) => {
        if (updatedConversation) {
          this.conversation = updatedConversation;
          console.log('✅ Successfully joined skill conversation');
        }
      });
  }

  // ✅ NOUVEAU: Méthode interne pour envoyer le message
  private sendMessageInternal(content: string) {
    const request: MessageRequest = {
      conversationId: this.conversation.id,
      content: content.trim(),
      type: 'TEXT'
    };

    this.messagingService.sendMessage(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (message) => {
          console.log('✅ Message sent:', message);
          this.shouldScrollToBottom = true;
          this.stopTyping();
          this.joinAttempted = false; // ✅ Reset après succès
        },
        error: (error) => {
          console.error('❌ Error sending message:', error);
          
          // ✅ CORRECTION: Messages d'erreur plus précis
          if (error.status === 403) {
            this.showErrorMessage('Vous n\'avez pas la permission d\'envoyer des messages dans cette conversation');
          } else if (error.status === 404) {
            this.showErrorMessage('Conversation introuvable');
          } else {
            this.showErrorMessage('Erreur lors de l\'envoi du message');
          }
          
          this.joinAttempted = false; // ✅ Reset en cas d'erreur
        }
      });
  }

  // ✅ Afficher un message d'erreur
  private showErrorMessage(message: string) {
    // Créer une notification d'erreur temporaire
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
      max-width: 300px;
      animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  // ✅ Sélection de fichier
  onFileSelect(file: File) {
    if (!this.conversation) {
      return;
    }

    // ✅ Vérifier la taille du fichier (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      this.showErrorMessage('Le fichier est trop volumineux (max 10MB)');
      return;
    }

    // ✅ Types de fichiers autorisés
    const allowedTypes = [
      'image/', 'video/', 'audio/', 
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const isAllowed = allowedTypes.some(type => file.type.startsWith(type));
    if (!isAllowed) {
      this.showErrorMessage('Type de fichier non autorisé');
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
          
          this.messagingService.sendMessage(request)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                console.log('✅ File message sent');
              },
              error: (error) => {
                console.error('❌ Error sending file message:', error);
                this.showErrorMessage('Erreur lors de l\'envoi du fichier');
              }
            });
        },
        error: (error) => {
          console.error('❌ Error uploading file:', error);
          this.showErrorMessage('Erreur lors du téléchargement du fichier');
        }
      });
  }

  // ✅ Indicateur de frappe
  onTyping() {
    this.typingSubject.next();
  }

  // ✅ Éditer un message
  onEditMessage(message: Message) {
    if (message.senderId !== this.currentUserId) {
      return;
    }

    const newContent = prompt('Modifier le message:', message.content);
    if (newContent && newContent !== message.content && message.id) {
      // TODO: Implémenter l'édition de message dans le service
      console.log('✏️ Edit message:', message.id, newContent);
    }
  }

  // ✅ Supprimer un message
  onDeleteMessage(message: Message) {
    if (message.senderId !== this.currentUserId) {
      return;
    }

    if (confirm('Supprimer ce message ?') && message.id) {
      // TODO: Implémenter la suppression de message dans le service
      console.log('🗑️ Delete message:', message.id);
    }
  }

  // ✅ Scroll handler pour charger plus de messages
  onScroll() {
    const container = this.messagesContainer?.nativeElement;
    if (!container) return;

    // ✅ Détecter si on est près du bas
    this.shouldScrollToBottom = this.isNearBottom();

    // ✅ Détecter si on est près du haut pour charger plus de messages
    if (container.scrollTop < 100 && this.hasMoreMessages && !this.isLoadingMore) {
      this.loadMoreMessages();
    }
  }

  // ✅ Retry en cas d'erreur
  onRetry() {
    this.resetAndLoadMessages();
  }

  // ===== MÉTHODES UTILITAIRES =====

  // ✅ Déterminer le type de fichier
  private getFileType(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('video/')) return 'VIDEO';
    if (file.type.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
  }

  // ✅ Scroller vers le bas
  private scrollToBottom(): void {
    try {
      if (this.messagesContainer?.nativeElement) {
        const container = this.messagesContainer.nativeElement;
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      console.warn('⚠️ Failed to scroll to bottom:', err);
    }
  }

  // ✅ Vérifier si on est près du bas
  private isNearBottom(): boolean {
    if (!this.messagesContainer?.nativeElement) return false;
    
    const container = this.messagesContainer.nativeElement;
    const threshold = 150;
    const position = container.scrollTop + container.offsetHeight;
    const height = container.scrollHeight;
    return position > height - threshold;
  }

  // ===== MÉTHODES PUBLIQUES POUR LE TEMPLATE =====

  // ✅ Texte de l'indicateur de frappe
  getTypingText(): string {
    if (this.typingUsers.length === 0) return '';
    
    if (this.typingUsers.length === 1) {
      return `${this.typingUsers[0].userName} est en train d'écrire...`;
    }
    
    if (this.typingUsers.length === 2) {
      return `${this.typingUsers[0].userName} et ${this.typingUsers[1].userName} sont en train d'écrire...`;
    }
    
    return `${this.typingUsers.length} personnes sont en train d'écrire...`;
  }

  // ✅ CORRECTION: Vérifier si on peut envoyer des messages
  canSendMessages(): boolean {
    if (!this.conversation) {
      return false;
    }
    
    // ✅ CORRECTION: Vérifier les différents critères
    const isActive = this.conversation.status === 'ACTIVE';
    const hasPermission = this.conversation.canSendMessage !== false;
    const isParticipant = this.conversation.participants.some(p => p.userId === this.currentUserId);
    
    console.log('🔍 canSendMessages check:', {
      conversationId: this.conversation.id,
      isActive,
      hasPermission,
      isParticipant,
      canSendMessage: this.conversation.canSendMessage,
      status: this.conversation.status,
      type: this.conversation.type
    });
    
    // ✅ CORRECTION: Pour les conversations de compétence, être plus permissif
    if (this.conversation.type === 'SKILL_GROUP') {
      return isActive; // Les conversations de compétence sont ouvertes
    }
    
    // Pour les autres types, vérifier les permissions normales
    return isActive && hasPermission && isParticipant;
  }

  // ✅ Obtenir le texte d'état vide
  getEmptyStateText(): string {
    if (this.isLoading) {
      return 'Chargement des messages...';
    }
    
    if (this.hasError) {
      return this.errorMessage;
    }
    
    if (this.messages.length === 0) {
      if (!this.canSendMessages()) {
        if (this.conversation.status !== 'ACTIVE') {
          return `Cette conversation est ${this.conversation.status === 'ARCHIVED' ? 'archivée' : 'terminée'}`;
        } else if (this.conversation.type === 'SKILL_GROUP') {
          return 'Cliquez sur "Envoyer" pour rejoindre cette discussion de compétence';
        } else {
          return 'Vous devez rejoindre cette conversation pour envoyer des messages';
        }
      }
      return 'Aucun message pour le moment. Envoyez le premier message !';
    }
    
    return '';
  }

  // ✅ Formater la date pour les séparateurs
  shouldShowDateSeparator(currentMessage: Message, previousMessage?: Message): boolean {
    if (!previousMessage) return true;
    
    const currentDate = new Date(currentMessage.sentAt).toDateString();
    const previousDate = new Date(previousMessage.sentAt).toDateString();
    
    return currentDate !== previousDate;
  }

  // ✅ Formater la date pour l'affichage
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
}