import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatService, ChatMessage, TypingIndicator } from '../../../core/services/Chat/chat.service';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-livestream-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './livestream-chat.component.html',
  styleUrls: ['./livestream-chat.component.css']
})
export class LivestreamChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() sessionId!: number;
  @Input() currentUserId!: string;
  @Input() currentUsername!: string;
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  messages: ChatMessage[] = [];
  newMessage = '';
  isConnected = false;
  isLoading = true;
  typingIndicators: TypingIndicator[] = []; // ✅ Corrigé: Array au lieu de Map
  
  private destroy$ = new Subject<void>();
  private typingSubject = new Subject<void>();
  private isTyping = false;
  private shouldScrollToBottom = true;
  private lastMessageCount = 0;

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.initializeChat();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom && this.messages.length > this.lastMessageCount) {
      this.scrollToBottom();
      this.lastMessageCount = this.messages.length;
    }
  }

  private async initializeChat(): Promise<void> {
    try {
      await this.loadPreviousMessages();
      this.subscribeToChat();
      this.setupTypingIndicator();
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      this.isLoading = false;
    }
  }

  private async loadPreviousMessages(): Promise<void> {
    try {
      // ✅ Corrigé: Attendre directement l'Observable
      this.chatService.getSessionMessages(this.sessionId).subscribe({
        next: (messages) => {
          this.messages = messages || [];
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Failed to load messages:', error);
          this.messages = [];
          this.isLoading = false;
        }
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
      this.messages = [];
      this.isLoading = false;
    }
  }

  private subscribeToChat(): void {
    // ✅ Connexion status - Corrigé: Comparaison avec string
    this.chatService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.isConnected = status === 'CONNECTED'; // ✅ Corrigé
        if (this.isConnected) {
          this.chatService.joinSession(this.sessionId);
        }
      });

    // ✅ Messages - Corrigé: Subscribe à l'array directement
    this.chatService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        this.messages = messages; // ✅ Corrigé: Assigner l'array complet
        this.shouldScrollToBottom = true;
        
        // Notification sonore pour les nouveaux messages (optionnel)
        const latestMessage = messages[messages.length - 1];
        if (latestMessage && !this.isOwnMessage(latestMessage)) {
          this.playNotificationSound();
        }
      });

    // ✅ Typing indicators - Corrigé: Subscribe à l'array directement
    this.chatService.typing$
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicators => {
        this.typingIndicators = indicators.filter(
          indicator => indicator.userId !== this.currentUserId
        ); // ✅ Corrigé: Filtrer l'array
      });
  }

  private setupTypingIndicator(): void {
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        if (!this.isTyping && this.newMessage.trim()) {
          this.isTyping = true;
          this.chatService.sendTypingIndicator(this.sessionId, true);
        } else if (this.isTyping && !this.newMessage.trim()) {
          this.isTyping = false;
          this.chatService.sendTypingIndicator(this.sessionId, false);
        }
      });

    // Stop typing indicator after 3 seconds of inactivity
    this.typingSubject
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(3000)
      )
      .subscribe(() => {
        if (this.isTyping) {
          this.isTyping = false;
          this.chatService.sendTypingIndicator(this.sessionId, false);
        }
      });
  }

  onMessageInput(): void {
    this.typingSubject.next();
  }

  sendMessage(): void {
    if (this.newMessage.trim() && this.isConnected) {
      const messageText = this.newMessage.trim();
      this.chatService.sendMessage(this.sessionId, messageText);
      this.newMessage = '';
      
      if (this.isTyping) {
        this.isTyping = false;
        this.chatService.sendTypingIndicator(this.sessionId, false);
      }
      
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.focus();
      }
    }
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onScroll(): void {
    const element = this.messagesContainer.nativeElement;
    const atBottom = element.scrollHeight - element.scrollTop === element.clientHeight;
    this.shouldScrollToBottom = atBottom;
  }

  private scrollToBottom(): void {
    try {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    } catch(err) {
      console.error('Scroll error:', err);
    }
  }

  private playNotificationSound(): void {
    // Implémenter si souhaité
    // const audio = new Audio('/assets/sounds/notification.mp3');
    // audio.play().catch(e => console.log('Could not play sound:', e));
  }

  // ✅ Getter corrigé
  get typingUsersArray(): TypingIndicator[] {
    return this.typingIndicators; // ✅ Retourner directement l'array
  }

  isOwnMessage(message: ChatMessage): boolean {
    return message.userId === this.currentUserId;
  }

  trackMessage(index: number, message: ChatMessage): string {
    return `${message.userId}-${message.timestamp.getTime()}`;
  }

  formatMessageTime(timestamp: Date | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'à l\'instant';
    if (diffMins < 60) return `il y a ${diffMins} min`;
    if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `il y a ${hours}h`;
    }
    
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short' 
    });
  }

  ngOnDestroy(): void {
    if (this.isTyping) {
      this.chatService.sendTypingIndicator(this.sessionId, false);
    }
    this.chatService.leaveSession(this.sessionId);
    this.destroy$.next();
    this.destroy$.complete();
  }
}