// conversation-list.component.ts - VERSION CORRIGÉE
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation } from '../../../core/services/messaging/messaging.service';

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

  ngOnInit() {
    console.log('📋 ConversationList initialized with', this.conversations.length, 'conversations');
  }

  selectConversation(conversation: Conversation) {
    console.log('📋 Conversation selected:', conversation.id);
    this.conversationSelected.emit(conversation);
  }


getConversationAvatar(conversation: Conversation): string {
  // Pour les conversations de compétence avec image
  if (conversation.type === 'SKILL_GROUP' && conversation.skillImageUrl) {
    return conversation.skillImageUrl;
  }
  
  // Pour les conversations directes, utiliser avatar du participant
  if (conversation.type === 'DIRECT' && conversation.participants.length > 0) {
    const otherParticipant = conversation.participants.find(p => p.userId !== this.currentUserId);
    if (otherParticipant?.avatar) {
      return otherParticipant.avatar;
    }
  }
  
  // Avatar par défaut basé sur le nom
  return this.getDefaultAvatar(this.getConversationName(conversation));
}

// quick-chat.component.ts


  getDefaultAvatar(name: string): string {
    // ✅ Générer une couleur basée sur le nom
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

  getUnreadBadgeText(count: number): string {
    if (count === 0) return '';
    return count > 99 ? '99+' : count.toString();
  }

  isConversationSelected(conversation: Conversation): boolean {
    return this.selectedConversation?.id === conversation.id;
  }

  hasUnreadMessages(conversation: Conversation): boolean {
    return conversation.unreadCount > 0;
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

  // ✅ Méthodes pour le statut en ligne
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

  // ✅ Méthodes pour l'affichage du statut
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

  // ✅ Gestion des clics et événements
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

  // ✅ Méthodes utilitaires pour le template
  trackByConversationId(index: number, conversation: Conversation): number {
    return conversation.id;
  }
}