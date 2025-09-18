import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, combineLatest } from 'rxjs';
import { MessagingService, Conversation, Message, TypingIndicator } from '../../../core/services/messaging/messaging.service';
import { trigger, transition, style, animate, state } from '@angular/animations';

interface QuickChatWindow {
  conversation: Conversation;
  messages: Message[];
  isMinimized: boolean;
  newMessage: string;
  typingIndicators: TypingIndicator[];
  isLoading: boolean;
  hasMoreMessages: boolean;
  page: number;
  isRecording: boolean;
  recordingDuration: number;
  showEmojiPicker: boolean;
  onlineStatus: {
    isDirectOnline?: boolean;
    onlineCount?: number;
    totalParticipants?: number;
    statusText?: string;
    
  };
}

@Component({
  selector: 'app-global-quick-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
   <div class="quick-chat-container" *ngIf="!isMessengerPage()">
  <div 
    *ngFor="let window of chatWindows; let i = index" 
    class="chat-window"
    [class.minimized]="window.isMinimized"
    [style.right.px]="getWindowPosition(i)"
    [@slideUp]>
    
    <!-- Header avec indicateur de statut -->
    <div class="chat-header" (click)="toggleMinimize(window)">
      <div class="header-left">
        <img 
          [src]="getConversationAvatar(window.conversation)" 
          [alt]="getConversationName(window.conversation)"
          class="conversation-avatar"
          onerror="this.src = generateAvatar(getConversationName(window.conversation))">
        <div class="header-info">
          <span class="conversation-name">{{ getConversationName(window.conversation) }}</span>
          <span class="conversation-status" 
                [class.online]="window.onlineStatus?.isDirectOnline"
                [class.offline]="!window.onlineStatus?.isDirectOnline && window.conversation.type === 'DIRECT'">
            {{ getConversationStatusText(window) }}
          </span>
        </div>
      </div>
      
      <div class="header-actions">
        <div class="status-indicator" *ngIf="window.conversation.type === 'DIRECT'">
          <span class="status-dot" 
                [class.online]="window.onlineStatus?.isDirectOnline"
                [class.offline]="!window.onlineStatus?.isDirectOnline">
          </span>
        </div>
        
        <button class="action-btn" (click)="openInMessenger(window); $event.stopPropagation()" title="Ouvrir dans Messenger">
          <span>📬</span>
        </button>
        <button class="action-btn" (click)="toggleMinimize(window); $event.stopPropagation()" title="Réduire/Agrandir">
          <span>{{ window.isMinimized ? '▲' : '▼' }}</span>
        </button>
        <button class="action-btn close-btn" (click)="closeChat(window); $event.stopPropagation()" title="Fermer">
          <span>✕</span>
        </button>
      </div>
    </div>

    <!-- Chat Body -->
    <div class="chat-body" *ngIf="!window.isMinimized">
      
      <!-- Messages Area -->
      <div class="messages-area" #messageContainer (scroll)="onScroll($event, window)">
        
        <!-- Load More Button -->
        <button 
          *ngIf="window.hasMoreMessages" 
          class="load-more-btn"
          (click)="loadMoreMessages(window)"
          [disabled]="window.isLoading">
          {{ window.isLoading ? 'Chargement...' : 'Charger plus' }}
        </button>
        
        <!-- Messages -->
        <div class="messages-wrapper">
          <div 
            *ngFor="let message of window.messages; trackBy: trackByMessageId" 
            class="message-bubble-container"
            [class.own]="isOwnMessage(message)">
            
            <img 
              *ngIf="!isOwnMessage(message) && shouldShowSenderInfo(message, window.conversation)"
              [src]="getMessageAvatar(message, window.conversation)" 
              [alt]="message.senderName"
              class="message-avatar"
              onerror="this.src = generateAvatar(message.senderName)">
            
            <div class="message-bubble">
              <div class="message-sender" *ngIf="shouldShowSenderInfo(message, window.conversation)">
                {{ message.senderName }}
                <span class="message-sender-status">
                  <span class="status-dot-mini" 
                        [class.online]="isUserOnline(message.senderId)"
                        [class.offline]="!isUserOnline(message.senderId)">
                  </span>
                  {{ getUserStatusText(message.senderId) }}
                </span>
              </div>
              
              <div class="message-content">
                <p *ngIf="message.type === 'TEXT'">{{ message.content }}</p>
                
                <div *ngIf="message.type === 'IMAGE'" class="image-message">
                  <img 
                    [src]="message.attachmentUrl"
                    [alt]="message.content"
                    class="message-image"
                    (click)="openImageModal(message.attachmentUrl, message.content)"
                    loading="lazy">
                  <div class="image-overlay" (click)="openImageModal(message.attachmentUrl, message.content)">
                    <span class="zoom-icon">🔍</span>
                  </div>
                  <p *ngIf="message.content" class="image-caption">{{ message.content }}</p>
                </div>
                
                <div *ngIf="message.type === 'VIDEO'" class="video-message">
                  <video 
                    [src]="message.attachmentUrl" 
                    controls 
                    preload="metadata"
                    class="message-video">
                    Votre navigateur ne supporte pas la lecture vidéo.
                  </video>
                  <p *ngIf="message.content" class="video-caption">{{ message.content }}</p>
                </div>

                <div *ngIf="message.type === 'AUDIO'" class="audio-message">
                  <div class="audio-player">
                    <button 
                      class="audio-play-btn"
                      (click)="toggleAudioPlay($event, message.attachmentUrl)">
                      <span class="play-icon">▶</span>
                    </button>
                    <audio 
                      [src]="message.attachmentUrl" 
                      preload="metadata"
                      class="audio-element"
                      (ended)="onAudioEnded($event)">
                    </audio>
                    <div class="audio-info">
                      <span class="audio-name">{{ 'Message vocal' }}</span>
                      <span class="audio-duration">{{ formatAudioDuration(message.attachmentUrl) }}</span>
                    </div>
                  </div>
                </div>
                
                <a 
                  *ngIf="message.type === 'FILE'" 
                  [href]="message.attachmentUrl"
                  target="_blank"
                  class="message-file">
                  <span class="file-icon">📎</span>
                  <span class="file-name">{{ message.content }}</span>
                  <span class="file-size">{{ getFileSize(message) }}</span>
                </a>
              </div>
              
              <div class="message-meta">
                <span class="message-time">{{ formatTime(message.sentAt) }}</span>
                <span class="message-status" *ngIf="isOwnMessage(message)">
                  <span *ngIf="message.status === 'SENT'" class="status-sent" title="Envoyé"></span>
                  <span *ngIf="message.status === 'DELIVERED'" class="status-delivered" title="Délivré"></span>
                  <span *ngIf="message.status === 'READ'" class="status-read" title="Lu"></span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Indicateur de frappe -->
        <div class="typing-indicator" *ngIf="getTypingUsers(window).length > 0">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>{{ getTypingText(window) }}</span>
        </div>
      </div>

      <!-- Picker Emoji -->
      <div class="emoji-picker" *ngIf="window.showEmojiPicker" [@slideUp]>
        <div class="emoji-header">
          <span>Emojis</span>
          <button (click)="toggleEmojiPicker(window)">✕</button>
        </div>
        <div class="emoji-grid">
          <span 
            *ngFor="let emoji of getPopularEmojis()" 
            class="emoji-item"
            (click)="insertEmoji(window, emoji)">
            {{ emoji }}
          </span>
        </div>
      </div>

      <!-- Input Area -->
      <div class="chat-input-area">
        
        <!-- Indicateur d'enregistrement -->
        <div class="recording-indicator" *ngIf="window.isRecording" [@slideUp]>
          <div class="recording-animation">
            <div class="recording-dot"></div>
            <span class="recording-text">Enregistrement en cours... {{ formatRecordingTime(window.recordingDuration) }}</span>
          </div>
          <div class="recording-actions">
            <button class="cancel-recording" (click)="cancelRecording(window)">✕ Annuler</button>
            <button class="stop-recording" (click)="sendRecording(window)">📤 Envoyer</button>
          </div>
        </div>

        <div class="input-wrapper" *ngIf="!window.isRecording">
          
          <button class="input-btn" (click)="triggerFileUpload(window)" title="Joindre un fichier">
            📎
          </button>
          <input 
            type="file" 
            #fileInput
            style="display: none"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            (change)="onFileSelect($event, window)">
          
          <input 
            type="text"
            [(ngModel)]="window.newMessage"
            (keypress)="onKeyPress($event, window)"
            (input)="onTyping(window)"
            placeholder="Écrivez un message..."
            class="message-input"
            maxlength="1000">
          
          <button 
            class="input-btn" 
            (click)="toggleEmojiPicker(window)"
            [class.active]="window.showEmojiPicker"
            title="Emojis">
            😊
          </button>

          <button 
            class="input-btn voice-btn" 
            (mousedown)="startRecording(window)"
            (mouseup)="stopRecording(window)"
            (touchstart)="startRecording(window)"
            (touchend)="stopRecording(window)"
            title="Maintenir pour enregistrer un message vocal">
            🎤
          </button>
          
          <button 
            class="send-btn"
            (click)="sendMessage(window)"
            [disabled]="!canSendMessage(window)"
            title="Envoyer">
            ➤
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Modal d'image -->
<div class="image-modal" *ngIf="showImageModal" (click)="closeImageModal()" [@fadeIn]>
  <div class="modal-backdrop"></div>
  <div class="modal-content" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <h3>{{ currentImageTitle || 'Image' }}</h3>
      <button class="modal-close" (click)="closeImageModal()">✕</button>
    </div>
    <div class="modal-body">
      <img [src]="currentImageUrl" [alt]="currentImageTitle" class="modal-image">
    </div>
    <div class="modal-actions">
      <button class="btn-download" (click)="downloadImage()">
        📥 Télécharger
      </button>
      <button class="btn-open-tab" (click)="openImageInTab()">
        🔗 Ouvrir dans un nouvel onglet
      </button>
    </div>
  </div>
</div>
  `,
  styles: [`
    /* ========== STRUCTURE DE BASE - DIMENSIONS CORRIGÉES ========== */
    .quick-chat-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1500;
      display: flex;
      flex-direction: row-reverse;
      gap: 8px;
      pointer-events: none;
    }

    .chat-window {
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      pointer-events: all;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: absolute;
      bottom: 0;
    }

    .chat-window.minimized {
      height: 56px;
    }

    /* ========== HEADER - DIMENSIONS FIXES ========== */
    .chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      height: 56px;
      border-radius: 12px 12px 0 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    .conversation-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3);
      object-fit: cover;
      flex-shrink: 0;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .conversation-name {
      font-weight: 600;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }

    .conversation-status {
      font-size: 0.7rem;
      opacity: 0.9;
    }

    .header-actions {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-shrink: 0;
    }

    .action-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: white;
      font-size: 0.85rem;
    }

    .action-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.1);
    }

    /* ========== BODY & MESSAGES - HAUTEUR FIXE ========== */
    .chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      height: calc(100% - 56px);
    }

    .messages-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      background: #f8f9fa;
      scroll-behavior: smooth;
      height: calc(100% - 70px);
    }

    /* Scrollbar personnalisée */
    .messages-area::-webkit-scrollbar {
      width: 6px;
    }

    .messages-area::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }

    .messages-area::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }

    .messages-area::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    .messages-wrapper {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 100%;
    }

    /* ========== BULLES DE MESSAGE - LARGEUR OPTIMISÉE ========== */
    .message-bubble-container {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 4px 0;
      width: 100%;
    }

    .message-bubble-container.own {
      flex-direction: row-reverse;
      justify-content: flex-start;
    }

    .message-bubble-container:not(.own) {
      flex-direction: row;
      justify-content: flex-start;
    }

    .message-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-top: 2px;
      border: 2px solid #e9ecef;
    }

    .message-bubble-container.own .message-avatar {
      display: none !important;
    }

    .message-bubble {
      max-width: 70%;
      min-width: 60px;
      padding: 8px 12px;
      border-radius: 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
      word-wrap: break-word;
      position: relative;
      font-size: 0.9rem;
      line-height: 1.4;
    }

    .message-bubble-container.own .message-bubble {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-bottom-right-radius: 4px;
      margin-right: 4px;
    }

    .message-bubble-container:not(.own) .message-bubble {
      background: white;
      border: 1px solid #e9ecef;
      color: #2d3436;
      border-bottom-left-radius: 4px;
      margin-left: 4px;
    }

    .message-sender {
      font-size: 0.7rem;
      font-weight: 600;
      margin-bottom: 4px;
      color: #6c757d;
      display: flex;
      align-items: center;
    }

    .message-bubble-container.own .message-sender {
      display: none;
    }

    .message-content p {
      margin: 0;
      word-wrap: break-word;
      line-height: 1.3;
      font-size: 0.9rem;
    }

    .message-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 0.65rem;
    }

    .message-bubble-container.own .message-meta {
      justify-content: flex-end;
      color: rgba(255, 255, 255, 0.85);
    }

    .message-bubble-container:not(.own) .message-meta {
      justify-content: flex-start;
      color: #95a5a6;
    }

    /* ========== STATUTS ET CHECKMARKS ========== */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-dot.online {
      background-color: #4CAF50;
      box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
    }

    .status-dot.offline {
      background-color: #9e9e9e;
    }

    .status-dot-mini {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 2px;
    }

    /* CHECKMARKS pour les statuts de message */
    .message-status {
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      font-weight: 600;
    }

    .message-bubble-container:not(.own) .message-status {
      display: none !important;
    }

    .message-bubble-container.own .status-sent::after {
      content: '✓';
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.75rem;
    }

    .message-bubble-container.own .status-delivered::after {
      content: '✓✓';
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.75rem;
      letter-spacing: -2px;
    }

    .message-bubble-container.own .status-read::after {
      content: '✓✓';
      color: #ffffff;
      font-size: 0.75rem;
      letter-spacing: -2px;
      font-weight: bold;
      text-shadow: 0 0 2px rgba(255,255,255,0.3);
    }

    /* ========== MÉDIAS - TAILLES OPTIMISÉES ========== */
    .image-message {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      max-width: 200px;
    }

    .message-image {
      width: 100%;
      height: auto;
      max-height: 150px;
      object-fit: cover;
      cursor: pointer;
      border-radius: 6px;
      display: block;
    }

    .video-message {
      max-width: 200px;
    }

    .message-video {
      width: 100%;
      height: auto;
      max-height: 150px;
      border-radius: 6px;
    }

    .audio-message {
      min-width: 180px;
    }

    .audio-player {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 16px;
    }

    .audio-play-btn {
      background: #667eea;
      border: none;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.8rem;
      flex-shrink: 0;
    }

    .message-file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      font-size: 0.85rem;
    }

    /* ========== ZONE INPUT - HAUTEUR FIXE ========== */
    .chat-input-area {
      padding: 12px;
      background: white;
      border-top: 1px solid #e9ecef;
      flex-shrink: 0;
      height: 70px;
      border-radius: 0 0 12px 12px;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f8f9fa;
      border-radius: 22px;
      padding: 8px 10px;
      height: 46px;
    }

    .message-input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 0.9rem;
      padding: 4px 6px;
      min-width: 0;
    }

    .input-btn {
      background: transparent;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      opacity: 0.7;
      transition: all 0.2s ease;
      padding: 6px;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .input-btn:hover {
      opacity: 1;
      background: rgba(102, 126, 234, 0.1);
    }

    .send-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 0.95rem;
      flex-shrink: 0;
    }

    .send-btn:hover:not(:disabled) {
      transform: scale(1.1);
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ========== EMOJI PICKER - POSITION CORRIGÉE ========== */
    .emoji-picker {
      position: absolute;
      bottom: 72px;
      left: 12px;
      right: 12px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 10;
      max-height: 200px;
    }

    .emoji-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid #e9ecef;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      padding: 10px;
      max-height: 140px;
      overflow-y: auto;
    }

    .emoji-item {
      font-size: 1.2rem;
      cursor: pointer;
      text-align: center;
      padding: 4px;
      border-radius: 4px;
      transition: all 0.15s ease;
    }

    .emoji-item:hover {
      background: #f0f2f5;
      transform: scale(1.15);
    }

    /* ========== INDICATEURS ========== */
    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px;
      color: #636e72;
      font-size: 0.8rem;
      margin-left: 36px;
    }

    .typing-dots {
      display: flex;
      gap: 3px;
      background: white;
      padding: 6px 10px;
      border-radius: 16px;
      border: 1px solid #e9ecef;
    }

    .typing-dots span {
      width: 6px;
      height: 6px;
      background: #636e72;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }

    @keyframes bounce {
      0%, 60%, 100% { 
        transform: translateY(0);
        opacity: 0.4;
      }
      30% { 
        transform: translateY(-8px);
        opacity: 1;
      }
    }

    .recording-indicator {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 12px;
      margin: 8px 12px;
    }

    .recording-animation {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .recording-dot {
      width: 12px;
      height: 12px;
      background: white;
      border-radius: 50%;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .recording-text {
      font-size: 0.9rem;
      font-weight: 500;
    }

    .recording-actions {
      display: flex;
      gap: 8px;
    }

    .cancel-recording, .stop-recording {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      padding: 8px 14px;
      border-radius: 20px;
      color: white;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .cancel-recording:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.02);
    }

    .stop-recording {
      background: rgba(255,255,255,0.9);
      color: #e74c3c;
      font-weight: 600;
    }

    .stop-recording:hover {
      background: white;
      transform: scale(1.02);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .load-more-btn {
      width: 100%;
      padding: 6px;
      margin-bottom: 8px;
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s ease;
    }

    /* ========== MODAL IMAGE ========== */
    .image-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
    }

    .modal-content {
      position: relative;
      background: white;
      border-radius: 12px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      box-shadow: 0 15px 30px rgba(0,0,0,0.3);
    }

    .modal-image {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }

    /* ========== RESPONSIVE ========== */
    @media (max-width: 768px) {
      .quick-chat-container {
        right: 10px;
        bottom: 10px;
        gap: 10px;
      }

      .chat-window {
        width: calc(100vw - 20px);
        max-width: 320px;
        height: 480px;
      }

      .conversation-name {
        max-width: 120px;
      }

      .message-bubble {
        max-width: 75%;
        font-size: 0.85rem;
      }

      .emoji-grid {
        grid-template-columns: repeat(6, 1fr);
      }

      .input-btn {
        width: 28px;
        height: 28px;
        font-size: 1rem;
      }

      .send-btn {
        width: 32px;
        height: 32px;
      }
    }

    @media (max-width: 480px) {
      .chat-window {
        width: calc(100vw - 20px);
        max-width: 300px;
        height: 450px;
      }

      .messages-area {
        padding: 8px;
      }

      .chat-input-area {
        padding: 10px;
        height: 64px;
      }

      .input-wrapper {
        height: 42px;
        padding: 6px 8px;
      }

      .emoji-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }
  `],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class GlobalQuickChatComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef;
  
   private autoScrollEnabled = new Map<number, boolean>();
  private scrollTimeouts = new Map<number, any>();

private activeWindows = new Set<number>();

  chatWindows: QuickChatWindow[] = [];
  currentUserId?: number;
  maxWindows = 3;
  private destroy$ = new Subject<void>();

  // Cache pour les statuts des utilisateurs (similaire à ConversationList)
  private onlineUsersCache = new Map<number, { isOnline: boolean; lastSeen: Date }>();
  private onlineUsers = new Set<number>();

  // Variables existantes pour modals...
  showImageModal = false;
  currentImageUrl = '';
  currentImageTitle = '';

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: any;
private audioDurations = new Map<string, string>();

private shouldProcessRecording = false;
private readTimeouts = new Map<number, any>();

  constructor(
    private messagingService: MessagingService,
    private router: Router,
    private cdr: ChangeDetectorRef

  ) {}

 ngOnInit() {
  this.loadUserInfo();
  this.listenToQuickChatEvents();
  this.subscribeToMessages();
  this.subscribeToTypingIndicators();
  this.subscribeToOnlineUsers();
  this.setupClickOutside();
  this.setupReadStateSynchronization();
  this.subscribeToReadReceipts();
  this.setupWindowClickListener();
  
    this.subscribeToWebSocketReadReceipts();
  

}

// AJOUTER après ngOnInit()
private subscribeToWebSocketReadReceipts() {
  // Accéder au client STOMP via le service
  const stompClient = (this.messagingService as any).stompClient;
  
  if (!stompClient || !stompClient.connected) {
    // Réessayer après connexion
    setTimeout(() => this.subscribeToWebSocketReadReceipts(), 1000);
    return;
  }

  // S'abonner aux receipts de lecture pour l'utilisateur
  stompClient.subscribe(`/user/${this.currentUserId}/queue/read-receipts`, (message: any) => {
    const receipt = JSON.parse(message.body);
    this.handleRealTimeReadReceipt(receipt);
  });

  // S'abonner aux mises à jour de statut de message
  stompClient.subscribe('/user/queue/message-status-update', (message: any) => {
    const statusUpdate = JSON.parse(message.body);
    this.handleMessageStatusUpdate(statusUpdate);
  });
}

// AJOUTER: Gestionnaire pour les receipts en temps réel
private handleRealTimeReadReceipt(receipt: any) {
  this.chatWindows.forEach(window => {
    if (window.conversation.id === receipt.conversationId) {
      // Mettre à jour IMMÉDIATEMENT le statut des messages
      let hasChanges = false;
      
      window.messages.forEach(msg => {
        // Si c'est notre message et qu'il vient d'être lu par l'autre
        if (msg.senderId === this.currentUserId && 
            receipt.readByUserId !== this.currentUserId &&
            msg.status !== 'READ') {
          msg.status = 'READ';
          hasChanges = true;
          console.log(`✅ Message ${msg.id} marqué comme READ en temps réel`);
        }
      });
      
      if (hasChanges) {
        // Forcer la mise à jour immédiate de l'affichage
        this.cdr.detectChanges();
      }
    }
  });
}

// AJOUTER: Gestionnaire pour les mises à jour de statut
private handleMessageStatusUpdate(update: any) {
  const window = this.chatWindows.find(w => w.conversation.id === update.conversationId);
  if (!window) return;
  
  const message = window.messages.find(m => m.id === update.messageId);
  if (message && message.status !== update.newStatus) {
    message.status = update.newStatus;
    console.log(`📨 Statut message ${update.messageId}: ${update.newStatus}`);
    this.cdr.detectChanges();
  }
}
private subscribeToReadReceipts() {
  this.messagingService.readReceipts$
    .pipe(takeUntil(this.destroy$))
    .subscribe(receipts => {
      receipts.forEach(receipt => {
        // Trouver la fenêtre correspondante
        const window = this.chatWindows.find(w => 
          w.conversation.id === receipt.conversationId
        );
        
        if (window) {
          // Mettre à jour le statut des messages
          window.messages.forEach(msg => {
            if (msg.senderId === this.currentUserId && 
                msg.id && 
                msg.id <= receipt.lastReadMessageId) {
              msg.status = 'READ';
            }
          });
          
          this.cdr.detectChanges();
        }
      });
    });
}
private setupReadStateSynchronization() {
  // Écouter les événements globaux de lecture
  window.addEventListener('conversationMarkedAsRead', (event: any) => {
    const { conversationId, source } = event.detail;
    
    if (source !== 'quick-chat') {
      // Mettre à jour localement si marqué depuis ailleurs
      const window = this.chatWindows.find(w => w.conversation.id === conversationId);
      if (window) {
        window.conversation.unreadCount = 0;
        this.cdr.detectChanges();
      }
    }
  });
}

  ngOnDestroy() {

    this.activeWindows.forEach(conversationId => {
    this.notifyConversationActive(conversationId, false);
  });
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupRecording();
    
    // NOUVEAU: Nettoyer tous les timeouts de scroll
    this.scrollTimeouts.forEach(timeout => clearTimeout(timeout));
    this.scrollTimeouts.clear();
  }

private async loadUserInfo() {
  try {
    // Récupérer l'ID depuis MessagingService
    this.currentUserId = this.messagingService.getCurrentUserId();
    
    if (!this.currentUserId) {
      // Attendre que MessagingService soit initialisé
      const userId = await this.messagingService.getCurrentUserIdAsync();
      if (userId) {
        this.currentUserId = userId;
      }
    }
    
    console.log('✅ QuickChat user ID loaded:', this.currentUserId);
  } catch (error) {
    console.error('❌ Error loading user info:', error);
  }
}

  private listenToQuickChatEvents() {
  // Événement d'ouverture du quick chat
  window.addEventListener('openQuickChat', (event: any) => {
    const conversation = event.detail.conversation;
    this.openChat(conversation);
  });
  
  // NOUVEAU: Événement de rafraîchissement forcé des messages
  window.addEventListener('refreshQuickChatMessages', (event: any) => {
    const conversationId = event.detail.conversationId;
    const window = this.chatWindows.find(w => w.conversation.id === conversationId);
    if (window) {
      console.log('📥 Refreshing messages for conversation:', conversationId);
      this.forceRefreshMessages(window);
    }
  });
}

  // ===== NOUVEAU: GESTION DES STATUTS DE CONNEXION =====

  private subscribeToOnlineUsers() {
    this.messagingService.onlineUsers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(onlineSet => {
        console.log('QuickChat - Online users updated:', Array.from(onlineSet));
        
        // Mettre à jour le cache
        const now = new Date();
        
        // Marquer les utilisateurs comme hors ligne s'ils ne sont pas dans le nouvel ensemble
        this.onlineUsersCache.forEach((status, userId) => {
          if (!onlineSet.has(userId) && status.isOnline) {
            this.onlineUsersCache.set(userId, {
              isOnline: false,
              lastSeen: now
            });
          }
        });
        
        // Marquer les utilisateurs comme en ligne s'ils sont dans le nouvel ensemble
        onlineSet.forEach(userId => {
          this.onlineUsersCache.set(userId, {
            isOnline: true,
            lastSeen: now
          });
        });
        
        this.onlineUsers = onlineSet;
        this.updateAllWindowsOnlineStatus();
        this.cdr.detectChanges();
      });
  }

  private updateAllWindowsOnlineStatus() {
    this.chatWindows.forEach(window => {
      this.updateWindowOnlineStatus(window);
    });
  }

 

  isUserOnline(userId: number): boolean {
    if (userId === this.currentUserId) {
      return false; // Ne pas afficher soi-même comme en ligne
    }
    
    const cachedStatus = this.onlineUsersCache.get(userId);
    if (cachedStatus) {
      return cachedStatus.isOnline;
    }
    
    return this.onlineUsers.has(userId);
  }

  private getDirectConversationStatusText(userId: number, isOnline: boolean): string {
    if (isOnline) {
      return 'En ligne';
    } else {
      const cachedStatus = this.onlineUsersCache.get(userId);
      if (cachedStatus && cachedStatus.lastSeen) {
        const timeDiff = Date.now() - cachedStatus.lastSeen.getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));
        
        if (minutesAgo < 1) {
          return 'Déconnecté à l\'instant';
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

  private getGroupOnlineCount(conversation: Conversation): number {
    return conversation.participants.filter(p => 
      p.userId !== this.currentUserId && this.isUserOnline(p.userId)
    ).length;
  }

  private getGroupStatusText(onlineCount: number, totalParticipants: number): string {
    if (totalParticipants === 0) return 'Aucun participant';
    if (onlineCount === 0) return 'Tous hors ligne';
    if (onlineCount === 1) return '1 en ligne';
    return `${onlineCount} en ligne`;
  }

  getConversationStatusText(window: QuickChatWindow): string {
    return window.onlineStatus?.statusText || this.getConversationStatus(window.conversation);
  }

  getUserStatusText(userId: number): string {
    const isOnline = this.isUserOnline(userId);
    return isOnline ? 'En ligne' : 'Hors ligne';
  }

  // ===== FIN NOUVELLE GESTION DES STATUTS =====

  private setupClickOutside() {
    document.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Fermer les emoji pickers si clic en dehors
      this.chatWindows.forEach(window => {
        if (window.showEmojiPicker && !target.closest('.emoji-picker') && !target.closest('.input-btn')) {
          window.showEmojiPicker = false;
        }
      });
    });
  }

  // ===== GESTION DES MESSAGES =====

private subscribeToMessages() {
    this.messagingService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(allMessages => {
        let hasUpdates = false;
        
        this.chatWindows.forEach(window => {
          const conversationMessages = allMessages
            .filter(m => m.conversationId === window.conversation.id)
            .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

          if (conversationMessages.length > 0) {
             if (!window.isMinimized && this.isWindowActive(window)) {
            this.processIncomingMessagesForAutoRead(window, conversationMessages);
          }
            const previousMessageCount = window.messages.length;
                      if (!window.isMinimized && this.activeWindows.has(window.conversation.id)) {
            const hasNewMessagesFromOthers = conversationMessages.some(m => 
              m.senderId !== this.currentUserId && 
              m.status !== 'READ'
            );
            
            if (hasNewMessagesFromOthers) {
              this.markMessagesAsReadInWindow(window);
            }
          }
        

            
            // CAS 1: Première charge de messages
            if (window.messages.length === 0) {
              console.log(`📥 First time loading messages for conversation ${window.conversation.id}`);
              window.messages = this.deduplicateMessages(conversationMessages);
              this.enableAutoScrollForWindow(window);
              this.scrollToBottomSmooth(window, 150);
              hasUpdates = true;
              return;
            }

            // CAS 2: Nouveaux messages
            const latestServerMessage = conversationMessages[conversationMessages.length - 1];
            const latestWindowMessage = window.messages[window.messages.length - 1];
            
            const hasNewMessage = !latestWindowMessage || 
              latestServerMessage.id !== latestWindowMessage.id ||
              new Date(latestServerMessage.sentAt).getTime() !== new Date(latestWindowMessage.sentAt).getTime();
            
            if (hasNewMessage) {
              const existingIds = new Set(window.messages.map(m => m.id));
              const newMessages = conversationMessages.filter(m => !existingIds.has(m.id));
              
              if (newMessages.length > 0) {
                console.log(`📨 Adding ${newMessages.length} new messages to conversation ${window.conversation.id}`);
                
                // Vérifier si l'utilisateur était en bas avant l'ajout
                const wasAtBottom = this.isUserAtBottom(window);
                
                // Ajouter les nouveaux messages
                window.messages = this.deduplicateMessages([...window.messages, ...newMessages])
                  .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
                
                // LOGIQUE D'AUTO-SCROLL AMÉLIORÉE
                const hasOwnNewMessage = newMessages.some(m => m.senderId === this.currentUserId);
                const hasOthersNewMessage = newMessages.some(m => m.senderId !== this.currentUserId);
                
                // Scroll automatique si :
                // 1. L'utilisateur a envoyé un message
                // 2. L'utilisateur était déjà en bas et a reçu un nouveau message
                // 3. La fenêtre n'est pas minimisée
                if (!window.isMinimized && (hasOwnNewMessage || (hasOthersNewMessage && wasAtBottom))) {
                  this.scrollToBottomSmooth(window, hasOwnNewMessage ? 100 : 200);
                }
                
                hasUpdates = true;
              }
            }
          }
        });
        
        if (hasUpdates) {
          this.cdr.detectChanges();
        }
      });
  }
  private isWindowActive(window: QuickChatWindow): boolean {
  return !window.isMinimized && 
         this.activeWindows.has(window.conversation.id) &&
         document.hasFocus(); // Vérifier aussi le focus du document
}
 private processIncomingMessagesForAutoRead(window: QuickChatWindow, messages: Message[]) {
  let hasUnreadFromOthers = false;

  messages.forEach(msg => {
    if (msg.senderId !== this.currentUserId && msg.status !== 'READ' && !window.isMinimized) {
      hasUnreadFromOthers = true;
    }
  });

  if (hasUnreadFromOthers) {
    this.messagingService.markAsRead(window.conversation.id).subscribe();
  }
}
private sendInstantReadReceipt(conversationId: number) {
  this.messagingService.markAsRead(conversationId).subscribe({
    next: () => {
      console.log(`⚡ Read receipt sent instantly for ${conversationId}`);
    }
  });
}
  
 private markMessagesAsReadInWindow(window: QuickChatWindow) {
  // Marquer localement
  window.messages.forEach(msg => {
    if (msg.senderId !== this.currentUserId && msg.status !== 'READ') {
      msg.status = 'READ';
    }
  });

  // Appel serveur sans délai
  if (!window.isMinimized) {
    this.messagingService.markAsRead(window.conversation.id).subscribe({
      next: () => {
        console.log(`✅ Messages marked as read for conversation ${window.conversation.id}`);
        window.conversation.unreadCount = 0;
      }
    });
  }
}
  
  
  private isUserAtBottom(window: QuickChatWindow): boolean {
    const index = this.chatWindows.indexOf(window);
    const messageContainer = document.querySelectorAll('.messages-area')[index] as HTMLElement;
    
    if (!messageContainer) return true;
    
    const scrollTop = messageContainer.scrollTop;
    const scrollHeight = messageContainer.scrollHeight;
    const clientHeight = messageContainer.clientHeight;
    
    // Considérer comme "en bas" si on est à moins de 50px du bas
    const threshold = 50;
    const isAtBottom = (scrollTop + clientHeight + threshold) >= scrollHeight;
    
    return isAtBottom;
  }

  // 4. NOUVELLE MÉTHODE: Activer l'auto-scroll pour une fenêtre
  private enableAutoScrollForWindow(window: QuickChatWindow) {
    this.autoScrollEnabled.set(window.conversation.id, true);
  }

  // 5. MÉTHODE AMÉLIORÉE: Scroll fluide vers le bas
  private scrollToBottomSmooth(window: QuickChatWindow, delay: number = 100) {
    const conversationId = window.conversation.id;
    
    // Annuler le timeout précédent s'il existe
    const existingTimeout = this.scrollTimeouts.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Programmer le nouveau scroll
    const newTimeout = setTimeout(() => {
      const index = this.chatWindows.indexOf(window);
      const messageContainer = document.querySelectorAll('.messages-area')[index] as HTMLElement;
      
      if (messageContainer) {
        // Scroll fluide vers le bas
        messageContainer.scrollTo({
          top: messageContainer.scrollHeight,
          behavior: 'smooth'
        });
        
        console.log(`📜 Auto-scrolled to bottom for conversation ${conversationId}`);
      }
      
      // Nettoyer le timeout
      this.scrollTimeouts.delete(conversationId);
    }, delay);
    
    this.scrollTimeouts.set(conversationId, newTimeout);
  }
  
  
  
  
  
  
  
  private forceRefreshMessages(window: QuickChatWindow) {
    console.log('🔄 Forcing refresh messages for conversation:', window.conversation.id);
    
    const wasAtBottom = this.isUserAtBottom(window);
    
    window.page = 0;
    window.hasMoreMessages = true;
    window.isLoading = true;
    
    const optimisticMessages = window.messages.filter(m => 
      typeof m.id === 'number' && m.id > Date.now() - 60000 && m.senderId === this.currentUserId
    );
    
    this.messagingService.getConversationMessages(
      window.conversation.id, 
      0, 
      20
    ).pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (messages) => {
        const serverMessages = this.deduplicateMessages(messages);
        const allMessages = [...serverMessages, ...optimisticMessages]
          .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        
        window.messages = this.deduplicateMessages(allMessages);
        window.isLoading = false;
        window.hasMoreMessages = messages.length === 20;
        
        // Auto-scroll seulement si l'utilisateur était en bas ou si c'est un nouveau message
        if (wasAtBottom || optimisticMessages.length > 0) {
          this.scrollToBottomSmooth(window, 200);
        }
        
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error in force refresh:', error);
        window.isLoading = false;
        
        setTimeout(() => {
          if (window.messages.length === 0) {
            this.loadMessages(window, false);
          }
        }, 3000);
        
        this.cdr.detectChanges();
      }
    });
  }


// ===== MÉTHODE 7: NOUVELLE - shouldRefreshMessages() =====
private shouldRefreshMessages(window: QuickChatWindow): boolean {
  // Toujours rafraîchir si aucun message
  if (window.messages.length === 0) {
    console.log('🔄 Should refresh: no messages');
    return true;
  }
  
  // Vérifier si le dernier message est trop ancien (plus de 5 minutes)
  const lastMessage = window.messages[window.messages.length - 1];
  if (lastMessage) {
    const timeDiff = Date.now() - new Date(lastMessage.sentAt).getTime();
    const shouldRefresh = timeDiff > 5 * 60 * 1000; // 5 minutes
    
    if (shouldRefresh) {
      console.log('🔄 Should refresh: last message too old', timeDiff / 1000 / 60, 'minutes ago');
    }
    
    return shouldRefresh;
  }
  
  console.log('🔄 Should refresh: no valid last message');
  return true;
}


  private hasNewMessagesForWindow(window: QuickChatWindow, newMessages: Message[]): boolean {
    if (window.messages.length === 0 && newMessages.length > 0) {
      return true;
    }

    if (newMessages.length > window.messages.length) {
      return true;
    }

    if (newMessages.length > 0 && window.messages.length > 0) {
      const latestNew = newMessages[newMessages.length - 1];
      const latestWindow = window.messages[window.messages.length - 1];
      
      return latestNew.id !== latestWindow.id || 
             latestNew.content !== latestWindow.content ||
             new Date(latestNew.sentAt).getTime() !== new Date(latestWindow.sentAt).getTime();
    }

    return false;
  }

  private deduplicateMessages(messages: Message[]): Message[] {
    const seen = new Set<string>();
    const unique: Message[] = [];

    for (const message of messages) {
      const key = message.id ? 
        message.id.toString() : 
        `${message.senderId}_${message.content}_${new Date(message.sentAt).getTime()}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(message);
      }
    }

    return unique;
  }

  private subscribeToTypingIndicators() {
    this.messagingService.typingIndicators$
      .pipe(takeUntil(this.destroy$))
      .subscribe(indicators => {
        this.chatWindows.forEach(window => {
          window.typingIndicators = indicators.filter(indicator => 
            indicator.conversationId === window.conversation.id && 
            indicator.userId !== this.currentUserId && 
            indicator.isTyping
          );
        });
      });
  }

  // ===== GESTION DES FENÊTRES DE CHAT =====

  openChat(conversation: Conversation) {
  console.log('🚀 Opening quick chat for conversation:', conversation.id);
  
  const existingWindow = this.chatWindows.find(w => 
    w.conversation.id === conversation.id
  );

  if (existingWindow) {
    console.log('📂 Existing window found, restoring...');
    existingWindow.isMinimized = false;
    
    // Mettre à jour le statut en ligne
    this.updateWindowOnlineStatus(existingWindow);
    
    // CORRECTION: Vérifier si on a besoin de recharger les messages
    if (existingWindow.messages.length === 0 || this.shouldRefreshMessages(existingWindow)) {
      console.log('🔄 Refreshing messages for existing window...');
      this.forceRefreshMessages(existingWindow);
    } else {
      // Scroller vers le bas même si pas de rechargement
      setTimeout(() => this.scrollToBottom(existingWindow), 100);
    }
    this.markAsReadOnOpen(existingWindow);
    return;
    // Marquer automatiquement comme lu quand on ouvre
    this.markConversationAsRead(conversation);
    return;
  }

  // Gérer le maximum de fenêtres
  if (this.chatWindows.length >= this.maxWindows) {
    console.log('🗂️ Maximum windows reached, closing oldest...');
    this.chatWindows.shift();
  }

  console.log('🆕 Creating new quick chat window...');
  const newWindow: QuickChatWindow = {
    conversation,
    messages: [],
    isMinimized: false,
    newMessage: '',
    typingIndicators: [],
    isLoading: true,
    hasMoreMessages: true,
    page: 0,
    isRecording: false,
    recordingDuration: 0,
    showEmojiPicker: false,
    onlineStatus: {}
  };

  // Mettre à jour le statut en ligne immédiatement
  this.updateWindowOnlineStatus(newWindow);
  
  this.chatWindows.push(newWindow);
  
  // CORRECTION: Chargement initial + backup retry
  this.loadMessages(newWindow);
  
  // Système de backup: si pas de messages après 1.5 secondes, forcer le rechargement
  setTimeout(() => {
    if (newWindow.messages.length === 0 && !newWindow.isLoading) {
      console.log('⚠️ No messages loaded after timeout, forcing refresh...');
      this.forceRefreshMessages(newWindow);
    }
  }, 1500);
    this.markAsReadOnOpen(newWindow);

  // Marquer comme lu dès l'ouverture
  this.markConversationAsRead(conversation);

  // Marquer la fenêtre comme active
  this.activeWindows.add(conversation.id);
  
  // Notifier le backend que la conversation est active
  this.notifyConversationActive(conversation.id, true);
}
private notifyConversationActive(conversationId: number, isActive: boolean) {
  if (isActive) {
    this.activeWindows.add(conversationId);
  } else {
    this.activeWindows.delete(conversationId);
  }
  
  // Envoyer le statut via WebSocket
  this.messagingService.sendConversationActiveStatus(conversationId, isActive);
}

