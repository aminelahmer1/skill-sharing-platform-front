// conversation-list.component.ts - COMPLETE FIXED VERSION

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation, MessagingService } from '../../../core/services/messaging/messaging.service';
import { Subject, takeUntil, combineLatest } from 'rxjs';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversation-list.component.html',
  styleUrls: ['./conversation-list.component.css']
})
export class ConversationListComponent implements OnInit, OnDestroy {
  @Input() conversations: Conversation[] = [];
  @Input() selectedConversation: Conversation | null = null;
  @Input() currentUserId!: number;
  @Output() conversationSelected = new EventEmitter<Conversation>();

  private destroy$ = new Subject<void>();
  
  // Map pour stocker les compteurs non lus
  unreadCounts = new Map<number, number>();
  
  // FIXED: Better online users management
  onlineUsers = new Set<number>();
  private onlineUsersCache = new Map<number, { isOnline: boolean; lastSeen: Date }>();

  constructor(
    private messagingService: MessagingService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('ConversationList initialized');
    this.subscribeToUnreadCounts();
    this.listenToConversationReadEvents();
    this.syncUnreadCounts();
    this.subscribeToOnlineUsers();
    this.initializeOnlineStatusSync();
    this.setupGlobalReadSync();

  }
private setupGlobalReadSync() {
  // Écouter les événements globaux de lecture
  window.addEventListener('globalConversationRead', (event: any) => {
    const { conversationId } = event.detail;
    
    // Mettre à jour la conversation locale
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (conversation && conversation.unreadCount > 0) {
      conversation.unreadCount = 0;
      this.unreadCounts.set(conversationId, 0);
      this.cdr.detectChanges();
    }
  });
  
  // Écouter les activités quick chat
  window.addEventListener('quickChatActivity', (event: any) => {
    const { conversationId } = event.detail;
    
    // Mettre à jour localement
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (conversation && conversation.unreadCount > 0) {
      conversation.unreadCount = 0;
      this.unreadCounts.set(conversationId, 0);
      this.cdr.detectChanges();
    }
  });
}
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // FIXED: Better online users subscription
  private subscribeToOnlineUsers() {
    this.messagingService.onlineUsers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(onlineSet => {
        console.log('ConversationList - Online users updated:', Array.from(onlineSet));
        
        // Update cache
        const now = new Date();
        
        // Mark users as offline if they're not in the new set
        this.onlineUsersCache.forEach((status, userId) => {
          if (!onlineSet.has(userId) && status.isOnline) {
            this.onlineUsersCache.set(userId, {
              isOnline: false,
              lastSeen: now
            });
          }
        });
        
        // Mark users as online if they're in the new set
        onlineSet.forEach(userId => {
          this.onlineUsersCache.set(userId, {
            isOnline: true,
            lastSeen: now
          });
        });
        
        this.onlineUsers = onlineSet;
        this.updateConversationParticipantsStatus();
        this.cdr.detectChanges();
      });
  }

