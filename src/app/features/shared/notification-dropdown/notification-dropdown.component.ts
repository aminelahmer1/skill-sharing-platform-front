import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Notification } from '../../../models/Notification/notification.model';

@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-dropdown.component.html',
  styleUrls: ['./notification-dropdown.component.css']
})
export class NotificationDropdownComponent implements OnInit {
  @Input() userId!: string;
  @Output() unreadCountChange = new EventEmitter<number>();
  notifications: Notification[] = [];
  unreadCount = 0;
  errorMessage: string | null = null;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    if (!this.userId) {
      this.errorMessage = 'Utilisateur non connecté';
      return;
    }
    this.loadNotifications();
    this.subscribeToRealTimeUpdates();
  }

  loadNotifications(): void {
    this.notificationService.getNotifications(this.userId).subscribe({
      next: (notifications) => {
        this.notifications = notifications;
        this.updateUnreadCount();
        this.errorMessage = null;
      },
      error: (err) => {
        this.errorMessage = `Erreur lors du chargement des notifications: ${err.status === 401 ? 'Authentification requise, veuillez vous reconnecter' : (err.status === 0 ? 'Problème de connexion' : err.message)}`;
        console.error('Erreur:', err);
      }
    });
  }

  subscribeToRealTimeUpdates(): void {
    this.notificationService.getRealTimeNotifications().subscribe({
      next: (notifications) => {
        this.notifications = notifications;
        this.updateUnreadCount();
        this.errorMessage = null;
      },
      error: (err) => {
        this.errorMessage = 'Erreur WebSocket: Connexion échouée';
        console.error('Erreur WebSocket:', err);
      }
    });
  }

  markAsRead(notification: Notification): void {
    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        notification.read = true;
        this.updateUnreadCount();
      },
      error: (err) => {
        this.errorMessage = `Erreur lors de la mise à jour: ${err.message}`;
        console.error('Erreur:', err);
      }
    });
  }

  updateUnreadCount(): void {
    this.unreadCount = this.notifications.filter(n => !n.read).length;
    this.unreadCountChange.emit(this.unreadCount);
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'EXCHANGE_CREATED': return '📩';
      case 'EXCHANGE_ACCEPTED': return '✅';
      case 'EXCHANGE_REJECTED': return '❌';
      case 'SESSION_UPDATE': return '📅';
      default: return '🔔';
    }
  }
}