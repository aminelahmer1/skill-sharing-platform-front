// message-bubble.component.ts - VERSION CORRIGÉE COMPLÈTE

import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../../core/services/messaging/messaging.service';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.css']
})
export class MessageBubbleComponent implements OnDestroy {
  @Input() message!: Message;
  @Input() isOwnMessage = false;
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() imageClick = new EventEmitter<string>();
  @ViewChild('audioElement') audioElement?: ElementRef<HTMLAudioElement>;
  
  showOptions = false;
  isAudioPlaying = false;
  audioProgress = 0;
  audioDuration = '0:00';
  private audioLoadTimeout?: any;

  ngOnDestroy() {
    if (this.audioLoadTimeout) {
      clearTimeout(this.audioLoadTimeout);
    }
  }

  // ========== MÉTHODES DE FORMATAGE DU TEMPS ==========

  formatTime(date: Date): string {
    const messageDate = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    // Si le message est d'aujourd'hui, afficher l'heure
    if (messageDate.toDateString() === now.toDateString()) {
      const hours = messageDate.getHours().toString().padStart(2, '0');
      const minutes = messageDate.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    
    // Si c'est hier
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    }
    
    // Sinon, afficher la date courte
    return messageDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  formatDate(date: Date): string {
    const messageDate = new Date(date);
    const today = new Date();
    
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Aujourd\'hui';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    }
    
    return messageDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }

  // ========== GESTION DES ACTIONS ==========

  onEdit() {
    this.edit.emit();
    this.showOptions = false;
  }

