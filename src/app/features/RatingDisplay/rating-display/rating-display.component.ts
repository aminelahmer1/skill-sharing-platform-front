import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RatingService, RatingResponse } from '../../../core/services/Rating/rating.service';
import { RatingDialogComponent } from '../../RatingDialog/rating-dialog/rating-dialog.component';

@Component({
  selector: 'app-rating-display',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="rating-container" *ngIf="status === 'COMPLETED'">
      <!-- ⭐ Section Rating UNIQUEMENT -->
      <div class="rating-section">
        <!-- Si pas encore évalué -->
        <div *ngIf="!hasRated && !isLoading" class="rating-prompt">
          <div class="prompt-content">
            <mat-icon class="rating-icon">star_rate</mat-icon>
            <p class="prompt-text">Évaluez votre expérience</p>
            <button mat-raised-button color="primary" (click)="openRatingDialog()" class="rate-btn">
              <mat-icon>rate_review</mat-icon>
              Donner une note
            </button>
          </div>
        </div>

        <!-- Si déjà évalué -->
        <div *ngIf="hasRated && currentRating && !isLoading" class="rating-display">
          <div class="rating-header">
            <span class="rating-label">Votre évaluation</span>
            <button mat-icon-button 
                    (click)="openRatingDialog()" 
                    matTooltip="Modifier votre évaluation"
                    class="edit-btn">
              <mat-icon>edit</mat-icon>
            </button>
          </div>
          
          <div class="stars-display">
            <div class="stars-row">
              <mat-icon *ngFor="let star of getStars(); let i = index" 
                        [class.filled]="star"
                        class="star-icon"
                        [attr.aria-label]="'Étoile ' + (i + 1)">
                {{ star ? 'star' : 'star_border' }}
              </mat-icon>
            </div>
            <span class="rating-value">{{ currentRating }}/5</span>
            <span class="rating-text">{{ getRatingText(currentRating) }}</span>
          </div>
          
          <div class="rating-comment" *ngIf="currentComment">
            <mat-icon>format_quote</mat-icon>
            <div class="comment-content">
              <p [class.expanded]="showFullComment"
                 [class.expandable]="currentComment.length > 150">
                <span class="comment-text">
                  {{ showFullComment ? currentComment : ((currentComment.length > 150) ? (currentComment | slice:0:150) + '...' : currentComment) }}
                </span>
              </p>
              <button *ngIf="currentComment.length > 150" 
                      class="expand-comment-btn"
                      (click)="toggleComment()"
                      mat-button>
                {{ showFullComment ? 'Voir moins' : 'Voir plus' }}
              </button>
            </div>
          </div>
          
          <div class="rating-meta">
            <span class="rating-date" *ngIf="ratingDate">
              Évalué le {{ ratingDate | date:'dd/MM/yyyy à HH:mm' }}
            </span>
          </div>
        </div>

        <!-- Loader -->
        <div *ngIf="isLoading" class="loading-state">
          <mat-spinner diameter="24"></mat-spinner>
          <span>Chargement de votre évaluation...</span>
        </div>

        <!-- Erreur -->
        <div *ngIf="error" class="error-state">
          <mat-icon color="warn">error_outline</mat-icon>
          <span>{{ error }}</span>
          <button mat-button color="primary" (click)="checkRatingStatus()">
            <mat-icon>refresh</mat-icon>
            Réessayer
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .rating-container {
      background: transparent;
      border-radius: 0;
      padding: 0;
      margin: 0;
      border: none;
    }

    /* ⭐ Section Rating */
    .rating-section {
      /* Pas de styles spéciaux nécessaires */
    }

    /* 📝 Prompt pour évaluer */
    .rating-prompt {
      text-align: center;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      color: white;
    }

    .prompt-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .rating-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #FFD700;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    .prompt-text {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 500;
    }

    .rate-btn {
      background: white;
      color: #667eea;
      font-weight: 500;
      border-radius: 20px;
      padding: 0 24px;
      height: 40px;
    }

    .rate-btn:hover {
      background: #f8f9fa;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    /* ⭐ Affichage du rating */
    .rating-display {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }

    .rating-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .rating-label {
      font-weight: 600;
      color: #495057;
      font-size: 1rem;
    }

    .edit-btn {
      color: #6c757d;
      transition: all 0.2s ease;
    }

    .edit-btn:hover {
      color: #007bff;
      background: #e3f2fd;
      transform: scale(1.1);
    }

    .stars-display {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      text-align: center;
    }

    .stars-row {
      display: flex;
      gap: 4px;
    }

    .star-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #dee2e6;
      transition: all 0.2s ease;
    }

    .star-icon.filled {
      color: #FFD700;
      text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
      transform: scale(1.1);
    }

    .rating-value {
      font-weight: 600;
      font-size: 1.1rem;
      color: #495057;
      margin: 0 8px;
    }

    .rating-text {
      font-size: 0.9rem;
      color: #6c757d;
      font-style: italic;
    }

    .rating-comment {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 16px 0 8px 0;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #007bff;
    }

    .rating-comment mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #007bff;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .comment-content {
      flex: 1;
    }

    .comment-content p {
      margin: 0;
      color: #495057;
      line-height: 1.5;
      font-style: italic;
    }

    /* 📝 Expansion des commentaires */
    .comment-content p.expandable {
      transition: all 0.3s ease;
    }

    .comment-content p.expanded {
      max-height: none;
    }

    .comment-text {
      display: block;
      line-height: 1.5;
    }

    .expand-comment-btn {
      color: #007bff !important;
      font-size: 0.8rem !important;
      min-width: auto !important;
      padding: 4px 8px !important;
      height: auto !important;
      line-height: 1.2 !important;
      margin-top: 6px;
      text-transform: none !important;
      font-weight: 500 !important;
    }

    .expand-comment-btn:hover {
      background: rgba(0, 123, 255, 0.08) !important;
    }

    .rating-meta {
      text-align: center;
      margin-top: 12px;
    }

    .rating-date {
      font-size: 0.8rem;
      color: #6c757d;
      background: #f8f9fa;
      padding: 4px 12px;
      border-radius: 12px;
      display: inline-block;
    }

    /* 🔄 States */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #6c757d;
    }

    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 8px;
      color: #856404;
      text-align: center;
    }

    .error-state mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .error-state button {
      margin-top: 8px;
    }

    /* 📱 Responsive */
    @media (max-width: 600px) {
      .rating-container {
        padding: 12px;
        margin: 8px 0;
      }

      .rating-prompt {
        padding: 16px;
      }

      .prompt-text {
        font-size: 1rem;
      }

      .star-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .rating-header {
        flex-direction: column;
        gap: 8px;
        text-align: center;
      }
    }
  `]
})
export class RatingDisplayComponent implements OnInit {
  @Input() exchangeId!: number;
  @Input() status!: string;
  @Input() skillName!: string;
  @Input() producerName!: string;
  @Output() ratingUpdated = new EventEmitter<void>();

  hasRated = false;
  currentRating?: number;
  currentComment?: string;
  ratingDate?: string;
  isLoading = false;
  error?: string;
  showFullComment = false; // ✅ Ajout pour gérer l'expansion des commentaires

  constructor(
    private dialog: MatDialog,
    private ratingService: RatingService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    if (this.status === 'COMPLETED' && this.exchangeId) {
      this.checkRatingStatus();
    }
  }

  /**
   * 🔍 Vérifier si l'utilisateur a déjà évalué cet échange
   */
  checkRatingStatus(): void {
    if (!this.exchangeId) {
      console.warn('No exchangeId provided');
      return;
    }

    this.isLoading = true;
    this.error = undefined;

    this.ratingService.getRatingForExchange(this.exchangeId).subscribe({
      next: (rating: RatingResponse | null) => {
        if (rating) {
          this.hasRated = true;
          this.currentRating = rating.rating;
          this.currentComment = rating.comment;
          this.ratingDate = rating.ratingDate;
          console.log('✅ Rating found:', rating);
        } else {
          this.hasRated = false;
          console.log('📝 No rating found for this exchange');
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('❌ Error checking rating status:', error);
        this.error = 'Erreur lors du chargement de l\'évaluation';
        this.isLoading = false;
      }
    });
  }

  /**
   * ⭐ Générer le tableau des étoiles pour l'affichage
   */
  getStars(): boolean[] {
    if (!this.currentRating) return [false, false, false, false, false];
    
    const stars: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      stars.push(i < this.currentRating);
    }
    return stars;
  }

  /**
   * 📝 Obtenir le texte correspondant à la note
   */
  getRatingText(rating: number): string {
    switch(rating) {
      case 5: return 'Excellent';
      case 4: return 'Très bon';
      case 3: return 'Bon';
      case 2: return 'Moyen';
      case 1: return 'Faible';
      default: return '';
    }
  }

  /**
   * 📝 Toggle pour afficher/masquer le commentaire complet
   */
  toggleComment(): void {
    this.showFullComment = !this.showFullComment;
  }

  /**
   * 🎯 Ouvrir le dialogue de rating (nouveau ou modification)
   */
  openRatingDialog(): void {
    console.log('🎯 Opening rating dialog for exchange:', this.exchangeId);

    const dialogRef = this.dialog.open(RatingDialogComponent, {
      width: '500px',
      maxWidth: '90vw',
      disableClose: false,
      data: {
        exchangeId: this.exchangeId,
        skillName: this.skillName,
        producerName: this.producerName,
        existingRating: this.currentRating,
        existingComment: this.currentComment
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.rated) {
        console.log('✅ Rating dialog closed with success');
        
        // Recharger le statut du rating
        this.checkRatingStatus();
        
        // Émettre l'événement de mise à jour
        this.ratingUpdated.emit();
        
        // Notification de succès
        this.snackBar.open(
          this.hasRated ? 'Évaluation modifiée avec succès' : 'Évaluation enregistrée avec succès',
          'Fermer',
          {
            duration: 3000,
            panelClass: ['success-snackbar']
          }
        );
      } else {
        console.log('🚫 Rating dialog closed without rating');
      }
    });
  }
}