private markAsReadOnOpen(chatWindow: QuickChatWindow) {
  if (chatWindow.conversation.unreadCount > 0) {
    console.log(`📂 Marking as read on quick chat open: ${chatWindow.conversation.id}`);

    // Mise à jour locale immédiate
    chatWindow.conversation.unreadCount = 0;

    // Appel serveur sans délai
    this.messagingService.markAsRead(chatWindow.conversation.id).subscribe({
      next: () => {
        window.dispatchEvent(new CustomEvent('conversationMarkedAsRead', {
          detail: {
            conversationId: chatWindow.conversation.id,
            source: 'quick-chat-open',
            timestamp: new Date(),
            unreadCount: 0
          }
        }));
      }
    });
  }
}




  private loadMessages(window: QuickChatWindow, append = false) {
  console.log(`🔄 Loading messages for conversation ${window.conversation.id}, page: ${window.page}, append: ${append}`);
  
  window.isLoading = true;
  
  this.messagingService.getConversationMessages(
    window.conversation.id, 
    window.page, 
    20
  ).pipe(takeUntil(this.destroy$))
  .subscribe({
    next: (messages) => {
      console.log(`📥 Received ${messages.length} messages from server for conversation ${window.conversation.id}`);
      
      if (append) {
        // Mode ajout (pagination) - éviter les doublons
        const existingIds = new Set(window.messages.map(m => m.id));
        const newMessages = messages.filter(m => !existingIds.has(m.id));
        
        if (newMessages.length > 0) {
          window.messages = [...newMessages, ...window.messages];
          console.log(`📋 Added ${newMessages.length} older messages`);
        }
      } else {
        // Chargement initial - préserver les messages optimistes
        const optimisticMessages = window.messages.filter(m => 
          typeof m.id === 'number' && m.id > Date.now() - 60000 && m.senderId === this.currentUserId
        );
        
        const serverMessages = this.deduplicateMessages(messages);
        
        // Fusionner les messages optimistes avec les messages du serveur
        const allMessages = [...serverMessages, ...optimisticMessages]
          .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        
        window.messages = this.deduplicateMessages(allMessages);
        
        console.log(`✅ Initial load complete: ${window.messages.length} total messages`);
      }
      
      window.hasMoreMessages = messages.length === 20;
      window.isLoading = false;
      
      // Scroller vers le bas seulement pour le chargement initial
      if (!append) {
        setTimeout(() => this.scrollToBottom(window), 200);
      }
      
      this.cdr.detectChanges();
    },
    error: (error) => {
      console.error('❌ Error loading messages for conversation', window.conversation.id, ':', error);
      window.isLoading = false;
      
      // NOUVEAU: Système de retry en cas d'erreur
      if (!append && window.messages.length === 0) {
        console.log('🔄 Retrying message load after error in 2 seconds...');
        setTimeout(() => {
          if (window.messages.length === 0) {
            this.loadMessages(window, false);
          }
        }, 2000);
      }
      
      this.cdr.detectChanges();
    }
  });
}



  loadMoreMessages(window: QuickChatWindow) {
    if (window.isLoading || !window.hasMoreMessages) return;
    
    window.page++;
    this.loadMessages(window, true);
  }