  // FIXED: Sync online status with conversations
  private initializeOnlineStatusSync() {
    combineLatest([
      this.messagingService.onlineUsers$,
      this.messagingService.conversations$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([onlineUsers, conversations]) => {
      console.log('Syncing online status with conversations');
      this.onlineUsers = onlineUsers;
      this.conversations = conversations;
      this.updateConversationParticipantsStatus();
      this.cdr.detectChanges();
    });
  }

  // FIXED: Update participant status
  private updateConversationParticipantsStatus() {
    this.conversations.forEach(conversation => {
      conversation.participants.forEach(participant => {
        const cachedStatus = this.onlineUsersCache.get(participant.userId);
        if (cachedStatus) {
          participant.isOnline = cachedStatus.isOnline;
          participant.lastSeen = cachedStatus.lastSeen;
        } else {
          participant.isOnline = this.onlineUsers.has(participant.userId);
        }
      });
    });
  }

  // FIXED: Accurate online status checking
  isUserOnline(userId: number): boolean {
    if (userId === this.currentUserId) {
      return false; // Don't show self as online in list
    }
    
    const cachedStatus = this.onlineUsersCache.get(userId);
    if (cachedStatus) {
      return cachedStatus.isOnline;
    }
    
    return this.onlineUsers.has(userId);
  }

  // FIXED: Direct conversation online status
  isDirectConversationOnline(conversation: Conversation): boolean {
    if (conversation.type !== 'DIRECT') return false;
    
    const otherUser = conversation.participants.find(p => p.userId !== this.currentUserId);
    if (!otherUser) return false;
    
    return this.isUserOnline(otherUser.userId);
  }

  // FIXED: Better status text for direct conversations
  getDirectConversationStatus(conversation: Conversation): string {
    if (conversation.type !== 'DIRECT') return '';
    
    const otherUser = conversation.participants.find(p => p.userId !== this.currentUserId);
    if (!otherUser) return 'Utilisateur introuvable';
    
    const isOnline = this.isUserOnline(otherUser.userId);
    
    if (isOnline) {
      return 'En ligne';
    } else {
      const cachedStatus = this.onlineUsersCache.get(otherUser.userId);
      if (cachedStatus && cachedStatus.lastSeen) {
        const timeDiff = Date.now() - cachedStatus.lastSeen.getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));
        
        if (minutesAgo < 1) {
          return ' Déconnecte à l\'instant';
        } else if (minutesAgo < 60) {
          return `Connecté(e) il y a ${minutesAgo} min`;
        } else if (minutesAgo < 1440) {
          const hoursAgo = Math.floor(minutesAgo / 60);
          return `Connecté(e) il y a ${hoursAgo}h`;
        }
      }
      return 'Hors ligne';
    }
  }

  // FIXED: Group online count
  getGroupOnlineCount(conversation: Conversation): number {
    if (conversation.type === 'DIRECT') return 0;
    
    return conversation.participants.filter(p => 
      p.userId !== this.currentUserId && this.isUserOnline(p.userId)
    ).length;
  }

  // FIXED: Group status text
  getGroupStatusText(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') return '';
    
    const onlineCount = this.getGroupOnlineCount(conversation);
    const totalOthers = conversation.participants.filter(p => p.userId !== this.currentUserId).length;
    
    if (totalOthers === 0) return 'Aucun participant';
    if (onlineCount === 0) return 'Tous hors ligne';
    if (onlineCount === 1) return '1 en ligne';
    return `${onlineCount} en ligne`;
  }

  // FIXED: Debug method using public methods only
  debugOnlineStatus(): void {
    console.log('CONVERSATION LIST DEBUG:');
    console.log('- Online users set:', Array.from(this.onlineUsers));
    console.log('- Current user ID:', this.currentUserId);
    console.log('- Online users cache:', Array.from(this.onlineUsersCache.entries()));
    console.log('- Conversations status:', this.conversations.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      participants: c.participants.map(p => ({
        userId: p.userId,
        userName: p.userName,
        isOnlineFromConv: p.isOnline,
        isOnlineFromSet: this.onlineUsers.has(p.userId),
        isOnlineFromMethod: this.isUserOnline(p.userId),
        isCurrent: p.userId === this.currentUserId
      }))
    })));
    
    // FIXED: Use public method
    this.messagingService.debugOnlineStatus();
  }

  // FIXED: Force refresh using public methods
  refreshOnlineStatus(): void {
    console.log('Force refreshing online status');
    
    this.onlineUsersCache.clear();
    
    // FIXED: Use public method
    this.messagingService.refreshPresenceStatus();
    
    this.cdr.detectChanges();
  }

  // Rest of existing methods...
  private subscribeToUnreadCounts() {
    this.messagingService.unreadCounts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(counts => {
        this.unreadCounts = counts;
        this.updateConversationsUnreadCounts();
      });

    this.messagingService.totalUnread$
      .pipe(takeUntil(this.destroy$))
      .subscribe(total => {
        console.log('Total unread messages:', total);
        this.updateBadge(total);
      });
  }

  private updateConversationsUnreadCounts() {
    this.conversations.forEach(conv => {
      const unreadCount = this.unreadCounts.get(conv.id) || 0;
      if (conv.unreadCount !== unreadCount) {
        conv.unreadCount = unreadCount;
      }
    });
  }

  private syncUnreadCounts() {
    this.messagingService.getAllUnreadCounts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (counts) => {
          console.log('Unread counts synced:', counts);
        },
        error: (error) => {
          console.error('Error syncing unread counts:', error);
        }
      });
  }

  private listenToConversationReadEvents() {
    const handleConversationRead = (event: any) => {
      const { conversationId } = event.detail;
      console.log('Conversation read event:', conversationId);
      
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.unreadCount = 0;
        this.unreadCounts.set(conversationId, 0);
      }
    };

    window.addEventListener('conversationRead', handleConversationRead);
    
    this.destroy$.subscribe(() => {
      window.removeEventListener('conversationRead', handleConversationRead);
    });
  }

  selectConversation(conversation: Conversation) {
    console.log('Selecting conversation:', conversation.id);
    
    this.conversationSelected.emit(conversation);
    
    if (conversation.unreadCount > 0) {
      console.log(`Marking conversation ${conversation.id} as read (${conversation.unreadCount} unread)`);
      
      conversation.unreadCount = 0;
      this.unreadCounts.set(conversation.id, 0);
      
      this.messagingService.markAsRead(conversation.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log('Conversation marked as read on server');
          },
          error: (error) => {
            console.error('Failed to mark as read:', error);
            this.syncUnreadCounts();
          }
        });
    }
  }

  private updateBadge(count: number) {
    if (count > 0) {
      document.title = `(${count}) Messages`;
    } else {
      document.title = 'Messages';
    }

    if ('setAppBadge' in navigator && 'clearAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  }

  getUnreadCount(conversation: Conversation): number {
    const realtimeCount = this.unreadCounts.get(conversation.id);
    if (realtimeCount !== undefined) {
      return realtimeCount;
    }
    
    return conversation.unreadCount || 0;
  }

  getConversationAvatar(conversation: Conversation): string {
    if (conversation.type === 'SKILL_GROUP') {
      if (conversation.skillImageUrl) {
        if (!conversation.skillImageUrl.startsWith('http')) {
          return `http://localhost:8822${conversation.skillImageUrl}`;
        }
        return conversation.skillImageUrl;
      }
    }
    
    if (conversation.type === 'DIRECT' && conversation.participants.length > 0) {
      const otherParticipant = conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      if (otherParticipant) {
        const avatar = otherParticipant.avatar || 
                      (otherParticipant as any).profileImageUrl || 
                      (otherParticipant as any).pictureUrl;
        
        if (avatar) {
          if (!avatar.startsWith('http')) {
            return `http://localhost:8822${avatar}`;
          }
          return avatar;
        }
      }
    }
    
    return this.generateAvatarUrl(this.getConversationName(conversation));
  }

  private generateAvatarUrl(name: string): string {
    if (!name || name.trim() === '') {
      return 'assets/default-avatar.png';
    }
    
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIndex]}&color=fff&size=100&bold=true`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  getConversationName(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find(p => p.userId !== this.currentUserId);
      return otherParticipant?.userName || conversation.name;
    }
    return conversation.name;
  }

  formatLastMessageTime(date?: Date): string {
    if (!date) return '';
    
    const now = new Date();
    const messageDate = new Date(date);
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) {
      return 'À l\'instant';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min`;
    } else if (diffHours < 24) {
      const hours = messageDate.getHours().toString().padStart(2, '0');
      const minutes = messageDate.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      return days[messageDate.getDay()];
    } else {
      return messageDate.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit',
        year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  getConversationIcon(conversation: Conversation): string {
    switch (conversation.type) {
      case 'DIRECT':
        return '👤';
      case 'GROUP':
        return '👥';
      case 'SKILL_GROUP':
        return '🎓';
      default:
        return '💬';
    }
  }

  getLastMessagePreview(conversation: Conversation): string {
    if (!conversation.lastMessage) {
      return 'Aucun message';
    }
    
    const maxLength = 50;
    return conversation.lastMessage.length > maxLength 
      ? conversation.lastMessage.substring(0, maxLength) + '...' 
      : conversation.lastMessage;
  }

  getUnreadBadgeText(conversation: Conversation): string {
    const count = this.getUnreadCount(conversation);
    if (count === 0) return '';
    return count > 99 ? '99+' : count.toString();
  }

  isConversationSelected(conversation: Conversation): boolean {
    return this.selectedConversation?.id === conversation.id;
  }

  hasUnreadMessages(conversation: Conversation): boolean {
    return this.getUnreadCount(conversation) > 0;
  }

  forceSync() {
    console.log('Force syncing unread counts');
    this.syncUnreadCounts();
  }

  getConversationClass(conversation: Conversation): string {
    const classes = ['conversation-item'];
    
    if (this.isConversationSelected(conversation)) {
      classes.push('active');
    }
    
    if (this.hasUnreadMessages(conversation)) {
      classes.push('has-unread');
    }
    
    if (conversation.status !== 'ACTIVE') {
      classes.push('inactive');
    }
    
    return classes.join(' ');
  }

  // FIXED: Better subtitle with accurate online status
  getConversationSubtitle(conversation: Conversation): string {
    switch (conversation.type) {
      case 'DIRECT':
        return this.getDirectConversationStatus(conversation);
      case 'GROUP':
        return this.getGroupStatusText(conversation);
      case 'SKILL_GROUP':
        const onlineCount = this.getGroupOnlineCount(conversation);
        const totalMembers = conversation.participants.length;
        if (onlineCount > 0) {
          return `Compétence • ${onlineCount}/${totalMembers} en ligne`;
        } else {
          return `Compétence • ${totalMembers} membre${totalMembers > 1 ? 's' : ''}`;
        }
      default:
        return '';
    }
  }

  // Event handlers
  onConversationClick(conversation: Conversation, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.selectConversation(conversation);
  }

  onConversationKeydown(conversation: Conversation, event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectConversation(conversation);
    }
  }

  trackByConversationId(index: number, conversation: Conversation): number {
    return conversation.id;
  }

  getRealTimeOnlineStatus(userId: number): 'online' | 'offline' | 'unknown' {
    if (userId === this.currentUserId) return 'online';
    
    const cached = this.onlineUsersCache.get(userId);
    if (cached) {
      return cached.isOnline ? 'online' : 'offline';
    }
    
    return this.onlineUsers.has(userId) ? 'online' : 'unknown';
  }
}