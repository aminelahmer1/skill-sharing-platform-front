import { Component, OnInit } from '@angular/core';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { Router, RouterModule } from '@angular/router';
import { NavbarReceiverComponent } from '../navbar-receiver/navbar-receiver.component';
import { HeroReceiverComponent } from '../hero-receiver/hero-receiver.component';
import { FooterReceiverComponent } from '../footer-receiver/footer-receiver.component';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface Session {
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
  imports: [
    CommonModule,
    RouterModule,
    NavbarReceiverComponent,
    HeroReceiverComponent,
    FooterReceiverComponent,
    MatSnackBarModule
  ],
  templateUrl: './receiver-template.component.html',
  styleUrls: ['./receiver-template.component.css']
})
export class ReceiverTemplateComponent implements OnInit {
  isMenuActive = false;
  logoutButtonText = 'Déconnexion';
  isLoading = true;
  error: string | null = null;
  userProfile: any;
  sessions: Session[] = [
    { 
      id: 1, 
      title: 'Cours de JavaScript', 
      date: '2025-04-25', 
      time: '14:00', 
      duration: 60, 
      producer: 'Jean' 
    },
    { 
      id: 2, 
      title: 'Atelier React', 
      date: '2025-04-26', 
      time: '18:00', 
      duration: 120, 
      producer: 'Sophie' 
    },
  ];

  constructor(
    private keycloakService: KeycloakService,
    private router: Router,
    private snackBar: MatSnackBar
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
        this.snackBar.open('Accès refusé. Veuillez vous connecter.', 'Fermer', { duration: 3000 });
        await this.router.navigate(['/login']);
        return;
      }
      
      this.userProfile = await this.keycloakService.getUserProfile();
      console.log('ReceiverTemplateComponent: userProfile=', this.userProfile);
    } catch (error) {
      console.error('ReceiverTemplateComponent: Init error:', error);
      this.error = 'Erreur lors du chargement. Veuillez réessayer.';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  isHomeRoute(): boolean {
    return this.router.url === '/receiver';
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
      console.error('ReceiverTemplateComponent: Logout error:', error);
      this.error = 'Erreur lors de la déconnexion. Veuillez réessayer.';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
    }
  }

  toggleMenu(): void {
    this.isMenuActive = !this.isMenuActive;
  }
}