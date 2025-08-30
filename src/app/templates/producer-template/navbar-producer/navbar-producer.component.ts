// Fichier : src/app/templates/producer-template/navbar-producer/navbar-producer.component.ts (corrigé)

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationDropdownComponent } from '../../../features/shared/notification-dropdown/notification-dropdown.component';
import { MessageNotificationBadgeComponent } from '../../../features/shared/message-notification-badge/message-notification-badge.component';
import { QuickChatComponent } from '../../../features/messaging/quick-chat/quick-chat.component';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Subscription } from 'rxjs';
import { GlobalQuickChatComponent } from "../../../features/messaging/global-quick-chat/global-quick-chat.component";

@Component({
  selector: 'app-navbar-producer',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NotificationDropdownComponent,
    MessageNotificationBadgeComponent, // AJOUT: Import du badge de notification messages
    QuickChatComponent,
    GlobalQuickChatComponent
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
  userId: string | undefined;

  private unreadCountSub?: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    // S'abonner directement au service pour les mises à jour
    this.unreadCountSub = this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
  }

  ngOnChanges(): void {
    this.userId = this.userProfile?.id;
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

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  ngOnDestroy(): void {
    this.unreadCountSub?.unsubscribe();
  }
}