private markAsReadOnSend(chatWindow: QuickChatWindow) {
  if (chatWindow.conversation.unreadCount > 0) {
    console.log(`📤 Marking as read on message send: ${chatWindow.conversation.id}`);

    // Mise à jour locale immédiate
    chatWindow.conversation.unreadCount = 0;

    // Appel serveur sans délai
    this.messagingService.markAsRead(chatWindow.conversation.id).subscribe({
      next: () => {
        window.dispatchEvent(new CustomEvent('conversationMarkedAsRead', {
          detail: {
            conversationId: chatWindow.conversation.id,
            source: 'quick-chat-send',
            timestamp: new Date(),
            unreadCount: 0
          }
        }));
      },
      error: (err) => console.warn('⚠️ Could not mark as read on send:', err)
    });
  }
}
  // ===== ENVOI DE MESSAGES =====

  sendMessage(chatWindow: QuickChatWindow) {
  if (!chatWindow.newMessage.trim()) return;

  const messageContent = chatWindow.newMessage.trim();
  chatWindow.newMessage = '';

  // Activer l'auto-scroll avant l'envoi
  this.enableAutoScrollForWindow(chatWindow);

  this.messagingService.sendMessage({
    conversationId: chatWindow.conversation.id,
    content: messageContent,
    type: 'TEXT'
  }).subscribe({
    next: (message) => {
      // Vérifier si le message n'existe pas déjà
      const exists = chatWindow.messages.find(m => m.id === message.id);
      if (!exists) {
        chatWindow.messages.push(message);
        chatWindow.messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        
        // SCROLL IMMÉDIAT pour nos propres messages
        this.scrollToBottomSmooth(chatWindow, 50);
      }
      
      // NOUVEAU: Marquer comme lu seulement à l'envoi de message
      this.markAsReadOnSend(chatWindow);
    },
    error: (error) => {
      console.error('Erreur envoi message:', error);
      chatWindow.newMessage = messageContent;
      alert('Erreur lors de l\'envoi du message. Veuillez réessayer.');
    }
  });
}



  canSendMessage(window: QuickChatWindow): boolean {
    return window.newMessage.trim().length > 0 && !window.isRecording;
  }

  onKeyPress(event: KeyboardEvent, window: QuickChatWindow) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(window);
    }
  }

  // ===== GESTION DES FICHIERS =====

