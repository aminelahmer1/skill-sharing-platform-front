// conversation-list.component.ts - VERSION CORRIGÉE
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation, MessagingService } from '../../../core/services/messaging/messaging.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversation-list.component.html',
  styleUrls: ['./conversation-list.component.css']
})
export class ConversationListComponent implements OnInit {
  @Input() conversations: Conversation[] = [];
  @Input() selectedConversation: Conversation | null = null;
  @Input() currentUserId!: number;
  @Output() conversationSelected = new EventEmitter<Conversation>();
private destroy$ = new Subject<void>();
  
  // Map pour stocker les compteurs non lus
  unreadCounts = new Map<number, number>();

  constructor(private messagingService: MessagingService) {}
  ngOnInit() {
    console.log('📋 ConversationList initialized');
    this.subscribeToUnreadCounts();
    this.listenToConversationReadEvents();
    this.syncUnreadCounts();
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }





 private subscribeToUnreadCounts() {
    this.messagingService.unreadCounts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(counts => {
        this.unreadCounts = counts;
        
        // Mettre à jour les conversations avec les nouveaux compteurs
        this.updateConversationsUnreadCounts();
      });

    // Écouter aussi le total
    this.messagingService.totalUnread$
      .pipe(takeUntil(this.destroy$))
      .subscribe(total => {
        console.log('📊 Total unread messages:', total);
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
          console.log('✅ Unread counts synced:', counts);
        },
        error: (error) => {
          console.error('❌ Error syncing unread counts:', error);
        }
      });
  }

 private listenToConversationReadEvents() {
    // Écouter l'événement custom
    const handleConversationRead = (event: any) => {
      const { conversationId } = event.detail;
      console.log('📖 Conversation read event:', conversationId);
      
      // Mettre à jour le compteur local
      const conversation = this.conversations.find(c => c.id === conversationId);
      if (conversation) {
        conversation.unreadCount = 0;
        this.unreadCounts.set(conversationId, 0);
      }
    };

    window.addEventListener('conversationRead', handleConversationRead);
    
    // Cleanup
    this.destroy$.subscribe(() => {
      window.removeEventListener('conversationRead', handleConversationRead);
    });
  }






  selectConversation(conversation: Conversation) {
    console.log('📋 Selecting conversation:', conversation.id);
    
    // Émettre la sélection
    this.conversationSelected.emit(conversation);
    
    // Si la conversation a des messages non lus, la marquer comme lue
    if (conversation.unreadCount > 0) {
      console.log(`📖 Marking conversation ${conversation.id} as read (${conversation.unreadCount} unread)`);
      
      // Mise à jour optimiste de l'UI
      conversation.unreadCount = 0;
      this.unreadCounts.set(conversation.id, 0);
      
      // Appel serveur asynchrone
      this.messagingService.markAsRead(conversation.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log('✅ Conversation marked as read on server');
          },
          error: (error) => {
            console.error('❌ Failed to mark as read:', error);
            // Recharger les compteurs en cas d'erreur
            this.syncUnreadCounts();
          }
        });
    }
  }
private updateBadge(count: number) {
    // Mettre à jour le badge dans le titre de la page
    if (count > 0) {
      document.title = `(${count}) Messages`;
    } else {
      document.title = 'Messages';
    }

    // Si supported, utiliser l'API Badge
    if ('setAppBadge' in navigator && 'clearAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  }

  getUnreadCount(conversation: Conversation): number {
    // Priorité au compteur en temps réel
    const realtimeCount = this.unreadCounts.get(conversation.id);
    if (realtimeCount !== undefined) {
      return realtimeCount;
    }
    
    // Fallback sur la propriété de l'objet
    return conversation.unreadCount || 0;
  }


  getConversationAvatar(conversation: Conversation): string {
    // Pour les conversations de compétence avec image
    if (conversation.type === 'SKILL_GROUP') {
      if (conversation.skillImageUrl) {
        // Si URL relative, ajouter base URL
        if (!conversation.skillImageUrl.startsWith('http')) {
          return `http://localhost:8822${conversation.skillImageUrl}`;
        }
        return conversation.skillImageUrl;
      }
    }
    
    // Pour les conversations directes
    if (conversation.type === 'DIRECT' && conversation.participants.length > 0) {
      const otherParticipant = conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      if (otherParticipant) {
        // Vérifier toutes les propriétés possibles pour l'avatar
        const avatar = otherParticipant.avatar || 
                      (otherParticipant as any).profileImageUrl || 
                      (otherParticipant as any).pictureUrl;
        
        if (avatar) {
          // Si URL relative, ajouter base URL
          if (!avatar.startsWith('http')) {
            return `http://localhost:8822${avatar}`;
          }
          return avatar;
        }
      }
    }
    
    // Avatar par défaut généré
    return this.generateAvatarUrl(this.getConversationName(conversation));
  }

  private generateAvatarUrl(name: string): string {
    if (!name || name.trim() === '') {
      return 'assets/default-avatar.png';
    }
    
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    
    // Utiliser UI Avatars API ou générer SVG
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

  getDefaultAvatar(name: string): string {
    // Générer une couleur basée sur le nom
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
    const index = name.charCodeAt(0) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${colors[index]}"/><text x="50" y="50" font-size="40" text-anchor="middle" dy=".35em" fill="white">${initial}</text></svg>`;
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
    console.log('🔄 Force syncing unread counts');
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

  getConversationStatusClass(conversation: Conversation): string {
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

  // Méthodes pour le statut en ligne
  isParticipantOnline(conversation: Conversation): boolean {
    if (conversation.type !== 'DIRECT') {
      return false;
    }
    
    const otherParticipant = conversation.participants.find(p => p.userId !== this.currentUserId);
    return otherParticipant?.isOnline || false;
  }

  getOnlineParticipantsCount(conversation: Conversation): number {
    return conversation.participants.filter(p => p.isOnline).length;
  }

  // Méthodes pour l'affichage du statut
  getConversationSubtitle(conversation: Conversation): string {
    switch (conversation.type) {
      case 'DIRECT':
        return this.isParticipantOnline(conversation) ? 'En ligne' : 'Hors ligne';
      case 'GROUP':
        const onlineCount = this.getOnlineParticipantsCount(conversation);
        return `${onlineCount}/${conversation.participants.length} en ligne`;
      case 'SKILL_GROUP':
        return `Compétence • ${conversation.participants.length} membre${conversation.participants.length > 1 ? 's' : ''}`;
      default:
        return '';
    }
  }

  // Gestion des clics et événements
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
}