import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; 
import { KeycloakService } from '../../core/services/keycloak.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule], 
  template: `
    <div class="register-container">
      <h1>Inscription</h1>
      <p>Redirection vers Keycloak...</p>
      <div *ngIf="error" class="error">{{ error }}</div>
    </div>
  `,
  styles: [
    `
      .register-container {
        max-width: 400px;
        margin: 2rem auto;
        padding: 2rem;
        text-align: center;
      }
      .error {
        color: red;
        margin-top: 1rem;
      }
    `,
  ],
})
export class RegisterComponent implements OnInit {
  error: string | null = null;

  constructor(
    private keycloak: KeycloakService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const isAuthenticated = await this.keycloak.isAuthenticated();
      if (isAuthenticated) {
        await this.router.navigate(['/']);
      } else {
        await this.keycloak.register();
      }
    } catch (error) {
      console.error('Register error:', error);
      this.error = 'Échec de l’inscription. Veuillez réessayer.';
    }
  }
}