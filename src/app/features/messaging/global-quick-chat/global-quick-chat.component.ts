// global-quick-chat.component.ts - VERSION REFACTORISÉE COMPLÈTE
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
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
        
        <!-- Header -->
        <div class="chat-header" (click)="toggleMinimize(window)">
          <div class="header-left">
            <img 
              [src]="getConversationAvatar(window.conversation)" 
              [alt]="getConversationName(window.conversation)"
              class="conversation-avatar"
              onerror="this.src = generateAvatar(getConversationName(window.conversation))">
            <div class="header-info">
              <span class="conversation-name">{{ getConversationName(window.conversation) }}</span>
              <span class="conversation-status">{{ getConversationStatus(window.conversation) }}</span>
            </div>
          </div>
          
          <div class="header-actions">
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
                
                <!-- Avatar pour les messages des autres uniquement -->
                <img 
                  *ngIf="!isOwnMessage(message)"
                  [src]="message.senderAvatar || generateAvatar(message.senderName)" 
                  [alt]="message.senderName"
                  class="message-avatar"
                  onerror="this.src = generateAvatar(message.senderName)">
                
                <!-- Bulle de message -->
                <div class="message-bubble">
                  <!-- Nom du sender pour les messages des autres uniquement -->
                  <div class="message-sender" *ngIf="!isOwnMessage(message)">
                    {{ message.senderName }}
                  </div>
                  
                  <!-- Contenu selon le type -->
                  <div class="message-content">
                    <!-- Texte -->
                    <p *ngIf="message.type === 'TEXT'">{{ message.content }}</p>
                    
                    <!-- Image -->
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
                    
                    <!-- Vidéo -->
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

                    <!-- Audio -->
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
                          <span class="audio-name">{{ message.content || 'Message vocal' }}</span>
                          <span class="audio-duration">{{ formatAudioDuration(message.attachmentUrl) }}</span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- Fichier -->
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
                    <!-- Statut uniquement pour nos messages -->
                    <span class="message-status" *ngIf="isOwnMessage(message)">
                      <span *ngIf="message.status === 'SENT'" class="status-sent"></span>
                      <span *ngIf="message.status === 'DELIVERED'" class="status-delivered"></span>
                      <span *ngIf="message.status === 'READ'" class="status-read"></span>
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
                <button class="stop-recording" (click)="stopRecording(window)">⏹ Arrêter</button>
              </div>
            </div>

            <div class="input-wrapper" *ngIf="!window.isRecording">
              
              <!-- Bouton fichier -->
              <button class="input-btn" (click)="triggerFileUpload(window)" title="Joindre un fichier">
                📎
              </button>
              <input 
                type="file" 
                #fileInput
                style="display: none"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                (change)="onFileSelect($event, window)">
              
              <!-- Zone de texte -->
              <input 
                type="text"
                [(ngModel)]="window.newMessage"
                (keypress)="onKeyPress($event, window)"
                (input)="onTyping(window)"
                placeholder="Écrivez un message..."
                class="message-input"
                maxlength="1000">
              
              <!-- Bouton emoji -->
              <button 
                class="input-btn" 
                (click)="toggleEmojiPicker(window)"
                [class.active]="window.showEmojiPicker"
                title="Emojis">
                😊
              </button>

              <!-- Bouton vocal -->
              <button 
                class="input-btn voice-btn" 
                (mousedown)="startRecording(window)"
                (mouseup)="stopRecording(window)"
                (touchstart)="startRecording(window)"
                (touchend)="stopRecording(window)"
                title="Maintenir pour enregistrer un message vocal">
                🎤
              </button>
              
              <!-- Bouton envoyer -->
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
    /* ========== STRUCTURE DE BASE ========== */
    .quick-chat-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1500;
      display: flex;
      flex-direction: row-reverse;
      gap: 10px;
      pointer-events: none;
    }

    .chat-window {
      width: 400px;
      height: 520px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      pointer-events: all;
      transition: height 0.3s ease;
      overflow: hidden;
    }

    .chat-window.minimized {
      height: 60px;
    }

    /* ========== HEADER ========== */
    .chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 15px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .conversation-avatar {
      width: 35px;
      height: 35px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.3);
      object-fit: cover;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .conversation-name {
      font-weight: 600;
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .conversation-status {
      font-size: 0.75rem;
      opacity: 0.9;
    }

    .header-actions {
      display: flex;
      gap: 5px;
    }

    .action-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      color: white;
      font-size: 0.9rem;
    }

    .action-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.1);
    }

    /* ========== BODY & MESSAGES ========== */
    .chat-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      background: #f8f9fa;
      scroll-behavior: smooth;
    }

    .messages-wrapper {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ========== REFACTORING DESIGN MESSAGES ========== */
    
    .message-bubble-container {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 6px 0;
      width: 100%;
      clear: both;
    }

    /* Messages utilisateur connecté - DROITE BLEU */
    .message-bubble-container.own {
      flex-direction: row-reverse;
      justify-content: flex-start;
      margin-left: 60px;
      margin-right: 10px;
    }

    /* Messages des autres - GAUCHE GRIS */
    .message-bubble-container:not(.own) {
      flex-direction: row;
      justify-content: flex-start;
      margin-left: 10px;
      margin-right: 60px;
    }

    /* AVATARS */
    .message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-top: 2px;
      border: 2px solid #e9ecef;
    }

    /* ========== BULLES DE MESSAGE ========== */
    .message-bubble {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 18px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
      word-wrap: break-word;
      position: relative;
      font-size: 0.95rem;
      line-height: 1.4;
    }

    /* Bulle utilisateur connecté - STYLE BLEU */
    .message-bubble-container.own .message-bubble {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-bottom-right-radius: 6px;
    }

    /* Bulle des autres - STYLE GRIS */
    .message-bubble-container:not(.own) .message-bubble {
      background: white;
      border: 1px solid #e9ecef;
      color: #2d3436;
      border-bottom-left-radius: 6px;
    }

    /* NOM DE L'EXPÉDITEUR */
    .message-sender {
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 6px;
      color: #6c757d;
      opacity: 0.9;
    }

    /* Cacher le nom pour nos messages */
    .message-bubble-container.own .message-sender {
      display: none;
    }

    /* CONTENU DES MESSAGES */
    .message-content p {
      margin: 0;
      word-wrap: break-word;
      line-height: 1.4;
    }

    /* ========== MÉTADONNÉES DES MESSAGES ========== */
    .message-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-size: 0.7rem;
    }

    /* Meta pour utilisateur connecté - DROITE BLANC */
    .message-bubble-container.own .message-meta {
      justify-content: flex-end;
      color: rgba(255, 255, 255, 0.85);
    }

    /* Meta pour les autres - GAUCHE GRIS */
    .message-bubble-container:not(.own) .message-meta {
      justify-content: flex-start;
      color: #95a5a6;
    }

    .message-time {
      opacity: 0.9;
      font-weight: 500;
    }

    /* ========== STATUTS DE MESSAGE (CHECKMARKS) ========== */
    .message-status {
      display: inline-flex;
      align-items: center;
      margin-left: 4px;
      font-weight: 600;
    }

    /* Cacher statuts pour messages des autres */
    .message-bubble-container:not(.own) .message-status {
      display: none;
    }

    /* Un check - Envoyé */
    .message-bubble-container.own .status-sent::after {
      content: '✓';
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.8rem;
    }

    /* Double check gris - Délivré */
    .message-bubble-container.own .status-delivered::after {
      content: '✓✓';
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.8rem;
      letter-spacing: -2px;
    }

    /* Double check blanc - Lu */
    .message-bubble-container.own .status-read::after {
      content: '✓✓';
      color: #ffffff;
      font-size: 0.8rem;
      letter-spacing: -2px;
      font-weight: bold;
      text-shadow: 0 0 2px rgba(255,255,255,0.3);
    }

    /* ========== MÉDIAS DANS MESSAGES ========== */
    
    /* IMAGES */
    .image-message {
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      max-width: 280px;
    }

    .message-image {
      width: 100%;
      height: auto;
      max-height: 200px;
      object-fit: cover;
      cursor: pointer;
      border-radius: 8px;
      transition: transform 0.3s ease;
    }

    .message-image:hover {
      transform: scale(1.02);
    }

    .image-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      cursor: pointer;
    }

    .image-message:hover .image-overlay {
      opacity: 1;
    }

    .zoom-icon {
      font-size: 1.5rem;
      color: white;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }

    .image-caption, .video-caption {
      margin: 6px 0 0 0;
      font-size: 0.85rem;
      opacity: 0.9;
      font-style: italic;
    }

    /* VIDÉOS */
    .video-message {
      max-width: 280px;
    }

    .message-video {
      width: 100%;
      height: auto;
      max-height: 200px;
      border-radius: 8px;
    }

    /* AUDIO */
    .audio-message {
      min-width: 220px;
    }

    .audio-player {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 20px;
      transition: all 0.3s ease;
    }

    /* Audio dans messages des autres */
    .message-bubble-container:not(.own) .audio-player {
      background: rgba(0,0,0,0.05);
    }

    /* Audio dans nos messages */
    .message-bubble-container.own .audio-player {
      background: rgba(255,255,255,0.2);
    }

    .audio-play-btn {
      background: #667eea;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: all 0.3s ease;
      font-size: 0.9rem;
    }

    .audio-play-btn:hover {
      background: #5a6fd8;
      transform: scale(1.05);
    }

    .audio-element {
      display: none;
    }

    .audio-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .audio-name {
      font-size: 0.85rem;
      font-weight: 500;
    }

    .audio-duration {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    /* FICHIERS */
    .message-file {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      text-decoration: none;
      color: inherit;
      transition: all 0.3s ease;
      font-size: 0.9rem;
    }

    /* Fichiers dans messages des autres */
    .message-bubble-container:not(.own) .message-file {
      background: rgba(0,0,0,0.05);
      color: #2d3436;
    }

    .message-bubble-container:not(.own) .message-file:hover {
      background: rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }

    /* Fichiers dans nos messages */
    .message-bubble-container.own .message-file {
      background: rgba(255,255,255,0.2);
      color: white;
    }

    .message-bubble-container.own .message-file:hover {
      background: rgba(255,255,255,0.3);
      transform: translateY(-1px);
    }

    .file-icon {
      font-size: 1.4rem;
    }

    .file-name {
      font-weight: 500;
      flex: 1;
    }

    .file-size {
      font-size: 0.75rem;
      opacity: 0.7;
    }

    /* ========== INDICATEUR DE FRAPPE ========== */
    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      color: #636e72;
      font-size: 0.85rem;
      margin-left: 42px;
    }

    .typing-dots {
      display: flex;
      gap: 4px;
      background: white;
      padding: 8px 12px;
      border-radius: 18px;
      border: 1px solid #e9ecef;
    }

    .typing-dots span {
      width: 8px;
      height: 8px;
      background: #636e72;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out;
    }

    .typing-dots span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-dots span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes bounce {
      0%, 60%, 100% { 
        transform: translateY(0);
        opacity: 0.4;
      }
      30% { 
        transform: translateY(-10px);
        opacity: 1;
      }
    }

    /* ========== PICKER EMOJI ========== */
    .emoji-picker {
      position: absolute;
      bottom: 70px;
      left: 15px;
      right: 15px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
      z-index: 10;
    }

    .emoji-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 15px;
      border-bottom: 1px solid #e9ecef;
      font-weight: 600;
    }

    .emoji-header button {
      background: none;
      border: none;
      font-size: 1.2rem;
      cursor: pointer;
      opacity: 0.7;
    }

    .emoji-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 8px;
      padding: 15px;
      max-height: 150px;
      overflow-y: auto;
    }

    .emoji-item {
      font-size: 1.3rem;
      cursor: pointer;
      text-align: center;
      padding: 5px;
      border-radius: 5px;
      transition: all 0.2s ease;
    }

    .emoji-item:hover {
      background: #f0f2f5;
      transform: scale(1.2);
    }

    /* ========== INDICATEUR D'ENREGISTREMENT ========== */
    .recording-indicator {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 15px;
      margin: 10px 15px;
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

    .recording-actions {
      display: flex;
      gap: 10px;
    }

    .cancel-recording, .stop-recording {
      background: rgba(255,255,255,0.2);
      border: none;
      padding: 6px 12px;
      border-radius: 15px;
      color: white;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .cancel-recording:hover, .stop-recording:hover {
      background: rgba(255,255,255,0.3);
    }

    /* ========== ZONE INPUT ========== */
    .chat-input-area {
      padding: 18px;
      background: white;
      border-top: 1px solid #e9ecef;
      flex-shrink: 0;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f8f9fa;
      border-radius: 25px;
      padding: 12px 15px;
      min-height: 45px;
    }

    .message-input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 1rem;
      padding: 4px 8px;
    }

    .input-btn {
      background: transparent;
      border: none;
      font-size: 1.3rem;
      cursor: pointer;
      opacity: 0.7;
      transition: all 0.3s ease;
      padding: 8px;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .input-btn:hover, .input-btn.active {
      opacity: 1;
      transform: scale(1.1);
      background: rgba(102, 126, 234, 0.1);
    }

    .voice-btn {
      font-size: 1.3rem;
    }

    .voice-btn:active {
      background: #e74c3c;
      color: white;
      transform: scale(0.95);
    }

    .send-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      font-size: 1.1rem;
      flex-shrink: 0;
    }

    .send-btn:hover:not(:disabled) {
      transform: scale(1.1);
      box-shadow: 0 3px 10px rgba(102, 126, 234, 0.4);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .load-more-btn {
      width: 100%;
      padding: 8px;
      margin-bottom: 10px;
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.3s ease;
    }

    .load-more-btn:hover:not(:disabled) {
      background: #f8f9fa;
      transform: translateY(-1px);
    }

    /* NOUVEAU: Modal d'image */
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
      border-radius: 15px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.2rem;
      color: #2d3436;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.3s ease;
    }

    .modal-close:hover {
      opacity: 1;
    }

    .modal-body {
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }

    .modal-image {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }

    .modal-actions {
      display: flex;
      gap: 15px;
      padding: 15px 20px;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }

    .btn-download, .btn-open-tab {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.3s ease;
    }

    .btn-download:hover, .btn-open-tab:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .quick-chat-container {
        right: 10px;
        bottom: 10px;
      }

      .chat-window {
        width: calc(100vw - 20px);
        max-width: 340px;
      }

      .modal-content {
        margin: 20px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
      }

      .modal-image {
        max-height: 60vh;
      }

      .emoji-grid {
        grid-template-columns: repeat(6, 1fr);
      }

      .message-bubble {
        max-width: 85%;
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
  
  chatWindows: QuickChatWindow[] = [];
  currentUserId?: number;
  maxWindows = 3;
  private destroy$ = new Subject<void>();

  // NOUVEAU: Gestion du modal d'image
  showImageModal = false;
  currentImageUrl = '';
  currentImageTitle = '';

  // NOUVEAU: Gestion de l'enregistrement vocal
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: any;

  constructor(
    private messagingService: MessagingService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadUserInfo();
    this.listenToQuickChatEvents();
    this.subscribeToMessages();
    this.subscribeToTypingIndicators();
    this.setupClickOutside();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupRecording();
  }

  private loadUserInfo() {
    this.currentUserId = this.messagingService.getCurrentUserId();
  }

  private listenToQuickChatEvents() {
    window.addEventListener('openQuickChat', (event: any) => {
      const conversation = event.detail.conversation;
      this.openChat(conversation);
    });
  }

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
        this.chatWindows.forEach(window => {
          const conversationMessages = allMessages
            .filter(m => m.conversationId === window.conversation.id)
            .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

          // CORRECTION: Ne mettre à jour QUE si on a vraiment de nouveaux messages
          // et éviter d'écraser les messages existants
          if (conversationMessages.length > 0) {
            const existingMessageIds = new Set(window.messages.map(m => m.id));
            const newMessages = conversationMessages.filter(m => !existingMessageIds.has(m.id));
            
            // Seulement ajouter les nouveaux messages sans toucher aux existants
            if (newMessages.length > 0) {
              window.messages = [...window.messages, ...newMessages]
                .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
              
              // CORRECTION: Auto-scroll seulement pour les messages des autres
              const hasNewFromOthers = newMessages.some(m => m.senderId !== this.currentUserId);
              if (hasNewFromOthers) {
                setTimeout(() => this.scrollToBottom(window), 100);
              }
            }
          }
        });
      });
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
    const existingWindow = this.chatWindows.find(w => 
      w.conversation.id === conversation.id
    );

    if (existingWindow) {
      existingWindow.isMinimized = false;
      
      // NOUVEAU: Marquer automatiquement comme lu quand on ouvre
      this.markConversationAsRead(conversation);
      return;
    }

    if (this.chatWindows.length >= this.maxWindows) {
      this.chatWindows.shift();
    }

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
      showEmojiPicker: false
    };

    this.chatWindows.push(newWindow);
    this.loadMessages(newWindow);
    
    // NOUVEAU: Marquer comme lu dès l'ouverture
    this.markConversationAsRead(conversation);
  }

