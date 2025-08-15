// Fichier: src/app/features/producer/skill-ratings-dialog/skill-ratings-dialog.component.ts

import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { SkillRatingStats } from '../../../../core/services/Rating/rating.service';

interface SkillRatingsDialogData {
  skillId: number;
  skillName: string;
  ratings: SkillRatingStats;
}

@Component({
  selector: 'app-skill-ratings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule
  ],
  template: `
    <div class="ratings-dialog">
      <div class="dialog-header">
        <mat-icon class="skill-icon">star</mat-icon>
        <h2 mat-dialog-title>Évaluations - {{ data.skillName }}</h2>
        <button mat-icon-button 
                mat-dialog-close 
                class="close-btn"
                aria-label="Fermer">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content class="dialog-content">
        <div *ngIf="data.ratings" class="ratings-content">
          <!-- Résumé des statistiques -->
          <div class="stats-summary">
            <div class="stat-item">
              <div class="stat-value">{{ data.ratings.averageRating | number:'1.1-1' }}/5</div>
              <div class="stat-label">Note moyenne</div>
              <div class="stars-display">
                <mat-icon *ngFor="let star of getStarArray(data.ratings.averageRating)" 
                          [class.filled]="star"
                          class="star-icon">
                  {{ star ? 'star' : 'star_border' }}
                </mat-icon>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ data.ratings.totalRatings }}</div>
              <div class="stat-label">Évaluations</div>
              <mat-chip class="rating-chip" 
                        [style.background-color]="getRatingColor(data.ratings.averageRating)">
                {{ getRatingLabel(data.ratings.averageRating) }}
              </mat-chip>
            </div>
          </div>

          <mat-divider></mat-divider>

          <!-- Liste des commentaires -->
          <div class="comments-section">
            <h3 class="section-title">
              <mat-icon>comment</mat-icon>
              Commentaires des participants ({{ getCommentsCount() }})
            </h3>

            <div *ngIf="getCommentsCount() === 0" class="no-comments">
              <mat-icon>chat_bubble_outline</mat-icon>
              <p>Aucun commentaire pour cette compétence</p>
              <small>Les participants n'ont pas encore laissé de commentaires détaillés</small>
            </div>

            <div *ngIf="getCommentsCount() > 0" class="comments-list">
              <div *ngFor="let rating of data.ratings.ratings; let i = index" 
                   class="comment-item"
                   [class.no-comment]="!rating.comment">
                
                <div class="comment-header">
                  <div class="reviewer-info">
                    <div class="reviewer-avatar">
                      <mat-icon>person</mat-icon>
                    </div>
                    <div class="reviewer-details">
                      <div class="reviewer-name">{{ rating.receiverName || 'Participant anonyme' }}</div>
                      <div class="review-date">{{ rating.ratingDate | date:'dd/MM/yyyy à HH:mm' }}</div>
                    </div>
                  </div>
                  
                  <div class="rating-stars">
                    <mat-icon *ngFor="let star of getStarArray(rating.rating)" 
                              [class.filled]="star"
                              class="star-mini">
                      {{ star ? 'star' : 'star_border' }}
                    </mat-icon>
                    <span class="rating-number">{{ rating.rating }}/5</span>
                  </div>
                </div>

                <div *ngIf="rating.comment && rating.comment.trim()" class="comment-content">
                  <mat-icon class="quote-icon">format_quote</mat-icon>
                  <p class="comment-text">{{ rating.comment }}</p>
                </div>

                <div *ngIf="!rating.comment || !rating.comment.trim()" class="no-comment-text">
                  <mat-icon>chat_bubble_outline</mat-icon>
                  <span>Aucun commentaire écrit</span>
                </div>

                <mat-divider *ngIf="i < data.ratings.ratings.length - 1"></mat-divider>
              </div>
            </div>
          </div>

          <!-- Statistiques détaillées -->
          <div class="detailed-stats">
            <h3 class="section-title">
              <mat-icon>analytics</mat-icon>
              Répartition des notes
            </h3>
            
            <div class="stats-breakdown">
              <div *ngFor="let star of [5,4,3,2,1]" class="stat-row">
                <div class="star-rating">
                  <span>{{ star }}</span>
                  <mat-icon class="star-small">star</mat-icon>
                </div>
                <div class="rating-bar">
                  <div class="bar-fill" 
                       [style.width.%]="getPercentageForRating(star)"
                       [style.background-color]="getRatingColor(star)">
                  </div>
                </div>
                <div class="rating-count">
                  {{ getCountForRating(star) }} ({{ getPercentageForRating(star) | number:'0-0' }}%)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="!data.ratings" class="no-data">
          <mat-icon>info</mat-icon>
          <p>Aucune donnée d'évaluation disponible</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions class="dialog-actions">
        <button mat-button mat-dialog-close class="cancel-btn">
          Fermer
        </button>
        <button mat-raised-button 
                color="primary" 
                (click)="exportRatings()" 
                class="export-btn">
          <mat-icon>download</mat-icon>
          Exporter
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .ratings-dialog {
      max-width: 700px;
      min-width: 500px;
      max-height: 80vh;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px 24px 0 24px;
      position: relative;
    }

    .skill-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #FFD700;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
    }

    .dialog-content {
      padding: 16px 24px !important;
      max-height: 60vh;
      overflow-y: auto;
    }

    .stats-summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
      padding: 20px;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 12px;
      border-left: 4px solid #FFD700;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: #2d3436;
      margin-bottom: 8px;
    }

    .stat-label {
      font-size: 0.9rem;
      color: #636e72;
      margin-bottom: 12px;
      font-weight: 500;
    }

    .stars-display {
      display: flex;
      justify-content: center;
      gap: 4px;
    }

    .star-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #ddd;
    }

    .star-icon.filled {
      color: #FFD700;
    }

    .rating-chip {
      color: white !important;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 24px 0 16px 0;
      color: #2d3436;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .section-title mat-icon {
      color: #6c5ce7;
    }

    .comments-section {
      margin-bottom: 24px;
    }

    .no-comments {
      text-align: center;
      padding: 32px 16px;
      color: #636e72;
      background: #f8f9fa;
      border-radius: 8px;
      border: 2px dashed #dee2e6;
    }

    .no-comments mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #adb5bd;
      margin-bottom: 16px;
    }

    .no-comments p {
      margin: 0 0 8px 0;
      font-weight: 500;
    }

    .no-comments small {
      color: #adb5bd;
    }

    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .comment-item {
      padding: 16px 0;
    }

    .comment-item.no-comment {
      opacity: 0.7;
    }

    .comment-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .reviewer-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .reviewer-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(45deg, #6c5ce7, #a29bfe);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .reviewer-avatar mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .reviewer-name {
      font-weight: 600;
      color: #2d3436;
      font-size: 0.95rem;
    }

    .review-date {
      font-size: 0.8rem;
      color: #636e72;
      margin-top: 2px;
    }

    .rating-stars {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .star-mini {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #ddd;
    }

    .star-mini.filled {
      color: #FFD700;
    }

    .rating-number {
      font-size: 0.85rem;
      color: #636e72;
      font-weight: 600;
      margin-left: 4px;
    }

    .comment-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 3px solid #6c5ce7;
    }

    .quote-icon {
      color: #6c5ce7;
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .comment-text {
      margin: 0;
      line-height: 1.5;
      color: #2d3436;
      font-style: italic;
    }

    .no-comment-text {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #adb5bd;
      font-style: italic;
      font-size: 0.9rem;
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .no-comment-text mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .detailed-stats {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
    }

    .stats-breakdown {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .stat-row {
      display: grid;
      grid-template-columns: 60px 1fr 100px;
      align-items: center;
      gap: 16px;
    }

    .star-rating {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      color: #2d3436;
    }

    .star-small {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #FFD700;
    }

    .rating-bar {
      height: 8px;
      background: #e9ecef;
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .rating-count {
      font-size: 0.85rem;
      color: #636e72;
      text-align: right;
    }

    .dialog-actions {
      padding: 16px 24px;
      gap: 12px;
    }

    .cancel-btn {
      color: #636e72;
    }

    .export-btn {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .no-data {
      text-align: center;
      padding: 40px 20px;
      color: #636e72;
    }

    .no-data mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #adb5bd;
      margin-bottom: 16px;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .ratings-dialog {
        min-width: 90vw;
        max-width: 95vw;
      }

      .stats-summary {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .stat-row {
        grid-template-columns: 50px 1fr 80px;
        gap: 12px;
      }

      .comment-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }

      .rating-stars {
        align-self: flex-end;
      }
    }

    /* Animations */
    .comment-item {
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Scrollbar personnalisé */
    .dialog-content::-webkit-scrollbar {
      width: 6px;
    }

    .dialog-content::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }

    .dialog-content::-webkit-scrollbar-thumb {
      background: #6c5ce7;
      border-radius: 3px;
    }

    .dialog-content::-webkit-scrollbar-thumb:hover {
      background: #5649c0;
    }
  `]
})
export class SkillRatingsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SkillRatingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SkillRatingsDialogData
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  getStarArray(rating: number): boolean[] {
    const stars: boolean[] = [];
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }

  getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#4CAF50'; // Vert - Excellent
    if (rating >= 3.5) return '#8BC34A'; // Vert clair - Très bon
    if (rating >= 2.5) return '#FFC107'; // Orange - Moyen
    if (rating >= 1.5) return '#FF9800'; // Orange foncé - Faible
    return '#F44336'; // Rouge - Très faible
  }

  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Très bon';
    if (rating >= 2.5) return 'Bon';
    if (rating >= 1.5) return 'Moyen';
    if (rating >= 1) return 'Faible';
    return 'Non noté';
  }

  getCommentsCount(): number {
    if (!this.data.ratings?.ratings) return 0;
    return this.data.ratings.ratings.filter(r => r.comment && r.comment.trim()).length;
  }

  getCountForRating(starRating: number): number {
    if (!this.data.ratings?.ratings) return 0;
    return this.data.ratings.ratings.filter(r => r.rating === starRating).length;
  }

  getPercentageForRating(starRating: number): number {
    if (!this.data.ratings?.totalRatings || this.data.ratings.totalRatings === 0) return 0;
    const count = this.getCountForRating(starRating);
    return (count / this.data.ratings.totalRatings) * 100;
  }

  exportRatings(): void {
    if (!this.data.ratings?.ratings) return;

    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `evaluations-${this.data.skillName.replace(/\s+/g, '-')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  private generateCSV(): string {
    const headers = ['Participant', 'Note', 'Commentaire', 'Date'];
    const rows = this.data.ratings.ratings.map(rating => [
      rating.receiverName || 'Anonyme',
      rating.rating.toString(),
      `"${(rating.comment || '').replace(/"/g, '""')}"`,
      new Date(rating.ratingDate).toLocaleDateString('fr-FR')
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}