onTyping(chatWindow: QuickChatWindow) {
  this.messagingService.sendTypingIndicator(chatWindow.conversation.id, true);
   if (chatWindow.conversation.unreadCount > 0 || this.hasUnreadMessages(chatWindow)) {
    this.markMessagesAsReadInWindow(chatWindow);
  }
  if (!chatWindow.isMinimized && this.hasUnreadMessages(chatWindow)) {
    this.sendInstantReadReceipt(chatWindow.conversation.id);
  }
  

  // SUPPRIMER cette ligne :
  // this.markAsReadOnActivity(chatWindow);
  
  // Garder seulement l'événement de typing sans marquer comme lu
  window.dispatchEvent(new CustomEvent('quickChatActivity', {
    detail: { 
      conversationId: chatWindow.conversation.id, 
      type: 'typing',
      timestamp: new Date()
    }
  }));
}

private hasUnreadMessages(window: QuickChatWindow): boolean {
  return window.messages.some(m => 
    m.senderId !== this.currentUserId && 
    m.status !== 'READ'
  );
}
  // Marquer une conversation comme lue
  private markConversationAsRead(conversation: Conversation) {
  // Vérifier s'il y a vraiment des messages non lus
  if (!conversation.unreadCount || conversation.unreadCount === 0) {
    return; // Pas besoin de marquer comme lu
  }
  
  console.log(`📖 Marking conversation ${conversation.id} as read (${conversation.unreadCount} unread)`);
  
  // Mise à jour optimiste locale immédiate
  const originalUnreadCount = conversation.unreadCount;
  conversation.unreadCount = 0;
  
  // Appel serveur pour marquer comme lu
  this.messagingService.markAsRead(conversation.id).subscribe({
    next: () => {
      console.log('✅ Conversation marked as read successfully');
      
      // Émettre un événement global pour synchroniser avec les autres composants
      window.dispatchEvent(new CustomEvent('conversationRead', {
        detail: {
          conversationId: conversation.id,
          timestamp: new Date(),
          unreadCount: 0
        }
      }));
      
      this.cdr.detectChanges();
    },
    error: (error) => {
      console.warn('❌ Error marking conversation as read:', error);
      
      // Restaurer l'état original en cas d'erreur
      conversation.unreadCount = originalUnreadCount;
      this.cdr.detectChanges();
    }
  });
}

 


  triggerFileUpload(window: QuickChatWindow) {
    this.fileInput.nativeElement.click();
  }

  onFileSelect(event: Event, window: QuickChatWindow) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      if (file.size > 10 * 1024 * 1024) {
        alert('Fichier trop volumineux (max 10MB)');
        return;
      }

      this.messagingService.uploadFile(file).subscribe({
        next: (url) => {
          this.messagingService.sendMessage({
            conversationId: window.conversation.id,
            content: file.name,
            type: this.getFileType(file),
            attachmentUrl: url
          }).subscribe({
            next: (message) => {
              const exists = window.messages.find(m => m.id === message.id);
              if (!exists) {
                window.messages.push(message);
                setTimeout(() => this.scrollToBottom(window), 100);
              }
            }
          });
        },
        error: (error) => {
          console.error('Erreur upload:', error);
          alert('Erreur lors de l\'upload du fichier');
        }
      });

      input.value = '';
    }
  }

  private getFileType(file: File): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('video/')) return 'VIDEO';
    if (file.type.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
  }

  // ===== GESTION DE L'ENREGISTREMENT VOCAL =====

  async startRecording(window: QuickChatWindow) {
  if (window.isRecording) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    this.audioChunks = [];
    window.isRecording = true;
    window.recordingDuration = 0;
    this.shouldProcessRecording = false; // Réinitialiser le flag

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      // CORRECTION: Vérifier le flag avant de traiter
      if (this.shouldProcessRecording) {
        this.handleRecordingStop(window);
      } else {
        console.log('🚫 Enregistrement annulé - pas de traitement');
        this.cleanupRecordingData(window);
      }
      
      // Toujours nettoyer le stream
      stream.getTracks().forEach(track => track.stop());
    };

    this.mediaRecorder.start();
    
    // Timer pour la durée d'enregistrement
    this.recordingTimer = setInterval(() => {
      window.recordingDuration++;
      
      // Arrêt automatique après 5 minutes
      if (window.recordingDuration >= 300) {
        this.sendRecording(window);
      }
    }, 1000);

  } catch (error) {
    console.error('Erreur accès microphone:', error);
    alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    window.isRecording = false;
  }
}


 stopRecording(window: QuickChatWindow) {
  if (!window.isRecording || !this.mediaRecorder) return;

  // CORRECTION: Marquer que l'enregistrement doit être traité
  this.shouldProcessRecording = true;
  window.isRecording = false;
  
  if (this.recordingTimer) {
    clearInterval(this.recordingTimer);
  }

  if (this.mediaRecorder.state !== 'inactive') {
    this.mediaRecorder.stop();
  }
}

  cancelRecording(window: QuickChatWindow) {
  if (!window.isRecording) return;

  console.log('🚫 Annulation de l\'enregistrement');
  
  // CORRECTION: Marquer que l'enregistrement NE doit PAS être traité
  this.shouldProcessRecording = false;
  window.isRecording = false;
  
  if (this.recordingTimer) {
    clearInterval(this.recordingTimer);
  }

  // Arrêter le MediaRecorder sans traiter les données
  if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
    this.mediaRecorder.stop();
  }
  
  // Nettoyer immédiatement les données
  this.cleanupRecordingData(window);
}
private cleanupRecordingData(window: QuickChatWindow) {
  window.recordingDuration = 0;
  this.audioChunks = [];
  this.shouldProcessRecording = false;
  
  console.log('🧹 Données d\'enregistrement nettoyées');
}

