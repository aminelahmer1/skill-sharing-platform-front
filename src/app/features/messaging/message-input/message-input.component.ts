// message-input.component.ts - VERSION AVEC ENREGISTREMENT VOCAL COMPLET
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
  @Output() voiceMessageSent = new EventEmitter<File>(); // NOUVEAU: Émission pour message vocal
  
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messageTextarea') messageTextarea!: ElementRef<HTMLTextAreaElement>;

  messageContent = '';
  showEmojiPicker = false;
  
  // NOUVEAU: Variables pour l'enregistrement vocal
  isRecording = false;
  recordingDuration = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: any;
  private shouldProcessRecording = false;

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
    this.cleanupRecording();
  }

  // ========== MÉTHODES EXISTANTES ==========

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
      
      if (this.validateFile(file)) {
        this.fileSelected.emit(file);
      }
      
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

  // ========== MÉTHODES EMOJI ==========

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
    
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
    
    this.messageContent = text.substring(0, start) + emoji + text.substring(end);
    
    this.closeEmojiPicker();
    
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + emoji.length;
      textarea.setSelectionRange(newPosition, newPosition);
      this.adjustTextareaHeight();
    }, 0);
  }

  // ========== MÉTHODES TEXTAREA ==========

  private adjustTextareaHeight() {
    if (!this.messageTextarea) return;
    
    const textarea = this.messageTextarea.nativeElement;
    
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${newHeight}px`;
  }

  private resetTextareaHeight() {
    if (!this.messageTextarea) return;
    
    const textarea = this.messageTextarea.nativeElement;
    textarea.style.height = 'auto';
  }

  // ========== NOUVELLES MÉTHODES POUR L'ENREGISTREMENT VOCAL ==========

  async startRecording() {
    if (this.isRecording) return;

    console.log('🎤 Démarrage de l\'enregistrement vocal...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      this.audioChunks = [];
      this.isRecording = true;
      this.recordingDuration = 0;
      this.shouldProcessRecording = false; // Réinitialiser le flag

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        // Vérifier le flag avant de traiter
        if (this.shouldProcessRecording) {
          this.handleRecordingStop();
        } else {
          console.log('🚫 Enregistrement annulé - pas de traitement');
          this.cleanupRecordingData();
        }
        
        // Toujours nettoyer le stream
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      
      // Timer pour la durée d'enregistrement
      this.recordingTimer = setInterval(() => {
        this.recordingDuration++;
        
        // Arrêt automatique après 5 minutes (300 secondes)
        if (this.recordingDuration >= 300) {
          this.sendRecording();
        }
      }, 1000);

      console.log('✅ Enregistrement vocal démarré');

    } catch (error) {
      console.error('❌ Erreur accès microphone:', error);
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    console.log('⏹️ Arrêt de l\'enregistrement pour envoi...');
    
    // Marquer que l'enregistrement doit être traité
    this.shouldProcessRecording = true;
    this.isRecording = false;
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  cancelRecording() {
    if (!this.isRecording) return;

    console.log('🚫 Annulation de l\'enregistrement');
    
    // Marquer que l'enregistrement NE doit PAS être traité
    this.shouldProcessRecording = false;
    this.isRecording = false;
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }

    // Arrêter le MediaRecorder sans traiter les données
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    // Nettoyer immédiatement les données
    this.cleanupRecordingData();
  }

  sendRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('⚠️ Aucun enregistrement en cours');
      return;
    }

    console.log('📤 Préparation de l\'envoi de l\'enregistrement...');
    
    // Arrêter l'enregistrement et déclencher le traitement
    this.stopRecording();
  }

  private handleRecordingStop() {
    if (this.audioChunks.length === 0) {
      console.warn('⚠️ Aucune donnée audio à traiter');
      return;
    }

    console.log('🎵 Traitement de l\'enregistrement vocal...');

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const recordedDuration = this.recordingDuration;
    const durationText = this.formatRecordingTime(recordedDuration);
    
    // Créer un fichier audio avec métadonnées
    const audioFile = new File([audioBlob], `vocal-${Date.now()}.webm`, {
      type: 'audio/webm'
    });

    // Ajouter des propriétés personnalisées pour les métadonnées
    (audioFile as any).duration = recordedDuration;
    (audioFile as any).durationText = durationText;

    console.log('✅ Message vocal créé:', {
      size: audioFile.size,
      duration: durationText,
      type: audioFile.type
    });

    // Émettre le fichier audio vers le composant parent
    this.voiceMessageSent.emit(audioFile);

    // Nettoyer les données d'enregistrement
    this.cleanupRecordingData();
  }

  private cleanupRecordingData() {
    this.recordingDuration = 0;
    this.audioChunks = [];
    this.shouldProcessRecording = false;
    
    console.log('🧹 Données d\'enregistrement nettoyées');
  }

  private cleanupRecording() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanupRecordingData();
  }

  // ========== MÉTHODES UTILITAIRES ==========

  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  canSend(): boolean {
    return this.messageContent.trim().length > 0 && !this.isRecording;
  }

  getRecordingTooltip(): string {
    return this.isRecording ? 'Arrêter l\'enregistrement' : 'Message vocal';
  }

  getEmojiButtonTooltip(): string {
    return this.showEmojiPicker ? 'Fermer les emojis' : 'Ajouter un emoji';
  }

  getVoiceButtonTooltip(): string {
    if (this.isRecording) {
      return 'Enregistrement en cours...';
    }
    return 'Maintenir pour enregistrer un message vocal';
  }

  // Méthode pour gérer le clic en dehors des éléments
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
  }}