import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLinkActive, RouterModule } from '@angular/router';
@Component({
  selector: 'app-navbar-receiver',
  standalone: true,
  imports: [CommonModule,RouterModule,RouterLinkActive],
  templateUrl: './navbar-receiver.component.html',
  styleUrls: ['./navbar-receiver.component.css']
})
export class NavbarReceiverComponent {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText!: string;
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

  // Ajoutez ces méthodes
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