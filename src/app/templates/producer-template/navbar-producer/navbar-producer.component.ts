// Fichier : src/app/templates/producer-template/navbar-producer/navbar-producer.component.ts (amélioré)

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationDropdownComponent } from '../../../features/shared/notification-dropdown/notification-dropdown.component';
import { MessageNotificationBadgeComponent } from '../../../features/shared/message-notification-badge/message-notification-badge.component';
import { QuickChatComponent } from '../../../features/messaging/quick-chat/quick-chat.component';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Subscription } from 'rxjs';
import { GlobalQuickChatComponent } from "../../../features/messaging/global-quick-chat/global-quick-chat.component";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: 'app-navbar-producer',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NotificationDropdownComponent,
    MessageNotificationBadgeComponent,
    QuickChatComponent,
    GlobalQuickChatComponent,
    MatIcon
],
  templateUrl: './navbar-producer.component.html',
  styleUrls: ['./navbar-producer.component.css'],
})
export class NavbarProducerComponent implements OnInit, OnDestroy {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText: string = 'Déconnexion';
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

  showNotifications = false;
  unreadCount = 0;
  
  private subscriptions = new Subscription();

  get userId(): string {
    return this.userProfile?.sub || this.userProfile?.id || '';
  }

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    // Utilisation de subscriptions consolidées comme receiver
    this.subscriptions.add(
      this.notificationService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
        console.log('Producer navbar unread count updated:', count); // Debug
      })
    );
  }

  // AJOUT: Fermeture automatique comme receiver
  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notification-container') &&
        !target.closest('.notification-dropdown') &&
        this.showNotifications) {
      this.showNotifications = false;
    }
  }

  onLogoutHover() {
    this.logoutButtonText = '🚪 Déconnexion';
  }

  onLogoutHoverOut() {
    this.logoutButtonText = 'Déconnexion';
  }

  handleLogout() {
    this.logout.emit();
  }

  toggleMenu() {
    this.menuToggled.emit();
  }

  // AMÉLIORÉ: Même logique que receiver
  toggleNotifications(event: Event) {
    event.stopPropagation();
    this.showNotifications = !this.showNotifications;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}