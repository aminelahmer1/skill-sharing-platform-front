// message-notification-badge.component.ts - VERSION REFACTORISÉE AVEC SYNCHRO TEMPS RÉEL ET GESTION READ/UNREAD

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MessagingService, Conversation } from '../../../core/services/messaging/messaging.service';
import { Router } from '@angular/router';
import { trigger, transition, style, animate, state } from '@angular/animations';
import { MessageNotificationService, MessageNotification } from '../../../core/services/messaging/message-notification.service';

@Component({
  selector: 'app-message-notification-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="message-notification-wrapper">
      <!-- Badge -->
      <button 
        class="notification-badge"
        (click)="toggleDropdown()"
        [class.has-unread]="totalUnreadCount > 0">
        <span class="badge-icon">💬</span>
        <span class="badge-count" *ngIf="totalUnreadCount > 0">
          {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
        </span>
      </button>

      <!-- Dropdown avec liste des conversations -->
      <div class="conversations-dropdown" 
           *ngIf="showDropdown"
           [@slideDown]>
        
        <!-- Header -->
        <div class="dropdown-header">
          <h3>Messages</h3>
          <button 
            class="btn-open-messenger" 
            (click)="openMessenger()">
            Ouvrir Messenger
          </button>
        </div>

        <!-- Liste des conversations -->
        <div class="conversations-list" *ngIf="conversations.length > 0">
          <div 
            *ngFor="let conversation of conversations | slice:0:10" 
            class="conversation-item"
            [class.unread]="getUnreadCount(conversation) > 0"
            (click)="openQuickChat(conversation)">
            
            <img 
              [src]="getConversationAvatar(conversation)" 
              [alt]="getConversationName(conversation)"
              class="conversation-avatar">
            
            <div class="conversation-content">
              <div class="conversation-header">
                <span class="conversation-name">{{ getConversationName(conversation) }}</span>
                <span class="conversation-time">{{ formatLastMessageTime(conversation.lastMessageTime) }}</span>
              </div>
              <div class="conversation-preview">
                <p class="last-message">{{ conversation.lastMessage || 'Aucun message' }}</p>
                <span class="unread-badge" *ngIf="getUnreadCount(conversation) > 0">
                  {{ getUnreadCount(conversation) > 99 ? '99+' : getUnreadCount(conversation) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- État vide -->
        <div class="empty-state" *ngIf="conversations.length === 0">
          <span class="empty-icon">📭</span>
          <p>Aucune conversation</p>
          <button class="btn-start-conversation" (click)="openMessenger()">
            Démarrer une conversation
          </button>
        </div>

        <!-- Footer -->
        <div class="dropdown-footer" *ngIf="conversations.length > 10">
          <button class="btn-see-all" (click)="openMessenger()">
            Voir toutes les conversations
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .message-notification-wrapper {
      position: relative;
    }

    .notification-badge {
      position: relative;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      transition: all 0.3s ease;
    }

    .notification-badge:hover {
      background: rgba(108, 92, 231, 0.1);
    }

    .notification-badge.has-unread {
      animation: pulse 2s infinite;
    }

    .badge-icon {
      font-size: 1.5rem;
      display: block;
    }

    .badge-count {
      position: absolute;
      top: 0;
      right: 0;
      background: #ff6b6b;
      color: white;
      font-size: 0.7rem;
      font-weight: bold;
      padding: 2px 5px;
      border-radius: 10px;
      min-width: 18px;
      text-align: center;
    }

    .conversations-dropdown {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: 380px;
      max-height: 500px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      animation: slideDown 0.3s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .dropdown-header {
      padding: 15px 20px;
      border-bottom: 1px solid #e9ecef;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 15px 15px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .dropdown-header h3 {
      margin: 0;
      font-size: 1.2rem;
    }

    .btn-open-messenger {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-open-messenger:hover {
      background: rgba(255,255,255,0.3);
    }

    .conversations-list {
      flex: 1;
      overflow-y: auto;
      max-height: 350px;
    }

    .conversation-item {
      display: flex;
      padding: 12px 15px;
      cursor: pointer;
      transition: all 0.3s ease;
      border-bottom: 1px solid #f0f2f5;
      align-items: center;
    }

    .conversation-item:hover {
      background: #f8f9fa;
    }

    .conversation-item.unread {
      background: rgba(102, 126, 234, 0.05);
    }

    .conversation-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      margin-right: 12px;
      object-fit: cover;
    }

    .conversation-content {
      flex: 1;
      min-width: 0;
    }

    .conversation-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .conversation-name {
      font-weight: 600;
      color: #2d3436;
      font-size: 0.95rem;
    }

    .conversation-time {
      font-size: 0.75rem;
      color: #636e72;
    }

    .conversation-preview {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .last-message {
      margin: 0;
      color: #636e72;
      font-size: 0.85rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      margin-right: 10px;
    }

    .conversation-item.unread .last-message {
      font-weight: 600;
      color: #2d3436;
    }

    .unread-badge {
      background: #ff6b6b;
      color: white;
      font-size: 0.7rem;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
    }

    .empty-state {
      padding: 40px 20px;
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 10px;
      opacity: 0.5;
    }

    .btn-start-conversation {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 25px;
      cursor: pointer;
      margin-top: 15px;
      transition: all 0.3s ease;
    }

    .btn-start-conversation:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }

    .dropdown-footer {
      padding: 10px 15px;
      border-top: 1px solid #e9ecef;
      text-align: center;
    }

    .btn-see-all {
      background: transparent;
      border: none;
      color: #667eea;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-see-all:hover {
      text-decoration: underline;
    }

    @media (max-width: 480px) {
      .conversations-dropdown {
        width: calc(100vw - 40px);
        right: -10px;
      }
    }
  `],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class MessageNotificationBadgeComponent implements OnInit, OnDestroy {
  conversations: Conversation[] = [];
  totalUnreadCount = 0;
  showDropdown = false;
  currentUserId?: number;
  private destroy$ = new Subject<void>();
  unreadCounts = new Map<number, number>(); // AJOUT: Pour gérer unread par conversation
  unreadCount = 0;
  notifications: MessageNotification[] = [];
  constructor(
        private notificationService: MessageNotificationService,
    private messagingService: MessagingService,
    private router: Router,
    private cdr: ChangeDetectorRef // AJOUT: Pour forcer updates
  ) {}

  ngOnInit() {
     this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.unreadCount = count;
      });

    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications.slice(0, 10); // Afficher max 10 notifications
      });
    this.currentUserId = this.messagingService.getCurrentUserId();
    this.subscribeToConversations();
    this.subscribeToUnreadCounts(); // AJOUT: Souscription aux unread counts
    this.setupClickOutside();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToConversations() {
    this.messagingService.conversations$
      .pipe(takeUntil(this.destroy$))
      .subscribe(conversations => {
        this.conversations = conversations
          .sort((a, b) => {
            const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
            const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
            return timeB - timeA;
          });
        
        // Mise à jour du total unread basé sur les compteurs
        this.updateTotalUnread();
        this.cdr.detectChanges();
      });
  }

  // AJOUT: Souscription aux unread counts pour sync temps réel
  private subscribeToUnreadCounts() {
    this.messagingService.unreadCounts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(counts => {
        this.unreadCounts = counts;
        this.updateTotalUnread();
        this.cdr.detectChanges();
      });

    this.messagingService.totalUnread$
      .pipe(takeUntil(this.destroy$))
      .subscribe(total => {
        this.totalUnreadCount = total;
        this.cdr.detectChanges();
      });
  }

  // AJOUT: Calculer total unread
  private updateTotalUnread() {
    this.totalUnreadCount = Array.from(this.unreadCounts.values())
      .reduce((sum, count) => sum + count, 0);
  }

  // AJOUT: Récupérer unread pour une conversation
  getUnreadCount(conversation: Conversation): number {
    return this.unreadCounts.get(conversation.id) || conversation.unreadCount || 0;
  }

  private setupClickOutside() {
    document.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const wrapper = target.closest('.message-notification-wrapper');
      if (!wrapper && this.showDropdown) {
        this.showDropdown = false;
      }
    });
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  openQuickChat(conversation: Conversation) {
    this.showDropdown = false;
    
    // Vérifier si on est sur la page messenger
    if (this.router.url.includes('/messenger')) {
      // Si oui, juste sélectionner la conversation
      this.messagingService.setCurrentConversation(conversation);
    } else {
      // Sinon, ouvrir le quick chat
      window.dispatchEvent(new CustomEvent('openQuickChat', {
        detail: { conversation }
      }));
    }
    
    // AJOUT: Marquer comme lu si unread
    const unread = this.getUnreadCount(conversation);
    if (unread > 0) {
      this.messagingService.markAsRead(conversation.id).subscribe({
        next: () => {
          // Mise à jour locale
          this.unreadCounts.set(conversation.id, 0);
          this.updateTotalUnread();
          this.cdr.detectChanges();
        }
      });
    }
  }

  openMessenger() {
    this.showDropdown = false;
    const currentUrl = this.router.url;
    
    if (currentUrl.includes('producer')) {
      this.router.navigate(['/producer/messenger']);
    } else if (currentUrl.includes('receiver')) {
      this.router.navigate(['/receiver/messenger']);
    }
  }

  getConversationName(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      return otherParticipant?.userName || conversation.name;
    }
    return conversation.name;
  }

  getConversationAvatar(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      if (otherParticipant?.avatar) {
        return otherParticipant.avatar;
      }
    }
    
    return this.generateAvatar(this.getConversationName(conversation));
  }

  formatLastMessageTime(date?: Date): string {
    if (!date) return '';
    
    const now = new Date();
    const messageDate = new Date(date);
    const diff = now.getTime() - messageDate.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Maintenant';
    if (minutes < 60) return `${minutes} min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}j`;
    
    return messageDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  generateAvatar(name: string): string {
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    return `https://ui-avatars.com/api/?name= ${encodeURIComponent(name)}&background=${colors[colorIndex]}&color=fff&size=100&bold=true`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }
}