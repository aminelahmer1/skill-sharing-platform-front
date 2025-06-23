import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from '../keycloak.service';
import { BehaviorSubject, Observable, Subject, from, throwError, of } from 'rxjs';
import { catchError, switchMap, tap, takeUntil, distinctUntilChanged, map } from 'rxjs/operators';
import { Client, IMessage } from '@stomp/stompjs';
import { Notification } from '../../../models/Notification/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private apiUrl = 'http://localhost:8822/api/v1/notifications';
  private stompClient: Client | null = null;
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private pendingRealTimeNotifications: Notification[] = [];
  private destroy$ = new Subject<void>();
  private connectionStatus = new BehaviorSubject<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'>('DISCONNECTED');
  private userId: string | null = null;
  private tokenRefreshInterval: any;
  private isInitialized = false;
  private isInitialFetchDone = false;

  notifications$ = this.notificationsSubject.asObservable();
  connectionStatus$ = this.connectionStatus.asObservable();
  unreadCount$ = this.notifications$.pipe(
    map(notifications => notifications.filter(n => n && typeof n.read === 'boolean' && !n.read).length),
    distinctUntilChanged()
  );

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    if (this.isInitialized) return;
    try {
      this.userId = await this.keycloakService.getUserId();
      if (!this.userId) {
        console.error('User ID not available');
        return;
      }
      await this.connectWebSocket();
      await this.fetchInitialNotifications();
      this.startTokenRefresh();
      this.isInitialized = true;
    } catch (error) {
      console.error('Service initialization failed:', error);
    }
  }

  private async connectWebSocket(): Promise<void> {
    this.connectionStatus.next('CONNECTING');
    const token = await this.keycloakService.getToken();
    if (!token || !this.userId) {
      this.connectionStatus.next('DISCONNECTED');
      return;
    }

    this.stompClient = new Client({
      brokerURL: `ws://localhost:8822/ws/notifications?token=${encodeURIComponent(token)}`,
      connectHeaders: { Authorization: `Bearer ${token}` },
      debug: (str) => console.debug('[STOMP] ' + str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log('✅ WebSocket connected');
        this.connectionStatus.next('CONNECTED');
        this.subscribeToNotifications();
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message']);
        this.connectionStatus.next('DISCONNECTED');
        setTimeout(() => this.reconnectWebSocket(), 5000);
      },
      onDisconnect: () => {
        this.connectionStatus.next('DISCONNECTED');
      }
    });
    this.stompClient.activate();
  }

  private subscribeToNotifications(): void {
    if (!this.stompClient || !this.userId) return;
    this.stompClient.subscribe(
      `/user/${this.userId}/queue/notifications`,
      (message: IMessage) => this.processNotification(message)
    );
  }

  private processNotification(message: IMessage): void {
    try {
      const notification: Notification = JSON.parse(message.body);
      if (
        !notification ||
        typeof notification.id !== 'number' ||
        typeof notification.message !== 'string' ||
        typeof notification.read !== 'boolean' ||
        typeof notification.userId !== 'string' ||
        !notification.createdAt ||
        typeof notification.type !== 'string' ||
        typeof notification.sent !== 'boolean'
      ) {
        console.warn('❌ Invalid notification ignored:', message.body);
        return;
      }
      console.log('📬 Received real-time notification:', notification);

      const currentNotifications = this.notificationsSubject.value.filter(n => n != null);
      if (!this.isInitialFetchDone) {
        this.pendingRealTimeNotifications.push(notification);
        return;
      }

      const existingIndex = currentNotifications.findIndex(n => n.id === notification.id);
      let updatedNotifications: Notification[];
      if (existingIndex >= 0) {
        updatedNotifications = [...currentNotifications];
        updatedNotifications[existingIndex] = notification;
      } else {
        updatedNotifications = [notification, ...currentNotifications];
      }
      this.notificationsSubject.next(updatedNotifications.filter(n => n != null));
    } catch (error) {
      console.error('Error processing notification:', error);
    }
  }

  private fetchInitialNotifications(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.userId) {
        reject('User ID not available');
        return;
      }
      this.getNotifications().subscribe({
        next: (notifications) => {
          console.log('Fetched notifications:', notifications);
          this.notificationsSubject.next(notifications.filter(n => n != null));
          const currentNotifications = this.notificationsSubject.value;
          this.pendingRealTimeNotifications.forEach(pending => {
            const existingIndex = currentNotifications.findIndex(n => n.id === pending.id);
            if (existingIndex >= 0) {
              currentNotifications[existingIndex] = pending;
            } else {
              currentNotifications.unshift(pending);
            }
          });
          console.log('Merged notifications:', currentNotifications);
          this.notificationsSubject.next(currentNotifications.filter(n => n != null));
          this.pendingRealTimeNotifications = [];
          this.isInitialFetchDone = true;
          resolve();
        },
        error: (err) => {
          console.error('Failed to fetch notifications:', err);
          reject(err);
        }
      });
    });
  }

  getNotifications(): Observable<Notification[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Notification[]>(
          `${this.apiUrl}/user/${this.userId}`,
          { headers }
        ).pipe(
          map(notifications => {
            console.log('Raw HTTP notifications:', notifications);
            return notifications
              ? notifications.filter(n => 
                  n &&
                  typeof n.id === 'number' &&
                  typeof n.message === 'string' &&
                  typeof n.read === 'boolean' &&
                  typeof n.userId === 'string' &&
                  n.createdAt &&
                  typeof n.type === 'string' &&
                  typeof n.sent === 'boolean'
                ).reverse()
              : [];
          }),
          catchError(error => {
            console.error('HTTP error fetching notifications:', error);
            return of([]);
          })
        );
      })
    );
  }

  markAsRead(notificationId: number): Observable<Notification> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<Notification>(
          `${this.apiUrl}/${notificationId}/read`,
          null,
          { headers }
        ).pipe(
          tap(updatedNotification => {
            const current = this.notificationsSubject.value.filter(n => n != null);
            const updated = current.map(n =>
              n.id === notificationId ? updatedNotification : n
            );
            this.notificationsSubject.next(updated);
          }),
          catchError(error => {
            console.error('markAsRead failed:', error);
            return throwError(() => error);
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
        return this.http.put<void>(
          `${this.apiUrl}/user/${this.userId}/mark-all-read`,
          null,
          { headers }
        ).pipe(
          tap(() => {
            const updatedNotifications = this.notificationsSubject.value
              .filter(n => n != null)
              .map(n => ({ ...n, read: true }));
            this.notificationsSubject.next(updatedNotifications);
            if (this.stompClient?.connected) {
              updatedNotifications.forEach(n => {
                this.stompClient!.publish({
                  destination: `/user/${this.userId}/queue/notifications`,
                  body: JSON.stringify(n)
                });
              });
            }
          }),
          catchError(error => {
            console.error('Error marking all notifications as read:', error);
            return throwError(() => error);
          })
        );
      })
    );
  }

  private startTokenRefresh(): void {
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        const refreshed = await this.keycloakService.updateToken(300);
        if (refreshed) {
          console.log('Token refreshed successfully');
          await this.reconnectWebSocket();
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, 300000); // 5 minutes
  }

  private async reconnectWebSocket(): Promise<void> {
    if (this.stompClient) {
      this.stompClient.deactivate();
    }
    await this.connectWebSocket();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearInterval(this.tokenRefreshInterval);
    if (this.stompClient) {
      this.stompClient.deactivate();
    }
  }
}