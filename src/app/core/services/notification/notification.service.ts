import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from '../keycloak.service';
import { BehaviorSubject, Observable, Subject, from, throwError, of } from 'rxjs';
import { catchError, switchMap, tap, map, distinctUntilChanged } from 'rxjs/operators';
import { Client, IMessage } from '@stomp/stompjs';
import { Notification } from '../../../models/Notification/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private apiUrl = 'http://localhost:8822/api/v1/notifications';
  private stompClient: Client | null = null;
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private destroy$ = new Subject<void>();
  private connectionStatus = new BehaviorSubject<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('DISCONNECTED');
  private userId: string | null = null;
  private tokenRefreshInterval: any;
  private isConnected = false;

  notifications$ = this.notificationsSubject.asObservable();
  connectionStatus$ = this.connectionStatus.asObservable();
  unreadCount$ = this.notifications$.pipe(
    map(notifications => notifications.filter(n => !n.read).length),
    distinctUntilChanged()
  );

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService,
    private ngZone: NgZone
  ) {
    this.initializeService();
  }

  async initializeService(): Promise<void> {
    try {
      this.userId = await this.keycloakService.getUserId();
      if (!this.userId) {
        console.error('User ID not available');
        return;
      }
      await this.connectWebSocket();
      await this.fetchInitialNotifications();
      this.startTokenRefresh();
    } catch (error) {
      console.error('Service initialization failed:', error);
    }
  }

async connectWebSocket(): Promise<void> {
  console.log('Initializing WebSocket connection...');
  this.connectionStatus.next('CONNECTING');
  
  try {
    const token = await this.keycloakService.getToken();
    if (!token) {
      console.error('No token available');
      this.connectionStatus.next('DISCONNECTED');
      return;
    }
    
    if (!this.userId) {
      console.error('User ID not available');
      this.connectionStatus.next('DISCONNECTED');
      return;
    }

    console.log('Token and user ID available, proceeding...');
    
    // Détruire l'ancienne connexion si elle existe
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }

    // Créer une nouvelle connexion STOMP
    this.stompClient = new Client({
      brokerURL: 'ws://localhost:8822/ws/notifications',
      connectHeaders: {
        Authorization: `Bearer ${token}`
      },
      debug: (str) => console.log('STOMP: ' + str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: (frame) => {
        console.log('✅ WebSocket connected! Frame:', frame);
        this.connectionStatus.next('CONNECTED');
        this.isConnected = true;
        this.subscribeToNotifications();
        
      },
      onStompError: (frame) => {
        console.error('❌ Broker reported error:', frame.headers['message']);
        console.error('Error details:', frame.body);
        this.connectionStatus.next('DISCONNECTED');
      },
      onWebSocketError: (event) => {
        console.error('❌ WebSocket error:', event);
        this.connectionStatus.next('DISCONNECTED');
        setTimeout(() => this.reconnectWebSocket(), 5000);
      },
      onDisconnect: () => {
        console.warn('⚠️ WebSocket disconnected');
        this.connectionStatus.next('DISCONNECTED');
      }
    });

    this.stompClient.activate();
  } catch (error) {
    console.error('WebSocket connection failed:', error);
    this.connectionStatus.next('DISCONNECTED');
    setTimeout(() => this.reconnectWebSocket(), 5000);
  }
}

subscribeToNotifications(): void {
  if (!this.stompClient || !this.userId) {
    console.warn('Cannot subscribe: stompClient or userId missing');
    return;
  }
  
  // Destination CORRECTE selon la configuration Spring
  const destination = `/user/queue/notifications`;
  console.log(`🔔 Subscribing to: ${destination}`);
  
  this.stompClient.subscribe(
    destination,
    (message: IMessage) => {
      console.log('📩 Message received from:', destination);
      this.processNotification(message);
    },
    { 
      id: 'user-notifications',
      'auto-delete': 'true'
    }
  );
}

