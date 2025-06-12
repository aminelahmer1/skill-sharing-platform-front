import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { KeycloakService } from '../keycloak.service';
import { Observable, from, BehaviorSubject, of, Subject } from 'rxjs';
import { switchMap, catchError, takeUntil } from 'rxjs/operators';
import { Client, IFrame, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Notification } from '../../../models/Notification/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/notifications';
  private stompClient: Client = new Client();
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private destroy$ = new Subject<void>();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.initializeWebSocketConnection();
  }

  private initializeWebSocketConnection(): void {
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8822/ws/notifications'),
      debug: (str: string) => console.debug(str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: this.onWebSocketConnect.bind(this),
      onStompError: this.onWebSocketError.bind(this),
      onDisconnect: this.onWebSocketDisconnect.bind(this),
    });

    this.stompClient.activate();
  }

  private onWebSocketConnect(frame: IFrame): void {
    console.log('WebSocket connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;

    this.keycloakService.getUserId().then(userId => {
      if (userId) {
        this.stompClient.subscribe(`/user/${userId}/queue/notifications`, (message: IMessage) => {
          try {
            const notification: Notification = JSON.parse(message.body);
            const currentNotifications = this.notificationsSubject.value;
            this.notificationsSubject.next([...currentNotifications, notification]);
          } catch (e) {
            console.error('Error parsing notification:', e);
          }
        });
      } else {
        console.error('No userId available for WebSocket subscription');
      }
    }).catch(err => console.error('Failed to get userId:', err));
  }

  private onWebSocketDisconnect(): void {
    console.log('WebSocket disconnected');
    this.isConnected = false;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.stompClient.activate(), 5000);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private onWebSocketError(error: any): void {
    console.error('WebSocket error:', error);
    if (!this.isConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect after error (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.stompClient.activate(), 5000);
    }
  }

  getNotifications(userId: string): Observable<Notification[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Notification[]>(`${this.apiUrl}/user/${userId}`, { headers }).pipe(
          catchError(err => {
            console.error('Failed to fetch notifications:', err);
            if (err.status === 401) {
              console.warn('Unauthorized, redirecting to login...');
              this.keycloakService.login(); // Redirige vers Keycloak si token invalide
            }
            return of([]);
          })
        );
      })
    );
  }

  markAsRead(notificationId: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<void>(`${this.apiUrl}/${notificationId}/read`, null, { headers }).pipe(
          catchError(err => {
            console.error('Failed to mark notification as read:', err);
            if (err.status === 401) {
              console.warn('Unauthorized, redirecting to login...');
              this.keycloakService.login();
            }
            return of(undefined);
          })
        );
      })
    );
  }

  getRealTimeNotifications(): Observable<Notification[]> {
    return this.notificationsSubject.asObservable();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.stompClient) {
      this.stompClient.deactivate();
    }
  }
}