  onDelete() {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) {
      this.delete.emit();
      this.showOptions = false;
    }
  }

  onImageClick() {
    if (this.message.attachmentUrl) {
      this.imageClick.emit(this.message.attachmentUrl);
    }
  }

  onFileClick(event: Event) {
    // Permettre le téléchargement normal du fichier
    console.log('📎 Téléchargement du fichier:', this.message.attachmentUrl);
  }

  // ========== GESTION DES AVATARS ==========

  getMessageAvatar(): string {
    // Essayer différentes sources d'avatar
    if (this.message.senderAvatar) {
      // Si l'URL est relative, la convertir en URL absolue
      if (!this.message.senderAvatar.startsWith('http')) {
        return `http://localhost:8822${this.message.senderAvatar}`;
      }
      return this.message.senderAvatar;
    }
    
    // Générer un avatar par défaut basé sur le nom
    return this.generateDefaultAvatar(this.message.senderName);
  }

  onAvatarError(event: Event) {
    console.warn('❌ Erreur de chargement avatar pour:', this.message.senderName);
    const img = event.target as HTMLImageElement;
    img.src = this.generateDefaultAvatar(this.message.senderName);
    
    // Empêcher les boucles d'erreur
    img.onerror = null;
  }

  onImageError(event: Event) {
    console.warn('❌ Erreur de chargement image:', this.message.attachmentUrl);
    const img = event.target as HTMLImageElement;
    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f8f9fa"/><text x="100" y="100" font-size="14" text-anchor="middle" dy=".35em" fill="%236c757d">Image non disponible</text></svg>';
    img.onerror = null;
  }

  private generateDefaultAvatar(name: string): string {
    if (!name || name.trim() === '') {
      name = 'Utilisateur';
    }
    
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe', '43e97b', 'fa709a'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23${colors[colorIndex]}"/><text x="50" y="50" font-size="35" text-anchor="middle" dy=".35em" fill="white" font-family="Arial, sans-serif" font-weight="600">${initial}</text></svg>`;
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

  // ========== GESTION AUDIO ==========

  toggleAudioPlay(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.audioElement?.nativeElement) {
      console.error('❌ Élément audio non trouvé');
      return;
    }

    const audio = this.audioElement.nativeElement;
    
    if (this.isAudioPlaying) {
      audio.pause();
      this.isAudioPlaying = false;
    } else {
      // Charger les métadonnées si ce n'est pas déjà fait
      if (audio.readyState === 0) {
        audio.load();
      }
      
      audio.play().then(() => {
        this.isAudioPlaying = true;
      }).catch(error => {
        console.error('❌ Erreur lecture audio:', error);
        this.isAudioPlaying = false;
      });
    }
  }

  onAudioEnded() {
    this.isAudioPlaying = false;
    this.audioProgress = 0;
  }

  onAudioTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    if (audio.duration && audio.currentTime) {
      this.audioProgress = (audio.currentTime / audio.duration) * 100;
    }
  }

  onAudioLoaded() {
    // Mettre à jour la durée quand les métadonnées sont chargées
    if (this.audioElement?.nativeElement) {
      const audio = this.audioElement.nativeElement;
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60);
        this.audioDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  }

  seekAudio(event: MouseEvent) {
    if (!this.audioElement?.nativeElement) return;
    
    const audio = this.audioElement.nativeElement;
    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    if (audio.duration) {
      audio.currentTime = percentage * audio.duration;
      this.audioProgress = percentage * 100;
    }
  }

  getAudioName(): string {
   
    return 'Message vocal';
  }

  getAudioDuration(): string {
    if (this.audioElement?.nativeElement) {
      const audio = this.audioElement.nativeElement;
      
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      
      // Essayer de charger les métadonnées
      if (audio.readyState === 0 && !this.audioLoadTimeout) {
        audio.load();
        this.audioLoadTimeout = setTimeout(() => {
          if (audio.duration && !isNaN(audio.duration)) {
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            this.audioDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        }, 1000);
      }
    }
    
    return this.audioDuration;
  }

  // ========== MÉTHODES DE VALIDATION ==========

  canShowOptions(): boolean {
    return !this.message.isDeleted && (this.canEdit() || this.canDelete());
  }

  canEdit(): boolean {
    return this.isOwnMessage && 
           this.message.type === 'TEXT' && 
           !this.message.isDeleted &&
           this.message.canEdit !== false;
  }

  canDelete(): boolean {
    return this.isOwnMessage && 
           !this.message.isDeleted &&
           this.message.canDelete !== false;
  }

  // ========== NOUVELLE: GESTION INTELLIGENTE DE LA LONGUEUR ==========

  getMessageLength(): number {
    if (!this.message.content) return 0;
    return this.message.content.trim().length;
  }

  isShortMessage(): boolean {
    const length = this.getMessageLength();
    // Messages courts: <= 50 caractères
    return length <= 50;
  }

  isMediumMessage(): boolean {
    const length = this.getMessageLength();
    // Messages moyens: 51-120 caractères
    return length > 50 && length <= 120;
  }

  isLongMessage(): boolean {
    const length = this.getMessageLength();
    // Messages longs: > 120 caractères
    return length > 120;
  }

  getMessageLengthClass(): string {
    if (this.isShortMessage()) return 'message-short';
    if (this.isMediumMessage()) return 'message-medium';
    return 'message-long';
  }

  // Limite de caractères par ligne selon le rôle
getCharacterLimitPerLine(): number {
  // AUGMENTATION SUPPLÉMENTAIRE des limites de caractères par ligne
  if (this.isProducerMessage()) {
    return 65; // Augmenté de 55 à 65 pour producteurs
  } else {
    return 55; // Augmenté de 45 à 55 pour receivers
  }
}

isProducerMessage(): boolean {
  // Solution plus simple et fiable
  // Vérifier si on a des métadonnées de rôle dans le message
  if ((this.message as any).senderRole) {
    return (this.message as any).senderRole === 'PRODUCER';
  }
  
  // Fallback : par défaut considérer comme receiver (messages plus compacts)
  return false;
}
  
  

shouldUseNoWrap(): boolean {
  const length = this.getMessageLength();
  
  // Messages très courts (≤ 30 chars) : toujours une ligne - ENCORE AUGMENTÉ
  if (length <= 30) return true; // Augmenté de 25 à 30
  
  // Messages spéciaux (émojis seuls, "ok", "oui", etc.)
  const specialPatterns = /^(ok|oui|non|merci|salut|bonjour|bonsoir|👍|👎|😊|😢|❤️|🔥|✅|❌)$/i;
  if (specialPatterns.test(this.message.content.trim())) return true;
  
  // Messages moyens : selon la limite ENCORE AUGMENTÉE
  const limit = this.isOwnMessage ? 65 : 60; // ENCORE AUGMENTÉ - Très généreux pour messages reçus
  return length <= limit;
}

// Méthode mise à jour pour getTextDisplayStyle avec largeurs augmentées
getTextDisplayStyle(): { [key: string]: string } {
  const styles: { [key: string]: string } = {};
  
  // Pour les messages reçus, toujours permettre le wrap avec plus d'espace
  if (!this.isOwnMessage) {
    styles['white-space'] = 'normal';
    styles['width'] = 'auto';
    styles['max-width'] = 'none';
    // NOUVEAU: Permettre plus d'espace horizontal pour messages reçus
    styles['min-width'] = '100px';
    return styles;
  }
  
  // Pour les messages envoyés, garder la logique existante améliorée
  if (this.shouldUseNoWrap()) {
    styles['white-space'] = 'nowrap';
    styles['overflow'] = 'visible';
    styles['text-overflow'] = 'clip';
    styles['max-width'] = 'none';
    styles['width'] = 'fit-content';
    // NOUVEAU: Largeur minimale plus généreuse
    styles['min-width'] = '80px';
  } else {
    styles['white-space'] = 'normal';
    styles['width'] = '100%';
  }
  
  return styles;
}

 getOptimalBubbleWidth(): string {
  const length = this.getMessageLength();
  const isMobile = window.innerWidth <= 480;
  const isTablet = window.innerWidth <= 768;
  
  if (this.shouldUseNoWrap()) {
    // Messages une ligne : largeur adaptée au contenu
    const charWidth = isMobile ? 7 : 8;
    const minWidth = 60;
    
    // LARGEURS ENCORE PLUS AUGMENTÉES pour messages reçus
    const maxWidth = this.isOwnMessage 
      ? (isMobile ? 200 : (isTablet ? 250 : 300))
      : (isMobile ? 240 : (isTablet ? 320 : 400)); // ENCORE AUGMENTÉ pour messages reçus
    
    return Math.max(minWidth, Math.min(maxWidth, length * charWidth)) + 'px';
  }
  
  // Messages multi-lignes - différencier envoyés/reçus avec largeurs encore augmentées
  if (this.isOwnMessage) {
    // Messages envoyés - largeurs maintenues
    if (this.isShortMessage()) {
      return isMobile ? '180px' : (isTablet ? '220px' : '250px');
    } else if (this.isMediumMessage()) {
      return isMobile ? '240px' : (isTablet ? '280px' : '320px');
    } else {
      return isMobile ? '280px' : (isTablet ? '340px' : '400px');
    }
  } else {
    // Messages reçus - LARGEURS ENCORE PLUS AUGMENTÉES
    if (this.isShortMessage()) {
      return isMobile ? '220px' : (isTablet ? '300px' : '400px'); // ENCORE AUGMENTÉ
    } else if (this.isMediumMessage()) {
      return isMobile ? '300px' : (isTablet ? '400px' : '480px'); // ENCORE AUGMENTÉ
    } else {
      return isMobile ? '360px' : (isTablet ? '460px' : '560px'); // ENCORE AUGMENTÉ
    }
  }
}


  // Nouvelle méthode pour obtenir les classes CSS dynamiques
  getMessageClasses(): string[] {
    const classes = [this.getMessageLengthClass()];
    
    if (this.isProducerMessage()) {
      classes.push('producer-message');
    } else {
      classes.push('receiver-message');
    }
    
    if (this.shouldUseNoWrap()) {
      classes.push('single-line');
    } else {
      classes.push('multi-line');
    }
    
    return classes;
  }

  // ========== MÉTHODES DE TYPE DE MESSAGE ==========

  isImageMessage(): boolean {
    return this.message.type === 'IMAGE' && !!this.message.attachmentUrl;
  }

  isVideoMessage(): boolean {
    return this.message.type === 'VIDEO' && !!this.message.attachmentUrl;
  }

  isAudioMessage(): boolean {
    return this.message.type === 'AUDIO' && !!this.message.attachmentUrl;
  }

  isFileMessage(): boolean {
    return this.message.type === 'FILE' && !!this.message.attachmentUrl;
  }

  isMediaMessage(): boolean {
    return this.isImageMessage() || this.isVideoMessage() || this.isAudioMessage() || this.isFileMessage();
  }

  // ========== UTILITAIRES POUR FICHIERS ==========

  getFileIcon(): string {
    if (!this.message.attachmentUrl) return '📄';
    
    const extension = this.getFileExtension(this.message.attachmentUrl);
    
    switch (extension?.toLowerCase()) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'xls':
      case 'xlsx': return '📊';
      case 'ppt':
      case 'pptx': return '📋';
      case 'zip':
      case 'rar':
      case '7z': return '🗜️';
      case 'txt': return '📃';
      case 'json': return '📋';
      case 'xml': return '📋';
      case 'csv': return '📊';
      default: return '📎';
    }
  }

  getFileSize(): string {
    // Cette méthode pourrait être enrichie avec la vraie taille du fichier
    // si elle est disponible dans les métadonnées du message
    if (this.message.attachmentSize) {
      return this.formatFileSize(this.message.attachmentSize);
    }
    return '';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private getFileExtension(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      const lastDot = pathname.lastIndexOf('.');
      return lastDot !== -1 ? pathname.slice(lastDot + 1) : null;
    } catch {
      const lastDot = url.lastIndexOf('.');
      return lastDot !== -1 ? url.slice(lastDot + 1) : null;
    }
  }

  // ========== CLASSES CSS DYNAMIQUES ==========

  getStatusClass(): string {
    switch (this.message.status) {
      case 'SENT': return 'status-sent';
      case 'DELIVERED': return 'status-delivered';
      case 'READ': return 'status-read';
      default: return '';
    }
  }

  getMessageBubbleClasses(): { [key: string]: boolean } {
    return {
      'deleted': this.message.isDeleted,
      'text-message': this.message.type === 'TEXT',
      'media-message': this.isMediaMessage(),
      'image-message': this.isImageMessage(),
      'video-message': this.isVideoMessage(),
      'audio-message': this.isAudioMessage(),
      'file-message': this.isFileMessage(),
      'own-message': this.isOwnMessage,
      'can-edit': this.canEdit(),
      'can-delete': this.canDelete()
    };
  }

  // ========== MÉTHODES DE DEBUG ==========

  debugMessage(): void {
    console.log('🐛 Message Debug:', {
      id: this.message.id,
      type: this.message.type,
      content: this.message.content?.substring(0, 50),
      senderName: this.message.senderName,
      senderAvatar: this.message.senderAvatar,
      attachmentUrl: this.message.attachmentUrl,
      isOwnMessage: this.isOwnMessage,
      status: this.message.status,
      sentAt: this.message.sentAt,
      isDeleted: this.message.isDeleted
    });
  }
}