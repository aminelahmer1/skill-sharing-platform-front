import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { Router } from '@angular/router';

interface Session {
  id: number;
  title: string;
  date: string;
  time: string;
  duration: number;
  producer: string;
}

@Component({
  selector: 'app-receiver-template',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './receiver-template.component.html',
  styleUrls: ['./receiver-template.component.css'],
})
export class ReceiverTemplateComponent implements OnInit {
  isMenuActive = false;
  logoutButtonText = 'Déconnexion';
  isLoading = true;
  error: string | null = null;
  userProfile: Keycloak.KeycloakProfile | null = null;
  sessions: Session[] = [
    { id: 1, title: 'Cours de JavaScript', date: '2025-04-25', time: '14:00', duration: 60, producer: 'Jean' },
    { id: 2, title: 'Atelier React', date: '2025-04-26', time: '18:00', duration: 120, producer: 'Sophie' },
  ];

  constructor(
    private keycloakService: KeycloakService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('ReceiverTemplateComponent: Initializing');
    this.isLoading = true;
    try {
      const isAuthenticated = await this.keycloakService.isAuthenticated();
      const roles = this.keycloakService.getRoles();
      console.log('ReceiverTemplateComponent: isAuthenticated=', isAuthenticated, 'roles=', roles);
      if (!isAuthenticated || !roles.includes('RECEIVER')) {
        console.warn('ReceiverTemplateComponent: Access denied - redirecting to login');
        await this.router.navigate(['/login']);
        return;
      }
      this.userProfile = await this.keycloakService.getUserProfile();
      console.log('ReceiverTemplateComponent: userProfile=', this.userProfile);
    } catch (error) {
      console.error('ReceiverTemplateComponent: Init error:', error);
      this.error = 'Erreur lors du chargement. Veuillez réessayer.';
    } finally {
      this.isLoading = false;
    }
  }

  onLogoutHover(): void {
    this.logoutButtonText = '🚪 Déconnexion';
  }

  onLogoutHoverOut(): void {
    this.logoutButtonText = 'Déconnexion';
  }

  async logout(): Promise<void> {
    try {
      this.logoutButtonText = '👋 Déconnexion...';
      await this.keycloakService.logout();
    } catch (error) {
      console.error('ReceiverTemplateComponent: Logout error:', error);
      this.error = 'Erreur lors de la déconnexion. Veuillez réessayer.';
    }
  }

  toggleMenu(): void {
    this.isMenuActive = !this.isMenuActive;
  }
}