// recordings-dialog.component.ts - Version complète améliorée
import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { RecordingService, RecordingResponse } from '../../core/services/Recording/recording.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>videocam</mat-icon>
      Archives - {{ data.skillName }}
    </h2>
    
    <mat-dialog-content>
      <div *ngIf="isLoading" class="loading">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Chargement des enregistrements...</p>
      </div>
      
      <div *ngIf="!isLoading && recordings.length === 0" class="no-recordings">
        <mat-icon>videocam_off</mat-icon>
        <p>Aucun enregistrement disponible pour cette compétence</p>
      </div>
      
      <div *ngIf="!isLoading && recordings.length > 0" class="recordings-stats">
        <mat-chip-set>
          <mat-chip color="primary" selected>
            <mat-icon>video_library</mat-icon>
            {{ recordings.length }} enregistrement(s)
          </mat-chip>
          <mat-chip color="accent" selected>
            <mat-icon>schedule</mat-icon>
            Durée totale: {{ formatTotalDuration() }}
          </mat-chip>
          <mat-chip color="warn" selected>
            <mat-icon>storage</mat-icon>
            Taille totale: {{ formatTotalSize() }}
          </mat-chip>
        </mat-chip-set>
      </div>
      
      <mat-list *ngIf="!isLoading && recordings.length > 0">
        <mat-list-item *ngFor="let recording of recordings; let i = index" class="recording-item">
          <mat-icon matListItemIcon 
                    [style.color]="getStatusColor(recording.status)">
            {{ getStatusIcon(recording.status) }}
          </mat-icon>
          
          <div matListItemTitle>
            <span class="recording-title">{{ recording.fileName }}</span>
            <span class="recording-number">#{{ recording.recordingNumber || (i + 1) }}</span>
            <mat-chip [ngClass]="getStatusClass(recording.status)" class="status-chip">
              {{ getStatusLabel(recording.status) }}
            </mat-chip>
          </div>
          
          <div matListItemLine class="recording-meta">
            <span *ngIf="recording.duration">
              <mat-icon inline>timer</mat-icon>
              {{ formatDuration(recording.duration) }}
            </span>
            <span class="separator" *ngIf="recording.duration && recording.fileSize">•</span>
            <span *ngIf="recording.fileSize">
              <mat-icon inline>storage</mat-icon>
              {{ formatFileSize(recording.fileSize) }}
            </span>
            <span class="separator" *ngIf="(recording.duration || recording.fileSize) && recording.startTime">•</span>
            <span *ngIf="recording.startTime">
              <mat-icon inline>calendar_today</mat-icon>
              {{ formatDate(recording.startTime) }}
            </span>
          </div>
          
          <div matListItemMeta class="recording-actions">
            <button mat-icon-button 
                    color="primary" 
                    (click)="playRecording(recording)"
                    [disabled]="!canPlay(recording)"
                    matTooltip="Lire">
              <mat-icon>play_arrow</mat-icon>
            </button>
            
            <button mat-icon-button 
                    color="accent" 
                    (click)="downloadRecording(recording)"
                    [disabled]="!canDownload(recording)"
                    matTooltip="Télécharger">
              <mat-icon>download</mat-icon>
            </button>
            
            <button mat-icon-button 
                    color="warn" 
                    (click)="deleteRecording(recording)"
                    matTooltip="Supprimer"
                    *ngIf="isProducer && !data.isFinishedSkill">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </mat-list-item>
      </mat-list>
      
      <mat-divider *ngIf="!isLoading && recordings.length > 0"></mat-divider>
      
      <div *ngIf="!isLoading && recordings.length > 1" class="bulk-actions">
        <button mat-stroked-button 
                color="primary" 
                (click)="downloadAll()"
                [disabled]="isDownloadingAll">
          <mat-icon>cloud_download</mat-icon>
          {{ isDownloadingAll ? 'Téléchargement en cours...' : 'Télécharger tout' }}
        </button>
      </div>
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

    .recordings-stats {
      margin: 16px 0;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .recordings-stats mat-chip {
      margin: 4px;
    }

    .recording-item {
      height: auto !important;
      padding: 16px 0;
      border-bottom: 1px solid #e0e0e0;
      transition: background-color 0.3s;
    }

    .recording-item:hover {
      background-color: #f5f5f5;
    }

    .recording-item:last-child {
      border-bottom: none;
    }

    .recording-title {
      font-weight: 500;
      margin-right: 8px;
    }

    .recording-number {
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.85rem;
      margin: 0 8px;
    }

    .status-chip {
      font-size: 0.75rem;
      height: 20px;
      line-height: 20px;
      padding: 0 8px;
      margin-left: 8px;
    }

    .recording-meta {
      display: flex;
      gap: 8px;
      color: #666;
      font-size: 0.9rem;
      margin-top: 4px;
      align-items: center;
    }

    .recording-meta mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
      margin-right: 2px;
    }

    .separator {
      color: #ccc;
    }

    .recording-actions {
      display: flex;
      gap: 4px;
    }

    .bulk-actions {
      margin-top: 16px;
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    mat-dialog-content {
      min-width: 600px;
      max-width: 800px;
      max-height: 600px;
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

    .status-recording {
      background-color: #ff5722 !important;
      color: white !important;
    }

    .status-completed {
      background-color: #4caf50 !important;
      color: white !important;
    }

    .status-failed {
      background-color: #f44336 !important;
      color: white !important;
    }

    .status-processing {
      background-color: #ff9800 !important;
      color: white !important;
    }

    @media (max-width: 768px) {
      mat-dialog-content {
        min-width: 90vw;
        max-width: 90vw;
      }

      .recording-meta {
        flex-wrap: wrap;
      }

      .bulk-actions {
        flex-direction: column;
      }
    }
  `]
})
export class RecordingsDialogComponent implements OnInit {
  recordings: RecordingResponse[] = [];
  isLoading = true;
  isProducer = false;
  isDownloadingAll = false;

  constructor(
    public dialogRef: MatDialogRef<RecordingsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      sessionId?: number;
      skillId?: number;
      skillName: string;
      isFinishedSkill?: boolean;
    },
    private recordingService: RecordingService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    await this.checkUserRole();
    await this.loadRecordings();
  }

  private async checkUserRole() {
    this.isProducer = await this.recordingService.isUserProducer();
  }

  async loadRecordings() {
    try {
      this.isLoading = true;
      
      if (this.data.skillId) {
        // Charger par skillId pour les compétences terminées
        this.recordings = await this.recordingService.getSkillRecordings(this.data.skillId);
      } else if (this.data.sessionId) {
        // Charger par sessionId pour une session spécifique
        this.recordings = await this.recordingService.getSessionRecordings(this.data.sessionId);
      }
      
      // Trier par numéro d'enregistrement
      this.recordings.sort((a, b) => (a.recordingNumber || 0) - (b.recordingNumber || 0));
      
    } catch (error) {
      console.error('Error loading recordings:', error);
      this.snackBar.open('Erreur lors du chargement', 'Fermer', { 
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  playRecording(recording: RecordingResponse) {
    if (recording.status !== 'COMPLETED') {
      this.snackBar.open('Enregistrement non disponible', 'OK', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    this.dialog.open(VideoPlayerDialogComponent, {
      width: '90%',
      maxWidth: '1200px',
      data: { 
        recording,
        videoUrl: recording.downloadUrl
      }
    });
  }

  async downloadRecording(recording: RecordingResponse) {
    try {
      const recordingId = parseInt(recording.recordingId, 10);
      const blob = await this.recordingService.downloadRecording(recordingId);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = recording.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
      
      this.snackBar.open('Téléchargement démarré', 'OK', { 
        duration: 2000,
        panelClass: ['success-snackbar']
      });
    } catch (error) {
      console.error('Error downloading:', error);
      this.snackBar.open('Erreur lors du téléchargement', 'Fermer', { 
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  async deleteRecording(recording: RecordingResponse) {
    if (confirm(`Supprimer ${recording.fileName} ?`)) {
      try {
        const recordingId = parseInt(recording.recordingId, 10);
        await this.recordingService.deleteRecording(recordingId);
        
        this.snackBar.open('Supprimé avec succès', 'OK', { 
          duration: 2000,
          panelClass: ['success-snackbar']
        });
        
        await this.loadRecordings();
      } catch (error) {
        console.error('Error deleting:', error);
        this.snackBar.open('Erreur lors de la suppression', 'Fermer', { 
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    }
  }

  async downloadAll() {
    this.isDownloadingAll = true;
    
    try {
      for (const recording of this.recordings) {
        if (recording.status === 'COMPLETED') {
          await this.downloadRecording(recording);
          await new Promise(resolve => setTimeout(resolve, 500)); // Pause entre téléchargements
        }
      }
      
      this.snackBar.open('Tous les enregistrements ont été téléchargés', 'OK', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    } catch (error) {
      console.error('Error in bulk download:', error);
      this.snackBar.open('Erreur lors du téléchargement groupé', 'Fermer', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isDownloadingAll = false;
    }
  }

  canPlay(recording: RecordingResponse): boolean {
    return recording.status === 'COMPLETED' && !!recording.fileSize && recording.fileSize > 0;
  }

  canDownload(recording: RecordingResponse): boolean {
    return recording.status === 'COMPLETED' && !!recording.fileSize && recording.fileSize > 0;
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

  formatDate(date: string | Date): string {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
}

  formatTotalDuration(): string {
    const total = this.recordings.reduce((sum, rec) => sum + (rec.duration || 0), 0);
    return this.formatDuration(total);
  }

  formatTotalSize(): string {
    const total = this.recordings.reduce((sum, rec) => sum + (rec.fileSize || 0), 0);
    return this.formatFileSize(total);
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'RECORDING': 'En cours',
      'COMPLETED': 'Terminé',
      'FAILED': 'Échec',
      'PROCESSING': 'Traitement'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const classMap: { [key: string]: string } = {
      'RECORDING': 'status-recording',
      'COMPLETED': 'status-completed',
      'FAILED': 'status-failed',
      'PROCESSING': 'status-processing'
    };
    return classMap[status] || 'status-default';
  }

  getStatusIcon(status: string): string {
    const iconMap: { [key: string]: string } = {
      'RECORDING': 'fiber_manual_record',
      'COMPLETED': 'check_circle',
      'FAILED': 'error',
      'PROCESSING': 'autorenew'
    };
    return iconMap[status] || 'movie';
  }

  getStatusColor(status: string): string {
    const colorMap: { [key: string]: string } = {
      'RECORDING': '#ff5722',
      'COMPLETED': '#4caf50',
      'FAILED': '#f44336',
      'PROCESSING': '#ff9800'
    };
    return colorMap[status] || '#666';
  }
}