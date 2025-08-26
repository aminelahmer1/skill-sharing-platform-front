// conversation-header.component.ts - VERSION CORRIGÉE AVEC VRAIES PHOTOS
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Conversation } from '../../../core/services/messaging/messaging.service';

@Component({
  selector: 'app-conversation-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conversation-header.component.html',
  styleUrls: ['./conversation-header.component.css'],
  animations: [
    trigger('slideDown', [
      state('open', style({
        height: '*',
        opacity: 1
      })),
      state('closed', style({
        height: '0',
        opacity: 0
      })),
      transition('open <=> closed', [
        animate('300ms ease-in-out')
      ])
    ])
  ]
})
export class ConversationHeaderComponent {
  @Input() conversation!: Conversation;
  @Input() currentUserId!: number;
  
  showInfo = false;

  getConversationName(): string {
    if (this.conversation.type === 'DIRECT') {
      const otherParticipant = this.conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      return otherParticipant?.userName || this.conversation.name;
    }
    return this.conversation.name;
  }

  // ✅ MÉTHODE CORRIGÉE POUR VRAIES PHOTOS
  getConversationAvatar(): string {
    // Pour les conversations directes - utiliser la vraie photo du participant
    if (this.conversation.type === 'DIRECT') {
      const otherParticipant = this.conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      if (otherParticipant) {
        return this.getUserAvatar(otherParticipant);
      }
    }
    
    // Pour les conversations de compétence
    if (this.conversation.type === 'SKILL_GROUP' && this.conversation.skillImageUrl) {
      if (!this.conversation.skillImageUrl.startsWith('http')) {
        return `http://localhost:8822${this.conversation.skillImageUrl}`;
      }
      return this.conversation.skillImageUrl;
    }
    
    // Avatar de conversation personnalisé
    if (this.conversation.conversationAvatar) {
      if (!this.conversation.conversationAvatar.startsWith('http')) {
        return `http://localhost:8822${this.conversation.conversationAvatar}`;
      }
      return this.conversation.conversationAvatar;
    }
    
    // Générer avatar par défaut basé sur le nom
    return this.generateDefaultAvatar(this.getConversationName());
  }

  // ✅ MÉTHODE AJOUTÉE POUR GÉRER LES AVATARS UTILISATEURS (comme dans NewConversationDialogComponent)
  getUserAvatar(participant: any): string {
    // Essayer différentes propriétés pour l'avatar
    const avatarUrl = participant.avatar || 
                     participant.profileImageUrl || 
                     participant.pictureUrl ||
                     (participant as any).avatarUrl;
    
    if (avatarUrl) {
      // Si c'est déjà une URL complète
      if (avatarUrl.startsWith('http')) {
        return avatarUrl;
      }
      // Sinon, construire l'URL complète
      return `http://localhost:8822${avatarUrl}`;
    }
    
    // Générer avatar par défaut
    return this.generateDefaultAvatar(participant.userName || participant.name || '');
  }

