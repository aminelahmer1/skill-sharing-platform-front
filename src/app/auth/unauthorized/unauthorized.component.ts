import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  template: `
    <div class="unauthorized-container">
      <h1>Accès non autorisé</h1>
      <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
      <button (click)="goHome()">Retour à l'accueil</button>
    </div>
  `,
  styles: [
    `
      .unauthorized-container {
        max-width: 500px;
        margin: 2rem auto;
        padding: 2rem;
        text-align: center;
      }
      button {
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
export class UnauthorizedComponent {
  constructor(private router: Router) {}

  async goHome(): Promise<void> {
    console.debug('Navigating to home');
    await this.router.navigate(['/']);
  }
}