private handleRecordingStop(window: QuickChatWindow) {
  if (this.audioChunks.length === 0) return;

  const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
  const recordedDuration = window.recordingDuration;
  const durationText = this.formatRecordingTime(recordedDuration);
  
  const audioFile = new File([audioBlob], `vocal-${Date.now()}.webm`, {
    type: 'audio/webm'
  });

  // CORRECTION: NE PAS ajouter le message manuellement à window.messages
  // Laisser le WebSocket s'en charger via subscribeToMessages()
  
  this.messagingService.uploadFile(audioFile).subscribe({
    next: (url) => {
      this.messagingService.sendMessage({
        conversationId: window.conversation.id,
        content: `Message vocal (${durationText})`,
        type: 'AUDIO',
        attachmentUrl: url
      }).subscribe({
        next: (message) => {
          // SUPPRIMÉ: L'ajout manuel du message
          // window.messages.push(message); // ❌ CAUSE LA DUPLICATION
          // Le message sera ajouté automatiquement via subscribeToMessages()
          
          console.log('✅ Message vocal envoyé, ID:', message.id);
          // Le scroll sera géré par subscribeToMessages() aussi
        },
        error: (error) => {
          console.error('Erreur envoi message vocal:', error);
          alert('Erreur lors de l\'envoi du message vocal');
        }
      });
    },
    error: (error) => {
      console.error('Erreur upload audio:', error);
      alert('Erreur lors de l\'envoi du message vocal');
    }
  });

  // Nettoyer les données d'enregistrement
  window.recordingDuration = 0;
  this.audioChunks = [];
}


  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private cleanupRecording() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  // ===== GESTION DES EMOJIS =====

  toggleEmojiPicker(window: QuickChatWindow) {
    // Fermer les autres emoji pickers
    this.chatWindows.forEach(w => {
      if (w !== window) {
        w.showEmojiPicker = false;
      }
    });
    
    window.showEmojiPicker = !window.showEmojiPicker;
  }

  insertEmoji(window: QuickChatWindow, emoji: string) {
    window.newMessage += emoji;
    window.showEmojiPicker = false;
  }

  getPopularEmojis(): string[] {
    return [
      '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
      '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗',
      '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨',
      '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞',
      '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫',
      '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
      '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐'
    ];
  }

  // ===== GESTION DU MODAL D'IMAGE =====

  openImageModal(url?: string, title?: string) {
    if (!url) return;
    
    this.currentImageUrl = url;
    this.currentImageTitle = title || 'Image';
    this.showImageModal = true;
    
    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden';
  }

  closeImageModal() {
    this.showImageModal = false;
    this.currentImageUrl = '';
    this.currentImageTitle = '';
    
    // Restaurer le scroll du body
    document.body.style.overflow = '';
  }

  downloadImage() {
    if (!this.currentImageUrl) return;
    
    const link = document.createElement('a');
    link.href = this.currentImageUrl;
    link.download = this.currentImageTitle || 'image';
    link.click();
  }

  openImageInTab() {
    if (!this.currentImageUrl) return;
    
    window.open(this.currentImageUrl, '_blank');
  }

  // ===== GESTION AUDIO =====

  toggleAudioPlay(event: Event, audioUrl?: string) {
    if (!audioUrl) return;
    
    event.preventDefault();
    const button = event.target as HTMLElement;
    const audioContainer = button.closest('.audio-message');
    const audioElement = audioContainer?.querySelector('.audio-element') as HTMLAudioElement;
    
    if (!audioElement) return;
    
    if (audioElement.paused) {
      audioElement.play();
      button.innerHTML = '<span class="play-icon">⏸</span>';
    } else {
      audioElement.pause();
      button.innerHTML = '<span class="play-icon">▶</span>';
    }
  }

  onAudioEnded(event: Event) {
    const audioElement = event.target as HTMLAudioElement;
    const audioContainer = audioElement.closest('.audio-message');
    const button = audioContainer?.querySelector('.audio-play-btn');
    
    if (button) {
      button.innerHTML = '<span class="play-icon">▶</span>';
    }
  }
