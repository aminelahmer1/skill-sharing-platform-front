// Fichier : src/app/features/messaging/message-bubble/message-bubble.component.ts (corrigé)

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message } from '../../../core/services/messaging/messaging.service';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.css']
})
export class MessageBubbleComponent {
  @Input() message!: Message;
  @Input() isOwnMessage = false;
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() imageClick = new EventEmitter<string>(); // AJOUT: Événement pour clic image
  
  showOptions = false;

  formatTime(date: Date): string {
    const messageDate = new Date(date);
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
      month: 'short',
      year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }

  onEdit() {
    this.edit.emit();
    this.showOptions = false;
  }

  onDelete() {
    this.delete.emit();
    this.showOptions = false;
  }

  // AJOUT: Méthode pour gérer le clic sur l'image
  onImageClick() {
    if (this.message.attachmentUrl) {
      this.imageClick.emit(this.message.attachmentUrl);
      // Ou ouvrir dans une nouvelle fenêtre
      window.open(this.message.attachmentUrl, '_blank');
    }
  }

  getFileIcon(type: string): string {
    switch (type) {
      case 'IMAGE': return '🖼️';
      case 'VIDEO': return '🎥';
      case 'AUDIO': return '🎵';
      case 'FILE': return '📎';
      default: return '📄';
    }
  }

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

  
}