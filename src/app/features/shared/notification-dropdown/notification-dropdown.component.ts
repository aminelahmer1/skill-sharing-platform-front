import { Component, ChangeDetectorRef, OnDestroy, Input, OnInit } from '@angular/core';
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
export class NotificationDropdownComponent implements OnInit, OnDestroy {
  @Input() userId: string = '';
  
  notifications: Notification[] = [];
  loading = true;
  error: string | null = null;
  private subscriptions = new Subscription();
  private isDestroyed = false;

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading = true;
    this.error = null;
    
    this.subscriptions.add(
      this.notificationService.notifications$.subscribe({
        next: (notifications) => {
          // Trier les notifications par date de création (les plus récentes en premier)
          this.notifications = notifications.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          this.loading = false;
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          console.error('Erreur de chargement des notifications:', err);
          this.error = 'Échec du chargement des notifications';
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

  get unreadNotificationsCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  getNotificationIcon(type: string): string {
    const typeUpper = type?.toUpperCase();
    switch (typeUpper) {
      case 'EXCHANGE_CREATED': return '👤';
      case 'EXCHANGE_ACCEPTED': return '✅';
      case 'EXCHANGE_REJECTED': return '❌';
      case '24_HOUR_REMINDER': return '📅';
      case '1_HOUR_REMINDER': return '⏰';
      case 'LIVESTREAM_STARTED': return '🔴';
      case 'SESSION_SCHEDULED': return '📌';
      case 'SESSION_COMPLETED': return '✔️';
      default: return '🔔';
    }
  }

  getNotificationClass(type: string): string {
    const typeUpper = type?.toUpperCase();
    switch (typeUpper) {
      case 'EXCHANGE_ACCEPTED': return 'success';
      case 'EXCHANGE_REJECTED': return 'danger';
      case '24_HOUR_REMINDER': return 'info';
      case '1_HOUR_REMINDER': return 'warning';
      case 'LIVESTREAM_STARTED': return 'live';
      case 'SESSION_COMPLETED': return 'success';
      default: return 'default';
    }
  }

  // Suppression de formatMessage - affichage du message complet
  // formatMessage(notification: Notification): string {
  //   if (notification.message.length > 100) {
  //     return notification.message.substring(0, 97) + '...';
  //   }
  //   return notification.message;
  // }

  getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short' 
    });
  }

  trackById(index: number, notification: Notification): number {
    return notification.id;
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.subscriptions.unsubscribe();
  }
}