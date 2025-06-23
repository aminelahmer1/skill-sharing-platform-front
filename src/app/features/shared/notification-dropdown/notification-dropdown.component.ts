import { Component, Input, Output, EventEmitter, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Notification } from '../../../models/Notification/notification.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-dropdown.component.html',
  styleUrls: ['./notification-dropdown.component.css']
})
export class NotificationDropdownComponent implements OnDestroy {
  @Input() userId!: string;
  @Output() unreadCountChange = new EventEmitter<number>();

  notifications: Notification[] = [];
  loading = true;
  error: string | null = null;

  private subscriptions = new Subscription();

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadNotifications();
  }

  private loadNotifications(): void {
    this.subscriptions.add(
      this.notificationService.notifications$.subscribe({
        next: (notifications) => {
          console.log('Received notifications:', notifications);
          this.notifications = notifications.filter(n =>
            n &&
            typeof n.id === 'number' &&
            typeof n.read === 'boolean' &&
            typeof n.message === 'string' &&
            typeof n.userId === 'string' &&
            typeof n.type === 'string' &&
            typeof n.sent === 'boolean' &&
            !!n.createdAt
          );
          console.log('Filtered notifications:', this.notifications);
          this.updateUnreadCount();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Erreur de chargement des notifications:', err);
          this.error = 'Échec du chargement';
          this.loading = false;
          this.cdr.markForCheck();
        }
      })
    );
  }

  markAsRead(notification: Notification, event: Event): void {
    event.stopPropagation();
    if (!notification || notification.read) return;

    this.subscriptions.add(
      this.notificationService.markAsRead(notification.id).subscribe({
        next: () => {
          this.updateUnreadCount();
        },
        error: (err) => {
          console.error('Échec de mise à jour (markAsRead):', err);
          this.error = 'Échec de la mise à jour';
          this.cdr.markForCheck();
        }
      })
    );
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();
    if (!this.notifications.some(n => n && !n.read)) return;

    this.subscriptions.add(
      this.notificationService.markAllAsRead().subscribe({
        next: () => {
          this.updateUnreadCount();
        },
        error: (err) => {
          console.error('Échec du markAllAsRead:', err);
          this.error = 'Échec de la mise à jour';
          this.cdr.markForCheck();
        }
      })
    );
  }

  private updateUnreadCount(): void {
    const count = this.notifications.filter(
      n => n && typeof n.read === 'boolean' && !n.read
    ).length;
    console.log('Unread count:', count);
    this.unreadCountChange.emit(count);
  }

  get unreadNotificationsCount(): number {
    return this.notifications.filter(
      n => n && typeof n.read === 'boolean' && !n.read
    ).length;
  }

  getNotificationIcon(type: string): string {
    switch (type?.toUpperCase()) {
      case 'EXCHANGE_REJECTED': return '❌';
      case 'EXCHANGE_ACCEPTED': return '✅';
      default: return '🔔';
    }
  }

  trackById(index: number, notification: Notification | null): number {
    return notification?.id ?? index;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}