private getAudioDuration(audioUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = audioUrl;
      
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
        audio.src = ''; // Libérer les ressources
      };
      
      const onLoadedMetadata = () => {
        const duration = audio.duration;
        if (isNaN(duration) || !isFinite(duration)) {
          cleanup();
          resolve('0:00');
          return;
        }
        
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        cleanup();
        resolve(formatted);
      };
      
      const onError = () => {
        cleanup();
        resolve('0:00');
      };
      
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('error', onError);
      
      // Timeout après 5 secondes
      setTimeout(() => {
        cleanup();
        resolve('0:00');
      }, 5000);
    });
  }

 formatAudioDuration(audioUrl?: string): string {
    if (!audioUrl) return '0:00';
    
    // Retourner la durée du cache si disponible
    const cachedDuration = this.audioDurations.get(audioUrl);
    if (cachedDuration) {
      return cachedDuration;
    }
    
    // Si pas en cache, lancer le chargement asynchrone et retourner "Loading..."
    this.loadAudioDurationAsync(audioUrl);
    return 'Chargement...';
  }
  
  // Méthode asynchrone pour charger la durée
  private async loadAudioDurationAsync(audioUrl: string): Promise<void> {
    try {
      const duration = await this.getAudioDuration(audioUrl);
      this.audioDurations.set(audioUrl, duration);
      
      // Déclencher la détection de changements pour mettre à jour l'affichage
      this.cdr.detectChanges();
    } catch (error) {
      console.warn('Erreur chargement durée audio:', error);
      this.audioDurations.set(audioUrl, '0:00');
      this.cdr.detectChanges();
    }
  }

  getFileSize(message: Message): string {
    // Cette méthode devrait récupérer la taille réelle du fichier
    // Pour l'instant, on retourne une taille par défaut
    return '';
  }

  // ===== MÉTHODES UTILITAIRES =====

