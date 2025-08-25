// message-input.component.ts - VERSION CORRIGÉE SANS ERREUR D'ANIMATION
import { 
  Component, 
  Output, 
  EventEmitter, 
  ViewChild, 
  ElementRef,
  OnDestroy 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.component.html',
  styleUrls: ['./message-input.component.css']
})
export class MessageInputComponent implements OnDestroy {
  @Output() sendMessage = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<File>();
  @Output() typing = new EventEmitter<void>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  messageContent = '';
  showEmojiPicker = false;
  isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // Emojis populaires groupés
  emojiGroups = {
    smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌'],
    emotions: ['😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑'],
    gestures: ['👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❣️', '💕'],
    misc: ['🔥', '✨', '🎉', '💯', '👀', '🎈', '🎁', '💪', '🌟', '⭐', '☀️', '🌙']
  };

  // Tous les emojis pour l'affichage
  emojis: string[] = [];

  constructor() {
    // Aplatir tous les emojis
    this.emojis = Object.values(this.emojiGroups).flat();
  }

  ngOnDestroy() {
    // Nettoyer les ressources audio si nécessaire
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  onSend() {
    const content = this.messageContent.trim();
    if (content) {
      this.sendMessage.emit(content);
      this.messageContent = '';
      this.resetTextareaHeight();
      this.closeEmojiPicker();
    }
  }

  onKeyPress(event: KeyboardEvent) {
    // Enter pour envoyer, Shift+Enter pour nouvelle ligne
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  onInput() {
    this.typing.emit();
    this.adjustTextareaHeight();
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validation basique du fichier
      if (this.validateFile(file)) {
        this.fileSelected.emit(file);
      }
      
      // Reset l'input pour permettre de sélectionner le même fichier
      input.value = '';
    }
  }

  private validateFile(file: File): boolean {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (file.size > maxSize) {
      alert('Le fichier est trop volumineux (max 10MB)');
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      alert('Type de fichier non supporté');
      return false;
    }

    return true;
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
    
    // Focus sur le textarea si on ferme le picker
    if (!this.showEmojiPicker && this.messageTextarea) {
      setTimeout(() => this.messageTextarea.nativeElement.focus(), 0);
    }
  }

  closeEmojiPicker() {
    this.showEmojiPicker = false;
  }

  insertEmoji(emoji: string) {
    const textarea = this.messageTextarea.nativeElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = this.messageContent;
    
    // Insérer l'emoji à la position du curseur
    this.messageContent = text.substring(0, start) + emoji + text.substring(end);
    
    // Fermer le picker et focus
    this.closeEmojiPicker();
    
    // Restaurer le focus et placer le curseur après l'emoji
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + emoji.length;
      textarea.setSelectionRange(newPosition, newPosition);
      this.adjustTextareaHeight();
    }, 0);
  }

  private adjustTextareaHeight() {
    if (!this.messageTextarea) return;
    
    const textarea = this.messageTextarea.nativeElement;
    
    // Reset height pour calculer la vraie hauteur
    textarea.style.height = 'auto';
    
    // Calculer la nouvelle hauteur (max 120px)
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${newHeight}px`;
  }

  private resetTextareaHeight() {
    if (!this.messageTextarea) return;
    
    const textarea = this.messageTextarea.nativeElement;
    textarea.style.height = 'auto';
  }

  async toggleRecording() {
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      this.stopRecording();
    }
  }

  private async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.handleAudioRecording(audioBlob);
        
        // Arrêter tous les tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      
      console.log('🎤 Enregistrement audio démarré');
    } catch (error) {
      console.error('❌ Erreur accès microphone:', error);
      alert('Impossible d\'accéder au microphone');
    }
  }

  async stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('⏹️ Enregistrement audio arrêté');
    }
  }

  private handleAudioRecording(audioBlob: Blob) {
    // Créer un fichier à partir du blob audio
    const audioFile = new File([audioBlob], `audio-${Date.now()}.webm`, {
      type: 'audio/webm'
    });
    
    // Émettre le fichier audio
    this.fileSelected.emit(audioFile);
  }

  // Méthode pour gérer le clic en dehors (optionnel)
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const emojiPicker = document.querySelector('.emoji-picker');
    const emojiButton = document.querySelector('.emoji-button');
    
    if (this.showEmojiPicker && 
        emojiPicker && 
        !emojiPicker.contains(target) && 
        !emojiButton?.contains(target)) {
      this.closeEmojiPicker();
    }
  }

  // Helpers pour le template
  canSend(): boolean {
    return this.messageContent.trim().length > 0;
  }

  getRecordingTooltip(): string {
    return this.isRecording ? 'Arrêter l\'enregistrement' : 'Message vocal';
  }

  getEmojiButtonTooltip(): string {
    return this.showEmojiPicker ? 'Fermer les emojis' : 'Ajouter un emoji';
  }
}