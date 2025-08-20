// quick-chat.component.ts - VERSION CORRIGÉE
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MessagingService, Conversation, Message } from '../../../core/services/messaging/messaging.service';
import { trigger, transition, style, animate, state } from '@angular/animations';

interface QuickChatWindow {
  conversation: Conversation;
  messages: Message[];
  isMinimized: boolean;
  isTyping: boolean;
  newMessage: string;
  isLoading: boolean;
}

@Component({
  selector: 'app-quick-chat',
  standalone: true,
  imports: [CommonModule, FormsModule], // ✅ CORRECTION: Retirer MessageBubbleComponent inutilisé
  templateUrl: './quick-chat.component.html',
  styleUrls: ['./quick-chat.component.css'],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
      ])
    ]),
    trigger('minimize', [
      state('minimized', style({
        height: '48px'
      })),
      state('expanded', style({
        height: '400px'
      })),
      transition('minimized <=> expanded', animate('200ms ease'))
    ])
  ]
})
export class QuickChatComponent implements OnInit, OnDestroy {
  @ViewChild('messageContainer') messageContainer!: ElementRef;
  
  chatWindows: QuickChatWindow[] = [];
  currentUserId?: number;
  maxWindows = 3;
  private destroy$ = new Subject<void>();

  constructor(private messagingService: MessagingService) {}

  async ngOnInit() {
    await this.loadUserInfo();
    this.subscribeToQuickChats();
    this.subscribeToNewMessages();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadUserInfo() {
    try {
      // ✅ TODO: Intégrer avec le service Keycloak pour obtenir l'ID utilisateur réel
      this.currentUserId = 1; // Valeur temporaire
      console.log('✅ QuickChat user ID loaded:', this.currentUserId);
    } catch (error) {
      console.error('❌ Error loading user info:', error);
    }
  }

  private subscribeToQuickChats() {
    this.messagingService.quickChatConversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversations => {
        conversations.forEach(conv => {
          if (!this.chatWindows.find(w => w.conversation.id === conv.id)) {
            this.addChatWindow(conv);
          }
        });
      });
  }

  private subscribeToNewMessages() {
    this.messagingService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        // ✅ Mettre à jour les messages dans les fenêtres ouvertes
        this.chatWindows.forEach(window => {
          const windowMessages = messages.filter(m => m.conversationId === window.conversation.id);
          if (windowMessages.length > window.messages.length) {
            window.messages = windowMessages;
            setTimeout(() => this.scrollToBottom(window), 100);
          }
        });
      });
  }

  addChatWindow(conversation: Conversation) {
    if (this.chatWindows.length >= this.maxWindows) {
      // ✅ Retirer la plus ancienne
      this.chatWindows.shift();
    }

    const window: QuickChatWindow = {
      conversation,
      messages: [],
      isMinimized: false,
      isTyping: false,
      newMessage: '',
      isLoading: true
    };

    this.chatWindows.push(window);
    this.loadMessages(window);
  }

  private loadMessages(window: QuickChatWindow) {
    this.messagingService.getConversationMessages(window.conversation.id, 0, 20)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messages) => {
          window.messages = messages;
          window.isLoading = false;
          setTimeout(() => this.scrollToBottom(window), 100);
        },
        error: (error) => {
          console.error('❌ Error loading messages:', error);
          window.isLoading = false;
        }
      });
  }

  toggleMinimize(window: QuickChatWindow) {
    window.isMinimized = !window.isMinimized;
    if (!window.isMinimized) {
      setTimeout(() => this.scrollToBottom(window), 300);
    }
  }

  closeChat(window: QuickChatWindow) {
    const index = this.chatWindows.indexOf(window);
    if (index > -1) {
      this.chatWindows.splice(index, 1);
      this.messagingService.removeFromQuickChat(window.conversation.id);
    }
  }

  sendMessage(window: QuickChatWindow) {
    if (!window.newMessage.trim()) return;

    const messageRequest = {
      conversationId: window.conversation.id,
      content: window.newMessage.trim(),
      type: 'TEXT'
    };

    this.messagingService.sendMessage(messageRequest).subscribe({
      next: () => {
        window.newMessage = '';
        setTimeout(() => this.scrollToBottom(window), 100);
      },
      error: (error) => {
        console.error('❌ Error sending message:', error);
      }
    });
  }

  onTyping(window: QuickChatWindow) {
    if (!window.isTyping) {
      window.isTyping = true;
      this.messagingService.sendTypingIndicator(window.conversation.id, true);
      
      setTimeout(() => {
        window.isTyping = false;
        this.messagingService.sendTypingIndicator(window.conversation.id, false);
      }, 2000);
    }
  }

  onKeyPress(event: KeyboardEvent, window: QuickChatWindow) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(window);
    }
  }

  private scrollToBottom(window: QuickChatWindow) {
    try {
      const windowIndex = this.chatWindows.indexOf(window);
      const container = document.querySelector(`.chat-window:nth-child(${windowIndex + 1}) .messages-area`);
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      console.error('❌ Error scrolling to bottom:', err);
    }
  }

  getConversationName(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const other = conversation.participants.find(p => p.userId !== this.currentUserId);
      return other?.userName || conversation.name;
    }
    return conversation.name;
  }

  getConversationAvatar(conversation: Conversation): string {
    // ✅ CORRECTION: Utiliser conversationAvatar du backend
    if (conversation.conversationAvatar) {
      return conversation.conversationAvatar;
    }
    
    // ✅ Pour les conversations directes, utiliser l'avatar du participant
    if (conversation.type === 'DIRECT') {
      const other = conversation.participants.find(p => p.userId !== this.currentUserId);
      if (other?.avatar) {
        return other.avatar;
      }
    }
    
    // ✅ Générer un avatar par défaut
    const name = this.getConversationName(conversation);
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
    const index = name.charCodeAt(0) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${colors[index]}"/><text x="50" y="50" font-size="40" text-anchor="middle" dy=".35em" fill="white">${initial}</text></svg>`;
  }

  formatTime(date: Date): string {
    const messageDate = new Date(date);
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  isOwnMessage(message: Message): boolean {
    return message.senderId === this.currentUserId;
  }

  getLastMessage(window: QuickChatWindow): Message | null {
    return window.messages.length > 0 ? window.messages[window.messages.length - 1] : null;
  }

  // ✅ Méthodes utilitaires pour l'affichage
  getWindowPosition(index: number): string {
    return `${20 + (index * 340)}px`;
  }

  getConversationStatus(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const other = conversation.participants.find(p => p.userId !== this.currentUserId);
      return other?.isOnline ? 'En ligne' : 'Hors ligne';
    }
    return `${conversation.participants.length} membre${conversation.participants.length > 1 ? 's' : ''}`;
  }

  canSendMessage(window: QuickChatWindow): boolean {
    return window.conversation.canSendMessage !== false && 
           window.conversation.status === 'ACTIVE';
  }

  getMessageBubbleClass(message: Message): string {
    return this.isOwnMessage(message) ? 'message-bubble own' : 'message-bubble other';
  }
}