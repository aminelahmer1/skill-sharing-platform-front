import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { UserResponse } from '../../../models/user-response';
import { ExchangeService } from '../../../core/services/Exchange/exchange.service';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-accepted-receivers-dialog',
  template: `
    <div class="receivers-dialog">
      <!-- Header -->
      <div class="dialog-header">
        <mat-icon class="header-icon">people</mat-icon>
        <h2 mat-dialog-title>Participants inscrits</h2>
        <div class="skill-info">
          <mat-chip color="primary" selected>{{ data.skillName }}</mat-chip>
        </div>
      </div>

      <!-- Content -->
      <mat-dialog-content class="dialog-content">
        <!-- Loading State -->
        <div *ngIf="isLoading" class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Chargement des participants...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error" class="error-container">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error }}</p>
          <button mat-stroked-button color="primary" (click)="loadReceivers()">
            <mat-icon>refresh</mat-icon>
            Réessayer
          </button>
        </div>

        <!-- Success State -->
        <div *ngIf="!isLoading && !error" class="content-container">
          <!-- Statistics -->
          <div class="stats-section" *ngIf="receivers.length > 0">
            <mat-card class="stats-card">
              <div class="stats-content">
                <div class="stat-item">
                  <mat-icon>people</mat-icon>
                  <span class="stat-number">{{ receivers.length }}</span>
                  <span class="stat-label">Participant{{ receivers.length > 1 ? 's' : '' }}</span>
                </div>
              </div>
            </mat-card>
          </div>

          <!-- Receivers List -->
          <div class="receivers-section">
            <div *ngIf="receivers.length > 0" class="receivers-grid">
              <mat-card *ngFor="let receiver of receivers; trackBy: trackByReceiverId" 
                        class="receiver-card">
                <div class="receiver-header">
                  <img [src]="receiver.pictureUrl || 'assets/images/default-avatar.png'" 
                       alt="Photo de {{ receiver.firstName }}"
                       class="receiver-avatar">
                  <div class="receiver-info">
                    <h3 class="receiver-name">{{ receiver.firstName }} {{ receiver.lastName }}</h3>
                    <p class="receiver-email">{{ receiver.email }}</p>
                  </div>
                </div>
                
                <mat-divider></mat-divider>
                
                <div class="receiver-details">
                  <!-- Enlever l'adresse - garder seulement téléphone et bio si disponibles -->
                  <div class="detail-item" *ngIf="receiver.phoneNumber">
                    <mat-icon>phone</mat-icon>
                    <span>{{ receiver.phoneNumber }}</span>
                  </div>
                  <div class="detail-item" *ngIf="receiver.bio">
                    <mat-icon>person</mat-icon>
                    <span class="bio-text">{{ receiver.bio }}</span>
                  </div>
                  <!-- Message si aucune info supplémentaire -->
                  <div class="detail-item" *ngIf="!receiver.phoneNumber && !receiver.bio">
                    <mat-icon>info</mat-icon>
                    <span class="no-additional-info">Participant inscrit</span>
                  </div>
                </div>
              </mat-card>
            </div>

            <!-- Empty State -->
            <div *ngIf="receivers.length === 0" class="empty-state">
              <mat-icon class="empty-icon">people_outline</mat-icon>
              <h3>Aucun participant inscrit</h3>
              <p>Cette session n'a pas encore de participants inscrits.</p>
            </div>
          </div>
        </div>
      </mat-dialog-content>

      <!-- Actions -->
      <mat-dialog-actions class="dialog-actions">
        <button mat-button (click)="closeDialog()" class="close-btn">
          <mat-icon>close</mat-icon>
          Fermer
        </button>
        <button mat-raised-button 
                color="primary" 
                *ngIf="receivers.length > 0"
                (click)="exportParticipants()">
          <mat-icon>download</mat-icon>
          Exporter la liste
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .receivers-dialog {
      max-width: 800px;
      min-width: 600px;
      max-height: 80vh;
    }

    .dialog-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 24px 0 24px;
      text-align: center;
    }

    .header-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #6c5ce7;
      margin-bottom: 16px;
    }

    .dialog-header h2 {
      margin: 0 0 16px 0;
      color: #2d3436;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .skill-info {
      margin-bottom: 16px;
    }

    .skill-info mat-chip {
      font-size: 0.9rem;
      padding: 8px 16px;
    }

    .dialog-content {
      padding: 0 24px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
      text-align: center;
    }

    .loading-container mat-spinner {
      margin-bottom: 16px;
    }

    .error-container mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #e74c3c;
      margin-bottom: 16px;
    }

    .error-container button {
      margin-top: 16px;
    }

    .stats-section {
      margin-bottom: 24px;
    }

    .stats-card {
      border-radius: 12px;
      background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
      color: white;
      box-shadow: 0 4px 20px rgba(108, 92, 231, 0.3);
    }

    .stats-content {
      padding: 20px;
      display: flex;
      justify-content: center;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .stat-item mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .stat-number {
      font-size: 2rem;
      font-weight: bold;
    }

    .stat-label {
      font-size: 0.9rem;
      opacity: 0.9;
    }

    .receivers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .receiver-card {
      border-radius: 12px;
      transition: all 0.3s ease;
      border: 1px solid #e0e0e0;
    }

    .receiver-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.1);
    }

    .receiver-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px 20px 16px 20px;
    }

    .receiver-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid #f0f0f0;
    }

    .receiver-info {
      flex: 1;
      min-width: 0;
    }

    .receiver-name {
      margin: 0 0 4px 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #2d3436;
      word-break: break-word;
    }

    .receiver-email {
      margin: 0;
      font-size: 0.9rem;
      color: #636e72;
      word-break: break-word;
    }

    .receiver-details {
      padding: 16px 20px 20px 20px;
      min-height: 40px; /* Assurer une hauteur minimale même sans détails */
    }

    .detail-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 0.9rem;
      color: #636e72;
    }

    .detail-item:last-child {
      margin-bottom: 0;
    }

    .detail-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #6c5ce7;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .bio-text {
      line-height: 1.4;
      word-break: break-word;
    }

    .no-additional-info {
      color: #999;
      font-style: italic;
      font-size: 0.85rem;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 20px;
      text-align: center;
      color: #636e72;
    }

    .empty-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ddd;
      margin-bottom: 20px;
    }

    .empty-state h3 {
      margin: 0 0 8px 0;
      font-size: 1.2rem;
      color: #2d3436;
    }

    .empty-state p {
      margin: 0;
      font-size: 0.9rem;
    }

    .dialog-actions {
      padding: 16px 24px 24px 24px;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }

    .close-btn {
      color: #636e72;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .receivers-dialog {
        min-width: 0;
        width: 95vw;
        max-width: 95vw;
      }

      .receivers-grid {
        grid-template-columns: 1fr;
      }

      .receiver-header {
        flex-direction: column;
        text-align: center;
      }

      .receiver-avatar {
        align-self: center;
      }
    }
  `],
  standalone: true,
  imports: [
    CommonModule, 
    MatListModule, 
    MatIconModule, 
    MatProgressSpinnerModule,
    MatDialogModule, 
    MatButtonModule,
    MatChipsModule,
    MatCardModule,
    MatDividerModule
  ]
})
export class AcceptedReceiversDialogComponent {
  isLoading = true;
  receivers: UserResponse[] = [];
  error: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<AcceptedReceiversDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { skillId: number; skillName: string },
    private exchangeService: ExchangeService
  ) {
    this.loadReceivers();
  }

  loadReceivers(): void {
    this.isLoading = true;
    this.error = null;
    
    this.exchangeService.getAcceptedReceiversForSkill(this.data.skillId).subscribe({
      next: (receivers) => {
        this.receivers = receivers;
        this.isLoading = false;
        console.log(`Loaded ${receivers.length} receivers for skill ${this.data.skillId}`);
      },
      error: (err) => {
        console.error('Error loading receivers:', err);
        this.error = 'Erreur lors du chargement des participants';
        this.isLoading = false;
      }
    });
  }

  trackByReceiverId(index: number, receiver: UserResponse): number {
    return receiver.id;
  }

  exportParticipants(): void {
    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `participants_${this.data.skillName}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private generateCSV(): string {
    // CSV sans adresse - seulement infos essentielles
    const headers = ['Prénom', 'Nom', 'Email', 'Téléphone'];
    const rows = this.receivers.map(receiver => [
      receiver.firstName || '',
      receiver.lastName || '',
      receiver.email || '',
      receiver.phoneNumber || ''
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}