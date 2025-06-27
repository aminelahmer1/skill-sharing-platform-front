import { Component, ChangeDetectorRef, OnDestroy, Input } from '@angular/core';
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
  @Input() userId: string = '';

  notifications: Notification[] = [];
  loading = true;
  error: string | null = null;
  private subscriptions = new Subscription();
  private isDestroyed = false; // Nouveau flag pour gérer l'état de destruction

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.subscriptions.add(
      this.notificationService.notifications$.subscribe({
        next: (notifications) => {
          this.notifications = notifications;
          this.loading = false;
          if (!this.isDestroyed) {
            this.cdr.markForCheck(); // Changement à markForCheck
          }
        },
        error: (err) => {
          console.error('Erreur de chargement des notifications:', err);
          this.error = 'Échec du chargement';
          this.loading = false;
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
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
          notification.read = true;
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          console.error('Échec de mise à jour (markAsRead):', err);
          this.error = 'Échec de la mise à jour';
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
        }
      })
    );
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();
    if (!this.notifications.some(n => !n.read)) return;

    this.subscriptions.add(
      this.notificationService.markAllAsRead().subscribe({
        next: () => {
          this.notifications = this.notifications.map(n => ({ ...n, read: true }));
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          console.error('Échec du markAllAsRead:', err);
          this.error = 'Échec de la mise à jour';
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
        }
      })
    );
  }

  // Méthode pour tester la réception


  get unreadNotificationsCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  getNotificationIcon(type: string): string {
    switch (type?.toUpperCase()) {
      case 'EXCHANGE_REJECTED': return '❌';
      case 'EXCHANGE_ACCEPTED': return '✅';
      default: return '🔔';
    }
  }

  trackById(index: number, notification: Notification): number {
    return notification.id;
  }

  ngOnDestroy(): void {
    this.isDestroyed = true; // Marquer le composant comme détruit
    this.subscriptions.unsubscribe();
  }
}