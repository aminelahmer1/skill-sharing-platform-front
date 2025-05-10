import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar-producer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar-producer.component.html',
  styleUrls: ['./navbar-producer.component.css'],
})
export class NavbarProducerComponent {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText!: string;
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

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
}