  // ✅ MÉTHODE CORRIGÉE POUR GÉNÉRER AVATAR PAR DÉFAUT
  private generateDefaultAvatar(name: string): string {
    if (!name || name.trim() === '') {
      return 'assets/default-avatar.png';
    }
    
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23${colors[colorIndex]}"/><text x="50" y="50" font-size="35" text-anchor="middle" dy=".35em" fill="white" font-family="Arial">${initial}</text></svg>`;
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

  getSubtitle(): string {
    if (this.conversation.type === 'DIRECT') {
      const otherParticipant = this.conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      return otherParticipant?.isOnline ? 'En ligne' : 'Hors ligne';
    }
    
    const onlineCount = this.conversation.participants.filter(p => p.isOnline).length;
    const totalCount = this.conversation.participants.length;
    return `${totalCount} membre${totalCount > 1 ? 's' : ''} · ${onlineCount} en ligne`;
  }

  getConversationIcon(): string {
    switch (this.conversation.type) {
      case 'DIRECT': return '👤';
      case 'GROUP': return '👥';
      case 'SKILL_GROUP': return '🎓';
      default: return '💬';
    }
  }

  getStatusColor(): string {
    switch (this.conversation.status) {
      case 'ACTIVE': return '#28a745';
      case 'ARCHIVED': return '#6c757d';
      case 'COMPLETED': return '#17a2b8';
      case 'CANCELLED': return '#dc3545';
      default: return '#6c757d';
    }
  }

  // ✅ MÉTHODE CORRIGÉE POUR UTILISER getUserAvatar()
  getParticipantAvatar(participant: any): string {
    return this.getUserAvatar(participant);
  }

  toggleInfo() {
    this.showInfo = !this.showInfo;
  }

  // Nouvelles méthodes utilitaires
  isDirectConversation(): boolean {
    return this.conversation.type === 'DIRECT';
  }

  isGroupConversation(): boolean {
    return this.conversation.type === 'GROUP';
  }

  isSkillConversation(): boolean {
    return this.conversation.type === 'SKILL_GROUP';
  }

  canManageConversation(): boolean {
    return this.conversation.isAdmin === true;
  }

  getConversationTypeText(): string {
    switch (this.conversation.type) {
      case 'DIRECT': return 'Message direct';
      case 'GROUP': return 'Groupe';
      case 'SKILL_GROUP': return 'Groupe de compétence';
      default: return 'Conversation';
    }
  }

  getStatusText(): string {
    switch (this.conversation.status) {
      case 'ACTIVE': return 'Active';
      case 'ARCHIVED': return 'Archivée';
      case 'COMPLETED': return 'Terminée';
      case 'CANCELLED': return 'Annulée';
      default: return 'Inconnue';
    }
  }

  // === MÉTHODES PUBLIQUES POUR LE TEMPLATE ===

  onVoiceCall() {
    console.log('🎤 Voice call initiated for conversation:', this.conversation.id);
    this.initiateVoiceCall();
  }

  onVideoCall() {
    console.log('📹 Video call initiated for conversation:', this.conversation.id);
    this.initiateVideoCall();
  }

  onSearchInConversation() {
    console.log('🔍 Search in conversation:', this.conversation.id);
    this.openSearchDialog();
  }

  onManageParticipants() {
    console.log('👥 Managing participants for conversation:', this.conversation.id);
    this.openParticipantsManager();
  }

  onArchiveConversation() {
    console.log('📁 Archiving conversation:', this.conversation.id);
    if (confirm('Êtes-vous sûr de vouloir archiver cette conversation ?')) {
      this.archiveConversation();
    }
  }

  onMuteConversation() {
    console.log('🔇 Toggling mute for conversation:', this.conversation.id);
    this.toggleMuteConversation();
  }

  onLeaveConversation() {
    console.log('🚪 Leaving conversation:', this.conversation.id);
    if (confirm('Êtes-vous sûr de vouloir quitter cette conversation ?')) {
      this.leaveConversation();
    }
  }

  // === MÉTHODES PRIVÉES D'IMPLÉMENTATION ===

  private initiateVoiceCall() {
    if (this.conversation.type === 'DIRECT') {
      const otherParticipant = this.getOtherParticipant();
      if (otherParticipant) {
        this.startDirectCall('audio', otherParticipant.userId);
      } else {
        alert('Impossible de démarrer l\'appel : participant introuvable');
      }
    } else {
      this.startGroupCall('audio');
    }
  }

  private initiateVideoCall() {
    if (this.conversation.type === 'DIRECT') {
      const otherParticipant = this.getOtherParticipant();
      if (otherParticipant) {
        this.startDirectCall('video', otherParticipant.userId);
      } else {
        alert('Impossible de démarrer l\'appel : participant introuvable');
      }
    } else {
      this.startGroupCall('video');
    }
  }

  private startDirectCall(type: 'audio' | 'video', targetUserId: number) {
    const callData = {
      type,
      from: this.currentUserId,
      to: targetUserId,
      conversationId: this.conversation.id,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📞 Starting ${type} call:`, callData);
    
    window.dispatchEvent(new CustomEvent('startCall', {
      detail: callData
    }));
    
    this.showNotification(`Appel ${type === 'audio' ? 'vocal' : 'vidéo'} en cours...`);
  }

  private startGroupCall(type: 'audio' | 'video') {
    const callData = {
      type,
      from: this.currentUserId,
      conversationId: this.conversation.id,
      participants: this.conversation.participants.map(p => p.userId),
      timestamp: new Date().toISOString()
    };
    
    console.log(`📞 Starting group ${type} call:`, callData);
    
    window.dispatchEvent(new CustomEvent('startGroupCall', {
      detail: callData
    }));
    
    this.showNotification(`Appel ${type === 'audio' ? 'vocal' : 'vidéo'} de groupe en cours...`);
  }

  private openSearchDialog() {
    const searchTerm = prompt('Rechercher dans cette conversation:', '');
    
    if (searchTerm && searchTerm.trim()) {
      const searchData = {
        conversationId: this.conversation.id,
        query: searchTerm.trim(),
        timestamp: new Date().toISOString()
      };
      
      console.log('🔍 Searching in conversation:', searchData);
      
      window.dispatchEvent(new CustomEvent('searchInConversation', {
        detail: searchData
      }));
      
      this.showNotification(`Recherche de "${searchTerm}" en cours...`);
    }
  }

  private openParticipantsManager() {
    if (!this.canManageConversation()) {
      alert('Vous n\'avez pas les permissions pour gérer les participants');
      return;
    }

    const action = prompt(
      'Gestion des participants:\n' +
      '1. Ajouter un participant\n' +
      '2. Retirer un participant\n' +
      'Choisissez une action (1-2):'
    );

    switch (action) {
      case '1':
        this.addParticipant();
        break;
      case '2':
        this.removeParticipant();
        break;
      default:
        console.log('❌ Action annulée');
    }
  }

  private addParticipant() {
    const userId = prompt('ID de l\'utilisateur à ajouter:');
    
    if (userId && !isNaN(Number(userId))) {
      const participantData = {
        conversationId: this.conversation.id,
        userId: Number(userId),
        action: 'add',
        timestamp: new Date().toISOString()
      };
      
      console.log('👥 Adding participant:', participantData);
      
      window.dispatchEvent(new CustomEvent('manageParticipant', {
        detail: participantData
      }));
      
      this.showNotification('Participant ajouté avec succès');
    }
  }

  private removeParticipant() {
    const participantsList = this.conversation.participants
      .filter(p => p.userId !== this.currentUserId)
      .map((p, index) => `${index + 1}. ${p.userName} (ID: ${p.userId})`)
      .join('\n');
    
    if (participantsList) {
      const selection = prompt(
        'Sélectionner le participant à retirer:\n' + participantsList + '\n\nNuméro:'
      );
      
      if (selection && !isNaN(Number(selection))) {
        const participantIndex = Number(selection) - 1;
        const participant = this.conversation.participants
          .filter(p => p.userId !== this.currentUserId)[participantIndex];
        
        if (participant) {
          const participantData = {
            conversationId: this.conversation.id,
            userId: participant.userId,
            action: 'remove',
            timestamp: new Date().toISOString()
          };
          
          console.log('👥 Removing participant:', participantData);
          
          window.dispatchEvent(new CustomEvent('manageParticipant', {
            detail: participantData
          }));
          
          this.showNotification(`${participant.userName} a été retiré de la conversation`);
        }
      }
    } else {
      alert('Aucun participant à retirer');
    }
  }

  private toggleMuteConversation() {
    const muteData = {
      conversationId: this.conversation.id,
      userId: this.currentUserId,
      action: 'toggleMute',
      timestamp: new Date().toISOString()
    };
    
    console.log('🔇 Toggling mute for conversation:', muteData);
    
    window.dispatchEvent(new CustomEvent('toggleMuteConversation', {
      detail: muteData
    }));
    
    this.showNotification('Paramètres de notification modifiés');
  }

  private leaveConversation() {
    const leaveData = {
      conversationId: this.conversation.id,
      userId: this.currentUserId,
      action: 'leave',
      timestamp: new Date().toISOString()
    };
    
    console.log('🚪 Leaving conversation:', leaveData);
    
    window.dispatchEvent(new CustomEvent('leaveConversation', {
      detail: leaveData
    }));
    
    this.showNotification('Vous avez quitté la conversation');
  }

  private archiveConversation() {
    const archiveData = {
      conversationId: this.conversation.id,
      action: 'archive',
      timestamp: new Date().toISOString()
    };
    
    console.log('📁 Archiving conversation:', archiveData);
    
    window.dispatchEvent(new CustomEvent('archiveConversation', {
      detail: archiveData
    }));
    
    this.showNotification('Conversation archivée');
  }

  private showNotification(message: string) {
    const notification = document.createElement('div');
    notification.className = 'header-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      max-width: 300px;
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

  // === MÉTHODES UTILITAIRES ===

  getOtherParticipant() {
    if (this.conversation.type === 'DIRECT') {
      return this.conversation.participants.find(p => p.userId !== this.currentUserId);
    }
    return null;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isCallAvailable(): boolean {
    return this.conversation.status === 'ACTIVE';
  }

  canAddParticipants(): boolean {
    return this.canManageConversation() && 
           (this.conversation.type === 'GROUP' || this.conversation.type === 'SKILL_GROUP');
  }

  canLeaveConversation(): boolean {
    return this.conversation.type === 'GROUP' && this.conversation.status === 'ACTIVE';
  }
}