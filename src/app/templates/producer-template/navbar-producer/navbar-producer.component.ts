import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationDropdownComponent } from '../../../features/shared/notification-dropdown/notification-dropdown.component';

@Component({
  selector: 'app-navbar-producer',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationDropdownComponent],
  templateUrl: './navbar-producer.component.html',
  styleUrls: ['./navbar-producer.component.css'],
})
export class NavbarProducerComponent implements OnChanges {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText: string = 'Déconnexion';
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

  showNotifications = false;
  unreadCount = 0;
  userId: string | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userProfile']) {
      this.userId = this.userProfile?.sub;
      if (!this.userId) {
        console.warn('userProfile est indéfini ou n’a pas de sub');
      }
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

  toggleNotifications() {
    if (!this.userId) {
      console.error('Impossible d’afficher les notifications : userId est indéfini');
      return;
    }
    this.showNotifications = !this.showNotifications;
  }

  updateUnreadCount(count: number) {
    this.unreadCount = count;
  }
}