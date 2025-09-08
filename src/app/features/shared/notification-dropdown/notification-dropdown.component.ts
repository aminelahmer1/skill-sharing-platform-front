import { Component, ChangeDetectorRef, OnDestroy, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Notification } from '../../../models/Notification/notification.model';
import { KeycloakService } from '../../../core/services/keycloak.service';
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
  private userRoles: string[] = [];

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private keycloakService: KeycloakService
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.getUserRoles();
  }

  private async getUserRoles(): Promise<void> {
    try {
      this.userRoles = await this.keycloakService.getRoles();
    } catch (error) {
      console.error('Erreur lors de la récupération des rôles:', error);
    }
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
    
    // Vérifier si c'est une notification de demande non lue pour un producer
    const shouldRedirect = this.shouldRedirectToRequests(notification);
    
    if (!notification || notification.read) {
      // Si déjà lue, ne pas rediriger
      return;
    }

    this.subscriptions.add(
      this.notificationService.markAsRead(notification.id).subscribe({
        next: () => {
          notification.read = true;
          if (!this.isDestroyed) {
            this.cdr.markForCheck();
          }
          
          // Rediriger vers la page des demandes si c'est une notification EXCHANGE_CREATED pour un producer
          if (shouldRedirect) {
            this.router.navigate(['/producer/requests']);
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

  private shouldRedirectToRequests(notification: Notification): boolean {
    // Rediriger seulement si:
    // 1. L'utilisateur est un PRODUCER
    // 2. La notification est de type EXCHANGE_CREATED
    // 3. La notification n'est pas encore lue
    return this.userRoles.includes('PRODUCER') && 
           notification.type === 'EXCHANGE_CREATED' && 
           !notification.read;
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