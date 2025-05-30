import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { NavbarProducerComponent } from '../navbar-producer/navbar-producer.component';
import { HeroProducerComponent } from '../hero-producer/hero-producer.component';
import { FooterProducerComponent } from '../footer-producer/footer-producer.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface Session {
  id: number;
  title: string;
  date: string;
  time: string;
  duration: number;
  receiver: string;
}

@Component({
  selector: 'app-producer-template',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    NavbarProducerComponent,
    HeroProducerComponent,
    FooterProducerComponent,
    MatSnackBarModule,
  ],
  templateUrl: './producer-template.component.html',
  styleUrls: ['./producer-template.component.css'],
})
export class ProducerTemplateComponent implements OnInit {
  isMenuActive = false;
  logoutButtonText = 'Déconnexion';
  isLoading = true;
  error: string | null = null;
  userProfile: Keycloak.KeycloakProfile | null = null;
  sessions: Session[] = [
    { id: 1, title: 'Cours de JavaScript', date: '2025-04-25', time: '14:00', duration: 60, receiver: 'Alice' },
    { id: 2, title: 'Atelier React', date: '2025-04-26', time: '18:00', duration: 120, receiver: 'Bob' },
  ];

  constructor(
    private keycloakService: KeycloakService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('ProducerTemplateComponent: Initializing');
    this.isLoading = true;
    try {
      const isAuthenticated = await this.keycloakService.isAuthenticated();
      const roles = this.keycloakService.getRoles();
      console.log('ProducerTemplateComponent: isAuthenticated=', isAuthenticated, 'roles=', roles);
      if (!isAuthenticated || !roles.includes('PRODUCER')) {
        console.warn('ProducerTemplateComponent: Access denied - redirecting to login');
        this.snackBar.open('Accès refusé. Veuillez vous connecter.', 'Fermer', { duration: 3000 });
        await this.router.navigate(['/login']);
        return;
      }
      this.userProfile = await this.keycloakService.getUserProfile();
      console.log('ProducerTemplateComponent: userProfile=', this.userProfile);
    } catch (error) {
      console.error('ProducerTemplateComponent: Init error:', error);
      this.error = 'Erreur lors du chargement. Veuillez réessayer.';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
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
      this.snackBar.open('Déconnexion réussie.', 'Fermer', { duration: 3000 });
    } catch (error) {
      console.error('ProducerTemplateComponent: Logout error:', error);
      this.error = 'Erreur lors de la déconnexion. Veuillez réessayer.';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
    }
  }

  toggleMenu(): void {
    this.isMenuActive = !this.isMenuActive;
  }

  isHomeRoute(): boolean {
    return this.router.url === '/producer';
  }
}