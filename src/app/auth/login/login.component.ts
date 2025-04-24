import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeycloakService } from '../../core/services/keycloak.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-container">
      <h1>Connexion</h1>
      <p *ngIf="!error">Redirection vers Keycloak...</p>
      <div *ngIf="error" class="error">{{ error }}</div>
      <button *ngIf="error" (click)="retryLogin()">Réessayer la connexion</button>
    </div>
  `,
  styles: [
    `
      .login-container {
        max-width: 400px;
        margin: 2rem auto;
        padding: 2rem;
        text-align: center;
      }
      .error {
        color: red;
        margin-top: 1rem;
      }
      button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #6c5ce7;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  error: string | null = null;

  constructor(
    private keycloak: KeycloakService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    console.log('LoginComponent: ngOnInit started');
    try {
      const isAuthenticated = await this.keycloak.isAuthenticated();
      console.log('LoginComponent: isAuthenticated=', isAuthenticated);
      if (isAuthenticated) {
        const roles = this.keycloak.getRoles();
        const returnUrl = localStorage.getItem('returnUrl') || '/';
        console.log('LoginComponent: roles=', roles, 'returnUrl=', returnUrl);
        localStorage.removeItem('returnUrl');

        if (roles.includes('PRODUCER') && returnUrl.includes('producer')) {
          console.log('LoginComponent: Navigating to /producer');
          await this.router.navigate(['/producer']);
        } else if (roles.includes('RECEIVER') && returnUrl.includes('receiver')) {
          console.log('LoginComponent: Navigating to /receiver');
          await this.router.navigate(['/receiver']);
        } else {
          console.log('LoginComponent: Navigating to /');
          await this.router.navigate(['/']);
        }
      } else {
        console.log('LoginComponent: Triggering Keycloak login');
        await this.keycloak.login(window.location.origin);
      }
    } catch (error) {
      console.error('LoginComponent: Error', error);
      this.error = 'Échec de la connexion. Veuillez réessayer.';
    }
  }

  async retryLogin(): Promise<void> {
    console.log('LoginComponent: Retrying login');
    this.error = null;
    try {
      await this.keycloak.login(window.location.origin);
    } catch (error) {
      console.error('LoginComponent: Retry login failed', error);
      this.error = 'Échec de la connexion. Veuillez réessayer.';
    }
  }
}