onScroll(event: Event, chatWindow: QuickChatWindow) {
  const element = event.target as HTMLElement;
  
  if (element.scrollTop < 100 && chatWindow.hasMoreMessages && !chatWindow.isLoading) {
    this.loadMoreMessages(chatWindow);
  }
  
  const isAtBottom = this.isUserAtBottom(chatWindow);
  if (!isAtBottom) {
    this.autoScrollEnabled.set(chatWindow.conversation.id, false);
  } else {
    this.autoScrollEnabled.set(chatWindow.conversation.id, true);
    
    // AJOUTER: Si on scroll en bas, marquer comme lu instantanément
    if (this.hasUnreadMessages(chatWindow)) {
      this.sendInstantReadReceipt(chatWindow.conversation.id);
    }
  }
}


private setupWindowClickListener() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const chatWindow = target.closest('.chat-window');
    
    if (chatWindow) {
      const windowIndex = Array.from(document.querySelectorAll('.chat-window')).indexOf(chatWindow as Element);
      if (windowIndex >= 0 && windowIndex < this.chatWindows.length) {
        const window = this.chatWindows[windowIndex];
        if (!window.isMinimized && this.hasUnreadMessages(window)) {
          this.sendInstantReadReceipt(window.conversation.id);
        }
      }
    }
  });
}

 toggleMinimize(chatWindow: QuickChatWindow) {
  const wasMinimized = chatWindow.isMinimized;
  chatWindow.isMinimized = !chatWindow.isMinimized;
  
  if (wasMinimized && !chatWindow.isMinimized) {
    // Fenêtre agrandie, marquer comme active et lu
    this.activeWindows.add(chatWindow.conversation.id);
    this.notifyConversationActive(chatWindow.conversation.id, true);
    
    if (this.hasUnreadMessages(chatWindow)) {
      this.markMessagesAsReadInWindow(chatWindow);
    }
    
    setTimeout(() => this.scrollToBottomSmooth(chatWindow, 300), 350);
  } else if (!wasMinimized && chatWindow.isMinimized) {
    // Fenêtre minimisée, marquer comme inactive
    this.activeWindows.delete(chatWindow.conversation.id);
    this.notifyConversationActive(chatWindow.conversation.id, false);
  }
}

  closeChat(window: QuickChatWindow) {
    this.activeWindows.delete(window.conversation.id);
  this.notifyConversationActive(window.conversation.id, false);
    const index = this.chatWindows.indexOf(window);
    if (index > -1) {
      this.chatWindows.splice(index, 1);
    }
  }

  openInMessenger(window: QuickChatWindow) {
    const currentUrl = this.router.url;
    
    if (currentUrl.includes('producer')) {
      this.router.navigate(['/producer/messenger']);
    } else if (currentUrl.includes('receiver')) {
      this.router.navigate(['/receiver/messenger']);
    }
    
    setTimeout(() => {
      this.messagingService.setCurrentConversation(window.conversation);
    }, 500);
    
    this.closeChat(window);
  }

  private scrollToBottom(window: QuickChatWindow) {
    const index = this.chatWindows.indexOf(window);
    const element = document.querySelectorAll('.messages-area')[index] as HTMLElement;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }

  isMessengerPage(): boolean {
    return this.router.url.includes('/messenger');
  }

  isOwnMessage(message: Message): boolean {
    return message.senderId === this.currentUserId;
  }

  trackByMessageId(index: number, message: Message): number {
    return message.id || index;
  }

  getWindowPosition(index: number): number {
    return 25 + (index * 365);
  }

getWindowPositionCompact(index: number): number {
  return 10 + (index * 320); /* Espacement très compact */
}
getWindowPositionAdaptive(index: number): number {
  const baseOffset = 15;
  const windowCount = this.chatWindows.length;
  
  // Plus il y a de fenêtres, plus l'espacement se réduit
  let spacing: number;
  if (windowCount <= 2) {
    spacing = 365; // Espacement normal pour 1-2 fenêtres
  } else if (windowCount === 3) {
    spacing = 320; // Espacement réduit pour 3 fenêtres
  } else {
    spacing = 280; // Espacement minimal pour 4+ fenêtres
  }
  
  return baseOffset + (index * spacing);
}