private loadMessages(window: QuickChatWindow, append = false) {
    window.isLoading = true;
    
    this.messagingService.getConversationMessages(
      window.conversation.id, 
      window.page, 
      20
    ).pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (messages) => {
        if (append) {
          // Éviter les doublons lors de l'ajout
          const existingIds = new Set(window.messages.map(m => m.id));
          const newMessages = messages.filter(m => !existingIds.has(m.id));
          window.messages = [...newMessages, ...window.messages];
        } else {
          // CORRECTION: Préserver les messages optimistes lors du chargement initial
          const optimisticMessages = window.messages.filter(m => 
            typeof m.id === 'number' && m.id > Date.now() - 60000 && m.senderId === this.currentUserId
          );
          
          const serverMessages = this.deduplicateMessages(messages);
          
          // Fusionner les messages optimistes avec les messages du serveur
          const allMessages = [...serverMessages, ...optimisticMessages]
            .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
          
          window.messages = this.deduplicateMessages(allMessages);
        }
        
        window.hasMoreMessages = messages.length === 20;
        window.isLoading = false;
        
        if (!append) {
          setTimeout(() => this.scrollToBottom(window), 100);
        }
      },
      error: (error) => {
        console.error('Erreur chargement messages:', error);
        window.isLoading = false;
      }
    });
  }



  loadMoreMessages(window: QuickChatWindow) {
    if (window.isLoading || !window.hasMoreMessages) return;
    
    window.page++;
    this.loadMessages(window, true);
  }

  // ===== ENVOI DE MESSAGES =====

  sendMessage(window: QuickChatWindow) {
    if (!window.newMessage.trim()) return;

    const messageContent = window.newMessage.trim();
    window.newMessage = '';

    // CORRECTION SIMPLIFIÉE: Pas de message optimiste, directement l'envoi serveur
    this.messagingService.sendMessage({
      conversationId: window.conversation.id,
      content: messageContent,
      type: 'TEXT'
    }).subscribe({
      next: (message) => {
        // Vérifier si le message n'existe pas déjà pour éviter les doublons
        const exists = window.messages.find(m => m.id === message.id);
        if (!exists) {
          window.messages.push(message);
          window.messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
          setTimeout(() => this.scrollToBottom(window), 100);
        }
      },
      error: (error) => {
        console.error('Erreur envoi message:', error);
        window.newMessage = messageContent; // Restaurer en cas d'erreur
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

  onTyping(window: QuickChatWindow) {
    this.messagingService.sendTypingIndicator(window.conversation.id, true);
    
    // NOUVEAU: Marquer comme lu quand on tape
    this.markAsReadOnActivity(window);
  }

  // NOUVEAU: Marquer une conversation comme lue
  private markConversationAsRead(conversation: Conversation) {
    if (conversation.unreadCount > 0) {
      console.log(`Marquage comme lu: conversation ${conversation.id}`);
      
      // Mise à jour optimiste locale
      conversation.unreadCount = 0;
      
      // Appel serveur
      this.messagingService.markAsRead(conversation.id).subscribe({
        next: () => {
          console.log('Conversation marquée comme lue avec succès');
          
          // Émettre l'événement pour synchroniser avec les autres composants
          window.dispatchEvent(new CustomEvent('conversationRead', {
            detail: {
              conversationId: conversation.id,
              timestamp: new Date()
            }
          }));
        },
        error: (error) => {
          console.warn('Erreur lors du marquage comme lu:', error);
        }
      });
    }
  }

  // NOUVEAU: Marquer comme lu lors de l'activité (écoute, écriture, etc.)
  private markAsReadOnActivity(window: QuickChatWindow) {
    if (window.conversation.unreadCount > 0) {
      this.markConversationAsRead(window.conversation);
    }
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

  // ===== NOUVEAU: GESTION DE L'ENREGISTREMENT VOCAL =====

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

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.handleRecordingStop(window);
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      
      // Timer pour la durée d'enregistrement
      this.recordingTimer = setInterval(() => {
        window.recordingDuration++;
        
        // Arrêt automatique après 5 minutes
        if (window.recordingDuration >= 300) {
          this.stopRecording(window);
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

    window.isRecording = false;
    window.recordingDuration = 0;
    
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.audioChunks = [];
  }

  private handleRecordingStop(window: QuickChatWindow) {
    if (this.audioChunks.length === 0) return;

    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const audioFile = new File([audioBlob], `vocal-${Date.now()}.webm`, {
      type: 'audio/webm'
    });

    // Upload et envoi du message vocal
    this.messagingService.uploadFile(audioFile).subscribe({
      next: (url) => {
        this.messagingService.sendMessage({
          conversationId: window.conversation.id,
          content: `Message vocal (${this.formatRecordingTime(window.recordingDuration)})`,
          type: 'AUDIO',
          attachmentUrl: url
        }).subscribe({
          next: (message) => {
            window.messages.push(message);
            setTimeout(() => this.scrollToBottom(window), 100);
          }
        });
      },
      error: (error) => {
        console.error('Erreur upload audio:', error);
        alert('Erreur lors de l\'envoi du message vocal');
      }
    });

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

  // ===== NOUVEAU: GESTION DES EMOJIS =====

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

  // ===== NOUVEAU: GESTION DU MODAL D'IMAGE =====

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

  formatAudioDuration(audioUrl?: string): string {
    // Cette méthode devrait idéalement récupérer la vraie durée
    // Pour l'instant, on retourne une durée par défaut
    return '0:00';
  }

  getFileSize(message: Message): string {
    // Cette méthode devrait récupérer la taille réelle du fichier
    // Pour l'instant, on retourne une taille par défaut
    return '';
  }

  // ===== MÉTHODES UTILITAIRES =====

  onScroll(event: Event, window: QuickChatWindow) {
    const element = event.target as HTMLElement;
    if (element.scrollTop < 100 && window.hasMoreMessages && !window.isLoading) {
      this.loadMoreMessages(window);
    }
    
    // NOUVEAU: Marquer comme lu lors du scroll (activité utilisateur)
    this.markAsReadOnActivity(window);
  }

  toggleMinimize(window: QuickChatWindow) {
    window.isMinimized = !window.isMinimized;
    window.showEmojiPicker = false;
  }

  closeChat(window: QuickChatWindow) {
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
    return 25 + (index * 420);
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
    if (conversation.type === 'SKILL_GROUP' && conversation.skillImageUrl) {
      return conversation.skillImageUrl.startsWith('http') ? 
        conversation.skillImageUrl : 
        `http://localhost:8822${conversation.skillImageUrl}`;
    }
    
    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find(
        p => p.userId !== this.currentUserId
      );
      if (otherParticipant?.avatar) {
        return otherParticipant.avatar.startsWith('http') ? 
          otherParticipant.avatar : 
          `http://localhost:8822${otherParticipant.avatar}`;
      }
    }
    
    return this.generateAvatar(this.getConversationName(conversation));
  }

  getConversationStatus(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const other = conversation.participants.find(p => p.userId !== this.currentUserId);
      return other?.isOnline ? 'En ligne' : 'Hors ligne';
    }
    
    const onlineCount = conversation.participants.filter(p => p.isOnline).length;
    return `${onlineCount} en ligne`;
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
}