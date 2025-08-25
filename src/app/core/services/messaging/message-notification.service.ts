// message-notification.service.ts - VERSION COMPLÈTE SANS UserIdResolverService
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, Subject, timer } from 'rxjs';
import { MessagingService, Conversation, Message } from './messaging.service';
import { takeUntil, filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';

export interface MessageNotification {
  id: string;
  conversationId: number;
  conversationName: string;
  senderName: string;
  message: string;
  timestamp: Date;
  read: boolean;
  avatarUrl?: string;
  messageId?: number;
  messageType?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  browser: boolean;
  onlyWhenAway: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  messageTypes: {
    direct: boolean;
    group: boolean;
    skill: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MessageNotificationService implements OnDestroy {
  private notificationsSubject = new BehaviorSubject<MessageNotification[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private destroy$ = new Subject<void>();
  
  // ✅ Configuration
  private readonly maxNotifications = 100;
  private readonly notificationDuration = 6000; // 6 secondes
  private readonly cleanupInterval = 60 * 60 * 1000; // 1 heure
  
  // ✅ État interne
  private currentUserId?: number;
  private isPageVisible = true;
  private lastNotificationTime = 0;
  private notificationQueue: MessageNotification[] = [];
  
  // ✅ Observables publics
  notifications$ = this.notificationsSubject.asObservable();
  unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(
    private messagingService: MessagingService,
    private keycloakService: KeycloakService
  ) {
    this.initialize();
  }

  // ✅ === INITIALISATION ===

  private async initialize() {
    try {
      await this.loadCurrentUser();
      this.setupVisibilityDetection();
      this.subscribeToMessages();
      this.subscribeToUnreadCount();
      this.subscribeToConversationChanges();
      this.subscribeToAuthChanges();
      this.startCleanupTimer();
      this.requestNotificationPermission();
      
      console.log('✅ MessageNotificationService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MessageNotificationService:', error);
    }
  }

 private async loadCurrentUser() {
  try {
    const profile = await this.keycloakService.getUserProfile();
    
    if (profile?.id) {
      // Récupérer l'ID réel depuis le backend via messaging service
      const token = await this.keycloakService.getToken();
      if (token) {
        const realUserId = await this.fetchRealUserId(profile.id, token);
        if (realUserId) {
          this.currentUserId = realUserId;
          console.log('✅ Notification service user ID:', this.currentUserId);
          return;
        }
      }
    }
    
    console.error('❌ Could not load user ID for notifications');
    this.currentUserId = undefined;
    
  } catch (error) {
    console.error('❌ Error loading current user ID:', error);
    this.currentUserId = undefined;
  }
}

// AJOUTER cette méthode:
private async fetchRealUserId(keycloakId: string, token: string): Promise<number | null> {
  try {
    const response = await fetch(
      `http://localhost:8822/api/v1/users/by-keycloak-id?keycloakId=${keycloakId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.id || null;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching real user ID:', error);
    return null;
  }
}

// SUPPRIMER generateNumericIdFromUUID() - ne plus l'utiliser

  private generateNumericIdFromUUID(uuid: string): number {
    // ✅ Générer un ID numérique à partir d'un UUID
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      const char = uuid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 999999 + 1; // Assurer un nombre positif entre 1 et 999999
  }

  private subscribeToAuthChanges() {
    // ✅ Écouter les changements d'authentification
    this.keycloakService.authStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(authenticated => {
        if (authenticated) {
          this.loadCurrentUser();
        } else {
          this.currentUserId = undefined;
          this.clearNotifications();
        }
      });
  }

  private setupVisibilityDetection() {
    // ✅ Détecter si la page est visible
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      
      if (this.isPageVisible) {
        // ✅ Marquer les notifications comme vues quand on revient
        this.processNotificationQueue();
      }
    });

    // ✅ Détecter le focus de la fenêtre
    window.addEventListener('focus', () => {
      this.isPageVisible = true;
      this.processNotificationQueue();
    });

    window.addEventListener('blur', () => {
      this.isPageVisible = false;
    });
  }

  // ✅ === SOUSCRIPTIONS ===

  private subscribeToMessages() {
    combineLatest([
      this.messagingService.messages$,
      this.messagingService.conversations$,
      this.messagingService.currentConversation$
    ]).pipe(
      takeUntil(this.destroy$),
      debounceTime(200), // ✅ Éviter les notifications en rafale
      filter(([messages, conversations]) => messages.length > 0 && conversations.length > 0)
    ).subscribe(([messages, conversations, currentConversation]) => {
      this.processNewMessages(messages, conversations, currentConversation);
    });
  }

  private subscribeToUnreadCount() {
    this.messagingService.unreadCount$
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(count => {
        this.unreadCountSubject.next(count);
      });
  }

  private subscribeToConversationChanges() {
    this.messagingService.currentConversation$
      .pipe(
        takeUntil(this.destroy$),
        filter(conversation => !!conversation)
      )
      .subscribe(conversation => {
        // ✅ Marquer les notifications de cette conversation comme lues
        this.markConversationNotificationsAsRead(conversation!.id);
      });
  }

  // ✅ === TRAITEMENT DES MESSAGES ===

  // REMPLACER dans processNewMessages():
private processNewMessages(
  messages: Message[],
  conversations: Conversation[],
  currentConversation: Conversation | null
) {
  const recentThreshold = new Date(Date.now() - 30000);
  const newMessages = messages.filter(m => 
    new Date(m.sentAt) > recentThreshold &&
    // CORRIGER: Utiliser la bonne casse pour le status
    (m.status !== 'READ' && m.status !== 'DELIVERED') && // Vérifier les deux casses
    !m.isDeleted &&
    m.senderId !== this.currentUserId
  );

  newMessages.forEach(message => {
    if (currentConversation && 
        message.conversationId === currentConversation.id && 
        this.isPageVisible) {
      return;
    }

    if (this.isNotificationExists(message.id!)) {
      return;
    }

    const conversation = conversations.find(c => c.id === message.conversationId);
    if (conversation) {
      this.createNotification(message, conversation);
    }
  });
}

  private createNotification(message: Message, conversation: Conversation) {
    const preferences = this.getNotificationPreferences();
    
    // ✅ Vérifier si les notifications sont activées
    if (!preferences.enabled) {
      return;
    }

    // ✅ Vérifier le type de conversation
    if (!this.shouldNotifyForConversationType(conversation.type, preferences)) {
      return;
    }

    // ✅ Vérifier les heures silencieuses
    if (this.isInQuietHours(preferences)) {
      return;
    }

    const notification: MessageNotification = {
      id: `msg-${message.id}-${Date.now()}`,
      conversationId: message.conversationId,
      conversationName: this.getConversationDisplayName(conversation),
      senderName: message.senderName,
      message: this.formatMessageContent(message),
      timestamp: new Date(message.sentAt),
      read: false,
      avatarUrl: message.senderAvatar,
      messageId: message.id,
      messageType: message.type,
      priority: this.getMessagePriority(message, conversation)
    };

    this.addNotification(notification);
    this.processNotificationDisplay(notification, preferences);
  }

  private processNotificationDisplay(notification: MessageNotification, preferences: NotificationPreferences) {
    // ✅ Son de notification
    if (preferences.sound) {
      this.playNotificationSound();
    }

    // ✅ Notification navigateur
    if (preferences.browser && (!preferences.onlyWhenAway || !this.isPageVisible)) {
      this.showBrowserNotification(notification);
    }

    // ✅ Vibration sur mobile
    if ('vibrate' in navigator && !this.isPageVisible) {
      navigator.vibrate([200, 100, 200]);
    }

    console.log('📱 Notification created:', notification);
  }

  // ✅ === MÉTHODES UTILITAIRES ===

  private shouldNotifyForConversationType(type: string, preferences: NotificationPreferences): boolean {
    switch (type) {
      case 'DIRECT':
        return preferences.messageTypes.direct;
      case 'GROUP':
        return preferences.messageTypes.group;
      case 'SKILL_GROUP':
        return preferences.messageTypes.skill;
      default:
        return true;
    }
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = preferences.quietHours.startTime.split(':').map(Number);
    const [endHour, endMin] = preferences.quietHours.endTime.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // ✅ Heures qui traversent minuit
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private getMessagePriority(message: Message, conversation: Conversation): 'LOW' | 'NORMAL' | 'HIGH' {
    // ✅ Messages directs = priorité haute
    if (conversation.type === 'DIRECT') {
      return 'HIGH';
    }

    // ✅ Messages système = priorité basse
    if (message.type === 'SYSTEM') {
      return 'LOW';
    }

    // ✅ Messages avec mentions (si implémenté) = priorité haute
    if (message.content.includes('@') && this.currentUserId) {
      return 'HIGH';
    }

    return 'NORMAL';
  }

  private formatMessageContent(message: Message): string {
    const maxLength = 120;
    let content = '';

    switch (message.type) {
      case 'TEXT':
        content = message.content;
        break;
      case 'IMAGE':
        content = '📷 Image partagée';
        break;
      case 'VIDEO':
        content = '🎥 Vidéo partagée';
        break;
      case 'AUDIO':
        content = '🎵 Message vocal';
        break;
      case 'FILE':
        content = `📎 Fichier: ${message.content}`;
        break;
      case 'SYSTEM':
        content = message.content;
        break;
      default:
        content = message.content;
    }

    return content.length > maxLength 
      ? content.substring(0, maxLength) + '...' 
      : content;
  }

  private getConversationDisplayName(conversation: Conversation): string {
    if (conversation.type === 'DIRECT') {
      const otherParticipant = conversation.participants.find(p => 
        p.userId !== this.currentUserId
      );
      return otherParticipant?.userName || conversation.name;
    }
    return conversation.name;
  }

  private isNotificationExists(messageId: number): boolean {
    return this.notificationsSubject.value.some(n => 
      n.messageId === messageId || n.id.includes(`msg-${messageId}`)
    );
  }

  // ✅ === NOTIFICATIONS NAVIGATEUR ===

  private async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('⚠️ Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  private showBrowserNotification(notification: MessageNotification) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    try {
      // ✅ CORRECTION: Options de notification compatibles
      const browserNotification = new Notification(
        `💬 ${notification.senderName}`,
        {
          body: `${notification.conversationName}\n${notification.message}`,
          icon: notification.avatarUrl || '/assets/icons/message-icon.png',
          badge: '/assets/icons/app-badge.png',
          tag: `conversation-${notification.conversationId}`,
          requireInteraction: notification.priority === 'HIGH',
          silent: false,
          data: {
            conversationId: notification.conversationId,
            messageId: notification.messageId
          }
        }
      );

      // ✅ Vibration séparée pour éviter les conflits
      if ('vibrate' in navigator && !this.isPageVisible) {
        navigator.vibrate([200, 100, 200]);
      }

      // ✅ Auto-fermer après un délai
      setTimeout(() => {
        browserNotification.close();
      }, this.notificationDuration);

      // ✅ Gérer le clic
      browserNotification.onclick = () => {
        window.focus();
        this.handleNotificationClick(notification);
        browserNotification.close();
      };

    } catch (error) {
      console.warn('⚠️ Failed to show browser notification:', error);
    }
  }

  private handleNotificationClick(notification: MessageNotification) {
    // ✅ Marquer comme lue
    this.markAsRead(notification.id);
    
    // ✅ Émettre un événement pour naviguer vers la conversation
    window.dispatchEvent(new CustomEvent('openConversation', {
      detail: { conversationId: notification.conversationId }
    }));
  }

  // ✅ === SON DE NOTIFICATION ===

  private playNotificationSound() {
    // ✅ Éviter de jouer trop de sons
    const now = Date.now();
    if (now - this.lastNotificationTime < 1000) {
      return;
    }
    this.lastNotificationTime = now;

    try {
      // ✅ Son simple avec Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // ✅ Son agréable : deux tons
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
      
    } catch (error) {
      console.warn('⚠️ Failed to play notification sound:', error);
    }
  }

  // ✅ === GESTION DE LA QUEUE ===

  private processNotificationQueue() {
    if (this.notificationQueue.length > 0) {
      const preferences = this.getNotificationPreferences();
      
      this.notificationQueue.forEach(notification => {
        this.processNotificationDisplay(notification, preferences);
      });
      
      this.notificationQueue = [];
    }
  }

  // ✅ === MÉTHODES PUBLIQUES ===

  addNotification(notification: MessageNotification) {
    const current = this.notificationsSubject.value;
    const updated = [notification, ...current].slice(0, this.maxNotifications);
    this.notificationsSubject.next(updated);
    
    // ✅ Ajouter à la queue si page pas visible
    if (!this.isPageVisible) {
      this.notificationQueue.push(notification);
    }
  }

  markAsRead(notificationId: string) {
    const notifications = this.notificationsSubject.value;
    const updated = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(updated);
  }

  markAllAsRead() {
    const notifications = this.notificationsSubject.value;
    const updated = notifications.map(n => ({ ...n, read: true }));
    this.notificationsSubject.next(updated);
  }

  markConversationNotificationsAsRead(conversationId: number) {
    const notifications = this.notificationsSubject.value;
    const updated = notifications.map(n => 
      n.conversationId === conversationId ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(updated);
  }

  removeNotification(notificationId: string) {
    const current = this.notificationsSubject.value;
    const updated = current.filter(n => n.id !== notificationId);
    this.notificationsSubject.next(updated);
  }

  clearNotifications() {
    this.notificationsSubject.next([]);
    this.notificationQueue = [];
  }

  clearOldNotifications() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const current = this.notificationsSubject.value;
    const updated = current.filter(n => new Date(n.timestamp) > oneDayAgo);
    
    if (updated.length !== current.length) {
      this.notificationsSubject.next(updated);
      console.log(`🧹 Cleared ${current.length - updated.length} old notifications`);
    }
  }

  // ✅ === PRÉFÉRENCES ===

  getNotificationPreferences(): NotificationPreferences {
    try {
      const stored = localStorage.getItem('notification-preferences');
      return stored ? JSON.parse(stored) : this.getDefaultPreferences();
    } catch (error) {
      console.error('❌ Failed to load notification preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  setNotificationPreferences(preferences: NotificationPreferences) {
    try {
      localStorage.setItem('notification-preferences', JSON.stringify(preferences));
      console.log('💾 Notification preferences saved');
    } catch (error) {
      console.error('❌ Failed to save notification preferences:', error);
    }
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      enabled: true,
      sound: true,
      browser: true,
      onlyWhenAway: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00'
      },
      messageTypes: {
        direct: true,
        group: true,
        skill: true
      }
    };
  }

  // ✅ === STATISTIQUES ===

  getNotificationStats() {
    const notifications = this.notificationsSubject.value;
    const unread = notifications.filter(n => !n.read);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayNotifications = notifications.filter(n => new Date(n.timestamp) >= today);
    
    return {
      total: notifications.length,
      unread: unread.length,
      read: notifications.length - unread.length,
      today: todayNotifications.length,
      conversationsWithUnread: new Set(unread.map(n => n.conversationId)).size,
      byPriority: {
        high: unread.filter(n => n.priority === 'HIGH').length,
        normal: unread.filter(n => n.priority === 'NORMAL').length,
        low: unread.filter(n => n.priority === 'LOW').length
      }
    };
  }

  getUnreadNotifications(): MessageNotification[] {
    return this.notificationsSubject.value.filter(n => !n.read);
  }

  getLatestNotifications(count: number = 10): MessageNotification[] {
    return this.notificationsSubject.value.slice(0, count);
  }

  hasUnreadNotifications(): boolean {
    return this.getUnreadNotifications().length > 0;
  }

  // ✅ === MÉTHODES UTILITAIRES PUBLIQUES ===

  getCurrentUserId(): number | undefined {
    return this.currentUserId;
  }

  async refreshCurrentUser(): Promise<void> {
    await this.loadCurrentUser();
  }

  isUserAuthenticated(): boolean {
    return !!this.currentUserId;
  }

  getUserRoles(): string[] {
    return this.keycloakService.getRoles();
  }

  hasRole(role: string): boolean {
    return this.getUserRoles().includes(role);
  }

  // ✅ === ÉVÉNEMENTS ===

  onNotificationClick(notification: MessageNotification): void {
    this.handleNotificationClick(notification);
  }

  // ✅ === CLEANUP ===

  private startCleanupTimer() {
    setInterval(() => {
      this.clearOldNotifications();
    }, this.cleanupInterval);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    console.log('🔄 MessageNotificationService destroyed');
  }
}