getConversationName(conversation: Conversation): string {
  console.log('🔍 Getting conversation name for:', {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name,
    participants: conversation.participants,
    currentUserId: this.currentUserId
  });

  if (conversation.type === 'DIRECT') {
    // Pour les conversations directes, toujours afficher le nom de l'AUTRE participant
    const otherParticipant = conversation.participants.find(
      p => p.userId !== this.currentUserId
    );
    
    if (otherParticipant) {
      const displayName = otherParticipant.userName || `Utilisateur ${otherParticipant.userId}`;
      console.log('✅ QuickChat - Display name for direct conversation:', displayName);
      return displayName;
    }
    
    // Fallback: analyser le nom de la conversation si pas d'autre participant
    if (conversation.name && conversation.name.includes(' et ')) {
      const parts = conversation.name.split(' et ');
      // Essayer de deviner quel nom n'est pas le nôtre
      // Retourner la deuxième partie par défaut (souvent l'autre utilisateur)
      const fallbackName = parts[1]?.trim() || parts[0]?.trim() || 'Discussion';
      console.log('⚠️ QuickChat - Using fallback name:', fallbackName);
      return fallbackName;
    }
    
    return conversation.name || 'Discussion directe';
  }
  
  // Pour les groupes et conversations de compétence, garder le nom original
  return conversation.name || 'Conversation';
}


getConversationAvatar(conversation: Conversation): string {
  if (conversation.type === 'SKILL_GROUP' && conversation.skillImageUrl) {
    return conversation.skillImageUrl.startsWith('http') ? 
      conversation.skillImageUrl : 
      `http://localhost:8822${conversation.skillImageUrl}`;
  }
  
  if (conversation.type === 'DIRECT') {
    // Pour les conversations directes, utiliser l'avatar de l'AUTRE participant
    const otherParticipant = conversation.participants.find(
      p => p.userId !== this.currentUserId
    );
    
    if (otherParticipant?.avatar) {
      return otherParticipant.avatar.startsWith('http') ? 
        otherParticipant.avatar : 
        `http://localhost:8822${otherParticipant.avatar}`;
    }
    
    // Générer un avatar pour l'autre participant
    if (otherParticipant) {
      return this.generateAvatar(otherParticipant.userName);
    }
  }
  
  // Fallback : générer un avatar basé sur le nom affiché
  return this.generateAvatar(this.getConversationName(conversation));
}


  getConversationStatus(conversation: Conversation): string {
  if (conversation.type === 'DIRECT') {
    // Pour les conversations directes, vérifier le statut de l'AUTRE participant
    const otherParticipant = conversation.participants.find(p => p.userId !== this.currentUserId);
    if (otherParticipant) {
      const isOnline = this.isUserOnline(otherParticipant.userId);
      return isOnline ? 'En ligne' : 'Hors ligne';
    }
  } else {
    // Pour les groupes, compter les participants en ligne (excluant nous-même)
    const onlineCount = conversation.participants
      .filter(p => p.userId !== this.currentUserId && this.isUserOnline(p.userId))
      .length;
    return `${onlineCount} en ligne`;
  }
  
  return 'Statut inconnu';
}
shouldShowSenderInfo(message: Message, conversation: Conversation): boolean {
  // Ne jamais afficher les infos pour nos propres messages
  if (this.isOwnMessage(message)) {
    return false;
  }
  
  // Dans les conversations directes, pas besoin d'afficher le nom (on sait que c'est l'autre personne)
  if (conversation.type === 'DIRECT') {
    return false;
  }
  
  // Dans les groupes et conversations de compétence, afficher le nom
  return true;
}

// 5. AJOUTER une méthode pour obtenir l'avatar du message
getMessageAvatar(message: Message, conversation: Conversation): string {
  // Pas d'avatar pour nos propres messages
  if (this.isOwnMessage(message)) {
    return '';
  }
  
  // Trouver le participant correspondant
  const participant = conversation.participants.find(p => p.userId === message.senderId);
  
  if (participant?.avatar) {
    return participant.avatar.startsWith('http') ? 
      participant.avatar : 
      `http://localhost:8822${participant.avatar}`;
  }
  
  // Avatar généré pour l'expéditeur
  return this.generateAvatar(message.senderName);
}

// 6. CORRIGER updateWindowOnlineStatus() pour mieux gérer les statuts
private updateWindowOnlineStatus(window: QuickChatWindow) {
  const conversation = window.conversation;
  
  if (conversation.type === 'DIRECT') {
    // Trouver l'AUTRE participant (pas nous)
    const otherUser = conversation.participants.find(p => p.userId !== this.currentUserId);
    if (otherUser) {
      const isOnline = this.isUserOnline(otherUser.userId);
      window.onlineStatus = {
        isDirectOnline: isOnline,
        statusText: this.getDirectUserStatusText(otherUser.userId, isOnline)
      };
    }
  } else if (conversation.type === 'GROUP' || conversation.type === 'SKILL_GROUP') {
    const onlineCount = this.getGroupOnlineCount(conversation);
    const totalParticipants = conversation.participants.filter(p => p.userId !== this.currentUserId).length;
    
    window.onlineStatus = {
      onlineCount,
      totalParticipants,
      statusText: this.getGroupStatusText(onlineCount, totalParticipants)
    };
  }
}

// 7. AJOUTER méthode pour obtenir le statut d'un utilisateur direct
private getDirectUserStatusText(userId: number, isOnline: boolean): string {
  if (isOnline) {
    return 'En ligne';
  } else {
    const cachedStatus = this.onlineUsersCache.get(userId);
    if (cachedStatus && cachedStatus.lastSeen) {
      const timeDiff = Date.now() - cachedStatus.lastSeen.getTime();
      const minutesAgo = Math.floor(timeDiff / (1000 * 60));
      
      if (minutesAgo < 1) {
        return 'À l\'instant';
      } else if (minutesAgo < 60) {
        return `il y a ${minutesAgo} min`;
      } else if (minutesAgo < 1440) {
        const hoursAgo = Math.floor(minutesAgo / 60);
        return `il y a ${hoursAgo}h`;
      }
    }
    return 'Hors ligne';
  }
}
  formatTime(date: Date): string {
    const messageDate = new Date(date);
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  generateAvatar(name: string): string {
    const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
    const colorIndex = Math.abs(this.hashCode(name)) % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIndex]}&color=fff&size=100&bold=true`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }

  getTypingUsers(window: QuickChatWindow): TypingIndicator[] {
    return window.typingIndicators.filter(indicator => 
      indicator.userId !== this.currentUserId && indicator.isTyping
    );
  }

  getTypingText(window: QuickChatWindow): string {
    const typingUsers = this.getTypingUsers(window);
    
    if (typingUsers.length === 0) return '';
    
    if (typingUsers.length === 1) {
      return `${typingUsers[0].userName} écrit...`;
    }
    
    if (typingUsers.length === 2) {
      return `${typingUsers[0].userName} et ${typingUsers[1].userName} écrivent...`;
    }
    
    return `${typingUsers.length} personnes écrivent...`;
  }
  // Ajouter cette méthode dans GlobalQuickChatComponent

sendRecording(window: QuickChatWindow) {
  if (!window.isRecording || !this.mediaRecorder) {
    console.warn('Aucun enregistrement en cours');
    return;
  }

  // Arrêter l'enregistrement et déclencher le traitement
  this.stopRecording(window);
  
  // Le traitement de l'envoi se fait automatiquement dans handleRecordingStop()
  // qui est appelé par l'événement 'onstop' du MediaRecorder
}

// Alternative plus explicite si vous voulez plus de contrôle :
async sendRecordingAlternative(window: QuickChatWindow) {
  if (!window.isRecording || !this.mediaRecorder || this.audioChunks.length === 0) {
    console.warn('Aucun enregistrement valide à envoyer');
    return;
  }

  try {
    const recordedDuration = window.recordingDuration;
    const durationText = this.formatRecordingTime(recordedDuration);
    
    window.isRecording = false;
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const audioFile = new File([audioBlob], `vocal-${Date.now()}.webm`, {
      type: 'audio/webm'
    });

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    window.isLoading = true;

    this.messagingService.uploadFile(audioFile).subscribe({
      next: (url) => {
        this.messagingService.sendMessage({
          conversationId: window.conversation.id,
          content: `Message vocal (${durationText})`,
          type: 'AUDIO',
          attachmentUrl: url
        }).subscribe({
          next: (message) => {
            // CORRECTION: SUPPRIMER l'ajout manuel
            // Le message sera ajouté via WebSocket dans subscribeToMessages()
            console.log('✅ Message vocal envoyé via alternative method, ID:', message.id);
            window.isLoading = false;
          },
          error: (error) => {
            console.error('Erreur envoi message vocal:', error);
            alert('Erreur lors de l\'envoi du message vocal');
            window.isLoading = false;
          }
        });
      },
      error: (error) => {
        console.error('Erreur upload audio:', error);
        alert('Erreur lors de l\'upload du fichier audio');
        window.isLoading = false;
      }
    });

    window.recordingDuration = 0;
    this.audioChunks = [];
    
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'enregistrement:', error);
    window.isRecording = false;
    window.isLoading = false;
    alert('Erreur lors de l\'envoi du message vocal');
  }
}
}