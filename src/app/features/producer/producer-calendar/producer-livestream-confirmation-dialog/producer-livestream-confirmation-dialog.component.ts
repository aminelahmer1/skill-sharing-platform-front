// producer-livestream-confirmation-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface ConfirmationData {
  skillName: string;
  skillId: number;
}

@Component({
  selector: 'app-producer-livestream-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="livestream-confirmation-dialog">
      <div class="dialog-header">
        <div class="live-icon-container">
          <mat-icon class="live-icon">videocam</mat-icon>
          <div class="pulse-ring"></div>
        </div>
        <h2 class="dialog-title">Démarrer un livestream</h2>
      </div>
      
      <div class="dialog-content">
        <div class="skill-info-card">
          <h3 class="skill-name">{{ data.skillName }}</h3>
        </div>
        
        <div class="confirmation-details">
          <p class="main-question">
            Voulez-vous créer et démarrer un livestream maintenant pour cette compétence ?
          </p>
          
          <div class="info-items">
            <div class="info-item">
              <mat-icon>flash_on</mat-icon>
              <span>Démarrage immédiat</span>
            </div>
            <div class="info-item">
              <mat-icon>notifications</mat-icon>
              <span>Notification automatique des participants</span>
            </div>
            <div class="info-item">
              <mat-icon>record_voice_over</mat-icon>
              <span>Session interactive en direct</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dialog-actions">
        <button 
          mat-button 
          class="cancel-button"
          (click)="onCancel()">
          Annuler
        </button>
        <button 
          mat-raised-button 
          class="confirm-button"
          (click)="onConfirm()">
          <mat-icon>live_tv</mat-icon>
          Démarrer le livestream
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./producer-livestream-confirmation-dialog.component.css']
})
export class ProducerLivestreamConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ProducerLivestreamConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}