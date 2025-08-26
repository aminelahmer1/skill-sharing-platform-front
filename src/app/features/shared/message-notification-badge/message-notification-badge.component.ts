import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MessageNotificationService, MessageNotification } from '../../../core/services/messaging/message-notification.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-message-notification-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-notification-badge.component.html',
  styleUrls: ['./message-notification-badge.component.css'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ transform: 'translateY(-20px)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(-20px)', opacity: 0 }))
      ])
    ]),
    trigger('badgePulse', [
      transition(':increment', [
        animate('300ms ease', style({ transform: 'scale(1.3)' })),
        animate('200ms ease', style({ transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class MessageNotificationBadgeComponent implements OnInit, OnDestroy {
  unreadCount = 0;
  notifications: MessageNotification[] = [];
  showDropdown = false;
  private destroy$ = new Subject<void>();

  constructor(
    private notificationService: MessageNotificationService,
    private router: Router
  ) {}

  ngOnInit() {
    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.unreadCount = count;
      });

    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications.slice(0, 10); // Afficher max 10 notifications
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown = !this.showDropdown;
    
    if (this.showDropdown) {
      // Ajouter un listener pour fermer le dropdown
      setTimeout(() => {
        document.addEventListener('click', this.closeDropdown);
      }, 0);
    }
  }

  private closeDropdown = () => {
    this.showDropdown = false;
    document.removeEventListener('click', this.closeDropdown);
  }

  openConversation(notification: MessageNotification) {
    this.notificationService.markAsRead(notification.id);
    this.showDropdown = false;
    this.router.navigate(['/messenger'], { 
      queryParams: { conversationId: notification.conversationId }
    });
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  openMessenger() {
    this.showDropdown = false;
    this.router.navigate(['/messenger']);
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes} min`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `Il y a ${days}j`;
    
    return new Date(date).toLocaleDateString('fr-FR');
  }
  
onAvatarError(event: any, senderName: string) {
  // Si l'image ne charge pas, utiliser un avatar par défaut
  const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe'];
  const colorIndex = Math.abs(this.hashCode(senderName)) % colors.length;
  
  event.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=${colors[colorIndex]}&color=fff&size=100&bold=true`;
}

private hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}
}