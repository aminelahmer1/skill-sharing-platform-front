import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationDropdownComponent } from '../../../features/shared/notification-dropdown/notification-dropdown.component';

@Component({
  selector: 'app-navbar-receiver',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationDropdownComponent],
  templateUrl: './navbar-receiver.component.html',
  styleUrls: ['./navbar-receiver.component.css']
})
export class NavbarReceiverComponent {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText!: string;
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

  showNotifications = false;
  unreadCount = 0;
get userId(): string {
  return this.userProfile?.sub || '';
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

  updateUnreadCount(count: number) {
    this.unreadCount = count;
  }
}