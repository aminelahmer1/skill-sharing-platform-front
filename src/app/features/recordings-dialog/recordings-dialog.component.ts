// recordings-dialog.component.ts
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecordingService } from '../../core/services/Recording/recording.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { VideoPlayerDialogComponent } from '../video-player-dialog/video-player-dialog.component';

@Component({
  selector: 'app-recordings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>videocam</mat-icon>
      Enregistrements - {{ data.skillName }}
    </h2>
    
    <mat-dialog-content>
      <div *ngIf="isLoading" class="loading">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Chargement des enregistrements...</p>
      </div>
      
      <div *ngIf="!isLoading && recordings.length === 0" class="no-recordings">
        <mat-icon>videocam_off</mat-icon>
        <p>Aucun enregistrement disponible pour cette session</p>
      </div>
      
      <mat-list *ngIf="!isLoading && recordings.length > 0">
        <mat-list-item *ngFor="let recording of recordings" class="recording-item">
          <mat-icon matListItemIcon>movie</mat-icon>
          
          <div matListItemTitle>
            {{ recording.fileName }}
            <span class="recording-number">#{{ recording.recordingNumber }}</span>
          </div>
          
          <div matListItemLine class="recording-meta">
            <span>Durée: {{ formatDuration(recording.duration) }}</span>
            <span class="separator">•</span>
            <span>Taille: {{ formatFileSize(recording.fileSize) }}</span>
            <span class="separator">•</span>
            <span>{{ formatDate(recording.startTime) }}</span>
          </div>
          
          <div matListItemMeta class="recording-actions">
            <button mat-icon-button 
                    color="primary" 
                    (click)="playRecording(recording)"
                    matTooltip="Lire">
              <mat-icon>play_arrow</mat-icon>
            </button>
            
            <button mat-icon-button 
                    color="accent" 
                    (click)="downloadRecording(recording)"
                    matTooltip="Télécharger">
              <mat-icon>download</mat-icon>
            </button>
            
            <button mat-icon-button 
                    color="warn" 
                    (click)="deleteRecording(recording)"
                    matTooltip="Supprimer"
                    *ngIf="isProducer">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </mat-list-item>
      </mat-list>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fermer</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .loading {
      text-align: center;
      padding: 40px;
    }

    .no-recordings {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .no-recordings mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .recording-item {
      height: auto !important;
      padding: 16px 0;
      border-bottom: 1px solid #e0e0e0;
    }

    .recording-item:last-child {
      border-bottom: none;
    }

    .recording-number {
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-left: 8px;
    }

    .recording-meta {
      display: flex;
      gap: 8px;
      color: #666;
      font-size: 0.9rem;
      margin-top: 4px;
    }

    .separator {
      color: #ccc;
    }

    .recording-actions {
      display: flex;
      gap: 4px;
    }

    mat-dialog-content {
      min-width: 500px;
      max-height: 500px;
      overflow-y: auto;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    h2 mat-icon {
      color: #1976d2;
    }
  `]
})
export class RecordingsDialogComponent implements OnInit {
  recordings: any[] = [];
  isLoading = true;
  isProducer = false;

  constructor(
    public dialogRef: MatDialogRef<RecordingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private recordingService: RecordingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    this.checkUserRole();
    await this.loadRecordings();
  }

  private checkUserRole() {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.isProducer = payload.roles?.includes('PRODUCER');
    }
  }

  async loadRecordings() {
    try {
      this.isLoading = true;
      this.recordings = await this.recordingService.getSessionRecordings(this.data.sessionId);
    } catch (error) {
      console.error('Error loading recordings:', error);
      this.snackBar.open('Erreur lors du chargement', 'Fermer', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  playRecording(recording: any) {
    this.dialog.open(VideoPlayerDialogComponent, {
      width: '90%',
      maxWidth: '1200px',
      data: { recording }
    });
  }

  async downloadRecording(recording: any) {
    try {
      const blob = await this.recordingService.downloadRecording(recording.recordingId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = recording.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
      
      this.snackBar.open('Téléchargement démarré', 'OK', { duration: 2000 });
    } catch (error) {
      console.error('Error downloading:', error);
      this.snackBar.open('Erreur lors du téléchargement', 'Fermer', { duration: 3000 });
    }
  }

  async deleteRecording(recording: any) {
    if (confirm(`Supprimer ${recording.fileName} ?`)) {
      try {
        await this.recordingService.deleteRecording(recording.recordingId);
        this.snackBar.open('Supprimé avec succès', 'OK', { duration: 2000 });
        await this.loadRecordings();
      } catch (error) {
        console.error('Error deleting:', error);
        this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
      }
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}