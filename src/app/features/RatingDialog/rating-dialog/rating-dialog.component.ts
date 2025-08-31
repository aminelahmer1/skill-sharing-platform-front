import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RatingService, RatingRequest } from '../../../core/services/Rating/rating.service';
import { Router } from '@angular/router';

export interface RatingDialogData {
  exchangeId: number;
  skillName: string;
  producerName: string;
  sessionDuration?: string;
  existingRating?: number;
  existingComment?: string;
}

@Component({
  selector: 'app-rating-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <div class="rating-dialog">
      <div class="dialog-header">
        <h2 mat-dialog-title>Évaluer la session</h2>
        <button mat-icon-button (click)="skipRating()" class="close-btn">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        <div class="session-info">
          <h3>{{ data.skillName }}</h3>
          <p class="producer-name">Par {{ data.producerName }}</p>
          <p class="session-duration" *ngIf="data.sessionDuration">
            <mat-icon>schedule</mat-icon>
            Durée: {{ data.sessionDuration }}
          </p>
        </div>

        <div class="rating-section">
          <p class="rating-label">Comment évaluez-vous cette session ?</p>
          
          <div class="stars-container">
            <div class="stars-row">
              <button 
                *ngFor="let star of stars; let i = index"
                class="star-btn"
                [class.filled]="isStarFilled(i)"
                [class.hover]="isStarHovered(i)"
                (click)="selectRating(i + 1)"
                (mouseenter)="hoverStar(i + 1)"
                (mouseleave)="hoverStar(0)"
                [disabled]="isSubmitting"
                [attr.aria-label]="'Donner ' + (i + 1) + ' étoile' + (i > 0 ? 's' : '')">
                <mat-icon>{{ isStarFilled(i) ? 'star' : 'star_border' }}</mat-icon>
              </button>
            </div>
            <div class="rating-text" [ngClass]="getRatingTextClass()">
              {{ getRatingText() }}
            </div>
          </div>

          <mat-form-field appearance="outline" class="comment-field">
            <mat-label>Commentaire (optionnel)</mat-label>
            <textarea 
              matInput
              [(ngModel)]="comment"
              placeholder="Partagez votre expérience..."
              rows="4"
              maxlength="500"
              [disabled]="isSubmitting">
            </textarea>
            <mat-hint align="end">{{ comment.length }}/500</mat-hint>
          </mat-form-field>

          <div class="rating-tips">
            <p class="tip-title">
              <mat-icon>info</mat-icon>
              Votre évaluation aide le producteur à s'améliorer
            </p>
            <ul>
              <li>5 ⭐ - Excellent, dépassé les attentes</li>
              <li>4 ⭐ - Très bon, satisfait</li>
              <li>3 ⭐ - Bon, conforme aux attentes</li>
              <li>2 ⭐ - Moyen, peut mieux faire</li>
              <li>1 ⭐ - Insatisfaisant</li>
            </ul>
          </div>
        </div>

        <div class="loading-overlay" *ngIf="isSubmitting">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Envoi de votre évaluation...</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button 
          mat-stroked-button 
          (click)="skipRating()"
          [disabled]="isSubmitting">
          Plus tard
        </button>
        <button 
          mat-raised-button 
          color="primary"
          (click)="submitRating()"
          [disabled]="!selectedRating || isSubmitting">
          <mat-icon>send</mat-icon>
          {{ data.existingRating ? 'Modifier' : 'Envoyer' }} l'évaluation
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .rating-dialog {
      width: 500px;
      max-width: 90vw;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 1.5rem;
      color: #333;
    }

    .close-btn {
      position: absolute;
      right: 8px;
      top: 8px;
    }

    .session-info {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .session-info h3 {
      margin: 0 0 8px 0;
      font-size: 1.3rem;
    }

    .producer-name {
      opacity: 0.95;
      margin: 0 0 8px 0;
    }

    .session-duration {
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.9;
      margin: 0;
      font-size: 0.9rem;
    }

    .session-duration mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .rating-section {
      padding: 0 8px;
    }

    .rating-label {
      text-align: center;
      font-size: 1.1rem;
      color: #555;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .stars-container {
      text-align: center;
      margin-bottom: 24px;
    }

    .stars-row {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .star-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      transition: all 0.2s ease;
      transform-origin: center;
      border-radius: 50%;
    }

    .star-btn:hover:not(:disabled) {
      transform: scale(1.15);
      background: rgba(255, 215, 0, 0.1);
    }

    .star-btn:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .star-btn mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #ddd;
      transition: all 0.2s ease;
    }

    .star-btn.filled mat-icon {
      color: #FFD700;
      text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
    }

    .star-btn.hover mat-icon {
      color: #FFA500;
      transform: scale(1.1);
    }

    .star-btn.filled {
      animation: starSelected 0.3s ease-out;
    }

    @keyframes starSelected {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }

    .rating-text {
      font-size: 1rem;
      color: #666;
      font-weight: 500;
      min-height: 24px;
      transition: color 0.2s ease;
    }

    .rating-text.excellent { color: #4CAF50; }
    .rating-text.very-good { color: #8BC34A; }
    .rating-text.good { color: #FFC107; }
    .rating-text.average { color: #FF9800; }
    .rating-text.poor { color: #F44336; }

    .comment-field {
      width: 100%;
      margin-bottom: 20px;
    }

    .rating-tips {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .tip-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: #666;
      margin: 0 0 8px 0;
    }

    .tip-title mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #1976d2;
    }

    .rating-tips ul {
      margin: 0;
      padding-left: 24px;
      color: #777;
      font-size: 0.9rem;
    }

    .rating-tips li {
      margin: 4px 0;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      z-index: 10;
    }

    .loading-overlay p {
      margin-top: 16px;
      color: #666;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      gap: 12px;
    }

    @media (max-width: 600px) {
      .rating-dialog {
        width: 100%;
      }

      .star-btn mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }
  `]
})
export class RatingDialogComponent implements OnInit {
  stars = [1, 2, 3, 4, 5];
  selectedRating = 0;
  hoveredRating = 0;
  comment = '';
  isSubmitting = false;

  constructor(
    public dialogRef: MatDialogRef<RatingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RatingDialogData,
    private ratingService: RatingService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.data.existingRating) {
      this.selectedRating = this.data.existingRating;
    }
    if (this.data.existingComment) {
      this.comment = this.data.existingComment;
    }
  }

  selectRating(rating: number): void {
    this.selectedRating = rating;
  }

  hoverStar(rating: number): void {
    this.hoveredRating = rating;
  }

  isStarFilled(starIndex: number): boolean {
    const position = starIndex + 1;
    
    if (this.hoveredRating > 0) {
      return position <= this.hoveredRating;
    }
    
    return position <= this.selectedRating;
  }

  isStarHovered(starIndex: number): boolean {
    const position = starIndex + 1;
    return this.hoveredRating > 0 && position <= this.hoveredRating;
  }

  getRatingText(): string {
    const rating = this.hoveredRating > 0 ? this.hoveredRating : this.selectedRating;
    
    switch(rating) {
      case 5: return 'Excellent ! 🌟';
      case 4: return 'Très bon ! 😊';
      case 3: return 'Bon 👍';
      case 2: return 'Moyen 😐';
      case 1: return 'Insatisfaisant 😞';
      default: return 'Cliquez pour évaluer';
    }
  }

  getRatingTextClass(): string {
    const rating = this.hoveredRating > 0 ? this.hoveredRating : this.selectedRating;
    
    switch(rating) {
      case 5: return 'excellent';
      case 4: return 'very-good';
      case 3: return 'good';
      case 2: return 'average';
      case 1: return 'poor';
      default: return '';
    }
  }

  submitRating(): void {
    if (!this.selectedRating) {
      this.snackBar.open('Veuillez sélectionner une note', 'Fermer', { duration: 3000 });
      return;
    }

    this.isSubmitting = true;

    const request: RatingRequest = {
      rating: this.selectedRating,
      comment: this.comment.trim() || undefined
    };

    console.log('Envoi du rating:', request);

    const ratingObservable = this.data.existingRating
      ? this.ratingService.updateRating(this.data.exchangeId, request)
      : this.ratingService.submitRating(this.data.exchangeId, request);

    ratingObservable.subscribe({
      next: (response) => {
        console.log('Rating envoyé avec succès:', response);
        this.snackBar.open(
          this.data.existingRating ? 'Évaluation mise à jour !' : 'Merci pour votre évaluation !',
          'Fermer',
          { duration: 3000 }
        );
        
        this.dialogRef.close({ rated: true, rating: this.selectedRating });
      },
      error: (error) => {
        console.error('Erreur lors de la soumission:', error);
        this.snackBar.open('Erreur lors de l\'envoi de l\'évaluation', 'Fermer', { duration: 3000 });
        this.isSubmitting = false;
      }
    });
  }

  skipRating(): void {
    this.dialogRef.close({ rated: false });
  }
}