import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Notification } from '../../../models/Notification/notification.model';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notification-dropdown',
  templateUrl: './notification-dropdown.component.html',
  styleUrls: ['./notification-dropdown.component.css'],
  animations: [
    trigger('slideInOut', [
      state('in', style({
        transform: 'translateY(0)',
        opacity: 1
      })),
      transition(':enter', [
        style({
          transform: 'translateY(-20px)',
          opacity: 0
        }),
        animate('200ms ease-out')
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({
          transform: 'translateY(-20px)',
          opacity: 0
        }))
      ])
    ]),
    trigger('highlightUnread', [
      state('unread', style({
        backgroundColor: 'rgba(0, 123, 255, 0.1)'
      })),
      state('read', style({
        backgroundColor: 'transparent'
      })),
      transition('unread => read', animate('300ms ease-out'))
    ])
  ]
})
export class NotificationDropdownComponent implements OnInit, OnDestroy {
  @Input() userId: string = '';
  @Output() unreadCountChange = new EventEmitter<number>();

  notifications: Notification[] = [];
  showDropdown = false;
  unreadCount = 0;
  private notificationsSubscription: Subscription | null = null;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    if (this.userId) {
      this.loadNotifications();
      this.subscribeToRealtime();
    }
  }

  private loadNotifications(): void {
    this.notificationService.getNotifications().subscribe({
      next: notifications => {
        this.notifications = notifications;
        this.updateUnreadCount();
      },
      error: error => console.error('Failed to load notifications', error)
    });
  }

  private subscribeToRealtime(): void {
    this.notificationsSubscription = this.notificationService.notifications$.subscribe(
      notifications => {
        this.notifications = notifications;
        this.updateUnreadCount();
      }
    );
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  markAsRead(notification: Notification): void {
    if (notification.read) return;

    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => notification.read = true,
      error: error => console.error('Failed to mark as read', error)
    });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.notifications = this.notifications.map(n => ({ ...n, read: true }));
        this.updateUnreadCount();
      },
      error: error => console.error('Failed to mark all as read', error)
    });
  }

  private updateUnreadCount(): void {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    this.unreadCountChange.emit(this.unreadCount);
  }

  getNotificationState(notification: Notification): string {
    return notification.read ? 'read' : 'unread';
  }

  getNotificationClasses(notification: Notification): any {
    return {
      'unread': !notification.read,
      'read': notification.read,
      [notification.type.toLowerCase()]: true
    };
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'EXCHANGE_CREATED': return '📩';
      case 'EXCHANGE_ACCEPTED': return '✅';
      case 'EXCHANGE_REJECTED': return '❌';
      case 'SESSION_STARTED': return '⏱️';
      case 'SESSION_COMPLETED': return '✅';
      default: return '🔔';
    }
  }

  ngOnDestroy(): void {
    this.notificationsSubscription?.unsubscribe();
  }
}