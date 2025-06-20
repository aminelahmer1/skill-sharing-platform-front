import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from '../keycloak.service';
import { BehaviorSubject, Observable, Subject, from, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
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
  private maxReconnectAttempts = 5;
  private reconnectAttempts = 0;
  private reconnectDelay = 5000;
  private refreshIntervalId: any;
  private userId: string | null = null;

  notifications$ = this.notificationsSubject.asObservable();
  connectionStatus$ = this.connectionStatus.asObservable();

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    this.connectionStatus.next('CONNECTING');
    try {
      this.userId = await this.keycloakService.getUserId();
      const token = await this.keycloakService.getToken();

      if (!token || !this.userId) {
        console.error('User ID or token missing');
        return;
      }

      this.createStompClient(token);
      this.stompClient?.activate();
      this.startTokenRefresh();
    } catch (error) {
      console.error('Initial WebSocket connection failed:', error);
      this.attemptReconnection();
    }
  }

  private createStompClient(token: string): void {
    if (this.stompClient && this.stompClient.connected) {
      this.stompClient.deactivate();
    }

    const wsUrl = `ws://localhost:8822/ws/notifications?token=${encodeURIComponent(token)}`;

    this.stompClient = new Client({
      brokerURL: wsUrl,
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: (str) => console.debug('[STOMP] ' + str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => this.onConnect(),
      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message']);
        this.handleConnectionError();
      },
      onDisconnect: () => this.handleConnectionError()
    });
  }

  private onConnect(): void {
    console.log('✅ WebSocket connected');
    this.connectionStatus.next('CONNECTED');
    this.reconnectAttempts = 0;

    if (this.userId && this.stompClient) {
      this.stompClient.subscribe(`/user/${this.userId}/queue/notifications`, (message: IMessage) => {
        this.processNotification(message);
      });
    }
  }

  private processNotification(message: IMessage): void {
    try {
      const notification: Notification = JSON.parse(message.body);
      console.log('📬 New notification:', notification);

      // Add to beginning of list
      const current = this.notificationsSubject.value;
      this.notificationsSubject.next([notification, ...current]);

      // Play sound for unread notifications
      if (!notification.read) {
        this.playNotificationSound();
      }
    } catch (e) {
      console.error('Error parsing notification:', e);
    }
  }

  private playNotificationSound(): void {
    const audio = new Audio('assets/sounds/notification.mp3');
    audio.play().catch(e => console.warn('Sound play failed:', e));
  }

  private handleConnectionError(): void {
    this.connectionStatus.next('DISCONNECTED');
    this.attemptReconnection();
  }

  private attemptReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delayMs = this.reconnectAttempts * this.reconnectDelay;

    console.log(`Reconnecting in ${delayMs}ms...`);
    setTimeout(async () => {
      try {
        const token = await this.keycloakService.getToken();
        this.createStompClient(token);
        this.stompClient?.activate();
      } catch (error) {
        this.attemptReconnection();
      }
    }, delayMs);
  }

  private async refreshToken(): Promise<void> {
    try {
      const refreshed = await this.keycloakService.refreshToken(30);
      if (refreshed) {
        const newToken = await this.keycloakService.getToken();
        this.createStompClient(newToken);
        this.stompClient?.activate();
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
  }

  private startTokenRefresh(): void {
    this.refreshIntervalId = setInterval(() => {
      this.refreshToken().catch(console.error);
    }, 4 * 60 * 1000);
  }

  getNotifications(): Observable<Notification[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Notification[]>(`${this.apiUrl}/user/${this.userId}`, { headers }).pipe(
          tap(notifications => this.notificationsSubject.next(notifications)),
          catchError(this.handleHttpError)
        );
      })
    );
  }

  markAsRead(notificationId: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${notificationId}/read`, null, { headers }).pipe(
          tap(() => {
            const notifications = this.notificationsSubject.value.map(n => 
              n.id === notificationId ? { ...n, read: true } : n
            );
            this.notificationsSubject.next(notifications);
          }),
          catchError(this.handleHttpError)
        );
      })
    );
  }

  markAllAsRead(): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/user/${this.userId}/mark-all-read`, null, { headers }).pipe(
          tap(() => {
            const notifications = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
            this.notificationsSubject.next(notifications);
          }),
          catchError(this.handleHttpError)
        );
      })
    );
  }

  private handleHttpError(error: any): Observable<never> {
    console.error('HTTP error:', error);
    if (error.status === 401) {
      this.keycloakService.login();
    }
    return throwError(() => error);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stompClient?.deactivate();
    clearInterval(this.refreshIntervalId);
  }
}