processNotification(message: IMessage): void {
  try {
    console.log('📩 Raw WebSocket message:', message.body);
    
    let notification: Notification;
    try {
      notification = JSON.parse(message.body);
    } catch (parseError) {
      console.error('Error parsing notification:', parseError);
      return;
    }

    // Validation améliorée
    if (!notification || 
        typeof notification.id !== 'number' || 
        !notification.userId) {
      console.warn('❌ Invalid notification structure:', notification);
      return;
    }

    // Vérifier que la notification est pour cet utilisateur
    if (notification.userId !== this.userId) {
      console.warn(`🚫 Notification for different user (${notification.userId}), current user ${this.userId}`);
      return;
    }

    this.ngZone.run(() => {
      const currentNotifications = [...this.notificationsSubject.value];
      const existingIndex = currentNotifications.findIndex(n => n.id === notification.id);
      
      if (existingIndex >= 0) {
        // Mise à jour si déjà présente
        currentNotifications[existingIndex] = notification;
        console.log('🔄 Updated existing notification');
      } else {
        // Ajout en tête de liste
        currentNotifications.unshift(notification);
        console.log('✨ Added new notification');
      }
      
      this.notificationsSubject.next([...currentNotifications]);
    });
  } catch (error) {
    console.error('Unhandled error in processNotification:', error);
  }
}

  private isValidNotification(notification: any): boolean {
    return notification &&
           typeof notification.id === 'number' &&
           typeof notification.message === 'string' &&
           typeof notification.read === 'boolean' &&
           typeof notification.userId === 'string';
  }

  fetchInitialNotifications(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.userId) {
        resolve();
        return;
      }
      this.getNotifications().subscribe(notifications => {
        this.ngZone.run(() => {
          // CORRECTION: Stocker les notifications initiales
          this.notificationsSubject.next(notifications);
          resolve();
        });
      }, () => resolve());
    });
  }

  getNotifications(): Observable<Notification[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Notification[]>(`${this.apiUrl}/user/${this.userId}`, { headers }).pipe(
          map(notifications => notifications?.reverse() || []),
          catchError(() => of([]))
        );
      })
    );
  }

  markAsRead(notificationId: number): Observable<Notification> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<Notification>(`${this.apiUrl}/${notificationId}/read`, null, { headers }).pipe(
          tap(updatedNotification => {
            this.ngZone.run(() => {
              const current = [...this.notificationsSubject.value];
              const index = current.findIndex(n => n.id === notificationId);
              if (index !== -1) {
                current[index] = updatedNotification;
                this.notificationsSubject.next([...current]); // Nouvelle référence
              }
            });
          })
        );
      })
    );
  }

  markAllAsRead(): Observable<void> {
    if (!this.userId) return throwError(() => 'User ID not available');
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/user/${this.userId}/mark-all-read`, null, { headers }).pipe(
          tap(() => {
            this.ngZone.run(() => {
              const updatedNotifications = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
              this.notificationsSubject.next([...updatedNotifications]); // Nouvelle référence
            });
          })
        );
      })
    );
  }

 private lastUsedToken: string | null = null;

private reconnectAttempts = 0;

startTokenRefresh(): void {
  this.tokenRefreshInterval = setInterval(async () => {
    try {
      const refreshed = await this.keycloakService.refreshToken(30);
      const latestToken = await this.keycloakService.getToken();

      if (refreshed) {
        console.log('🔁 Token refreshed - reconnecting WebSocket');
        this.reconnectAttempts = 0; // Reset les tentatives
        await this.reconnectWebSocket();
      } else if (latestToken !== this.lastUsedToken) {
        console.log('🆕 Token changed - reconnecting WebSocket');
        this.lastUsedToken = latestToken;
        await this.reconnectWebSocket();
      }
    } catch (err) {
      console.error('⛔ Token refresh failed:', err);
      this.reconnectAttempts++;
    }
  }, 30000); // Toutes les 30 secondes
}


async reconnectWebSocket(): Promise<void> {
  console.log('Attempting WebSocket reconnection...');
  try {
    // Rafraîchir le token AVANT la reconnexion
    const refreshed = await this.keycloakService.refreshToken(30);
    if (refreshed) {
      console.log('🔑 Token refreshed successfully');
    }
    
    await this.connectWebSocket();
  } catch (error) {
    console.error('Reconnection failed:', error);
    // Réessayer avec backoff exponentiel
    const delay = Math.min(30000, 5000 * Math.pow(2, this.reconnectAttempts));
    setTimeout(() => this.reconnectWebSocket(), delay);
  }
}

  // CORRECTION: Méthode pour envoyer une notification de test
  

  ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
  clearInterval(this.tokenRefreshInterval);
  
  if (this.stompClient) {
    this.stompClient.deactivate().then(() => {
      console.log('WebSocket connection closed');
    });
  }
}
}