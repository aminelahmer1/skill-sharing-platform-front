// mes-enregistrements.component.ts - Version améliorée
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RecordingService, RecordingResponse, GroupedRecordings } from '../../core/services/Recording/recording.service';
import { VideoPlayerDialogComponent } from '../video-player-dialog/video-player-dialog.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';

interface RecordingGroup {
  skillName: string;
  skillId: number;
  recordings: RecordingResponse[];
  totalDuration: number;
  totalSize: number;
}

@Component({
  selector: 'app-mes-enregistrements',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatTabsModule,
    MatBadgeModule
  ],
  templateUrl: './mes-enregistrements.component.html',
  styleUrls: ['./mes-enregistrements.component.css']
})
export class MesEnregistrementsComponent implements OnInit {
  recordingGroups: RecordingGroup[] = [];
  isLoading = true;
  isProducer = false;
  totalRecordings = 0;
  totalDuration = 0;
  totalSize = 0;

  constructor(
    private recordingService: RecordingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    await this.checkUserRole();
    await this.loadRecordings();
  }

  async checkUserRole() {
    this.isProducer = await this.recordingService.isUserProducer();
  }

  async loadRecordings() {
    try {
      this.isLoading = true;
      
      // Charger les enregistrements selon le rôle
      const recordings = this.isProducer 
        ? await this.recordingService.getProducerRecordings()
        : await this.recordingService.getReceiverRecordings();
      
      this.processRecordings(recordings);
      
      // Charger les statistiques
      const stats = await this.recordingService.getRecordingStats();
      if (stats) {
        this.totalRecordings = stats.totalRecordings || 0;
        this.totalDuration = stats.totalDuration || 0;
        this.totalSize = stats.totalSize || 0;
      }
      
    } catch (error) {
      console.error('Error loading recordings:', error);
      this.snackBar.open('Erreur lors du chargement des enregistrements', 'Fermer', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  private processRecordings(groupedRecordings: GroupedRecordings) {
    this.recordingGroups = [];
    
    Object.entries(groupedRecordings).forEach(([skillKey, recordings]) => {
      // Extraire le nom et l'ID de la compétence
      const parts = skillKey.split('_');
      const skillId = parseInt(parts[parts.length - 1], 10);
      const skillName = parts.slice(0, -1).join(' ');
      
      // Calculer les totaux pour ce groupe
      let totalDuration = 0;
      let totalSize = 0;
      
      recordings.forEach(rec => {
        totalDuration += rec.duration || 0;
        totalSize += rec.fileSize || 0;
      });
      
      // Trier les enregistrements par numéro
      recordings.sort((a, b) => (a.recordingNumber || 0) - (b.recordingNumber || 0));
      
      this.recordingGroups.push({
        skillName: skillName || 'Sans nom',
        skillId: skillId || 0,
        recordings,
        totalDuration,
        totalSize
      });
    });
    
    // Trier les groupes par nom de compétence
    this.recordingGroups.sort((a, b) => a.skillName.localeCompare(b.skillName));
  }

  playRecording(recording: RecordingResponse) {
    if (recording.status !== 'COMPLETED') {
      this.snackBar.open('Cet enregistrement est encore en cours de traitement', 'OK', {
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
      
      if (isNaN(recordingId)) {
        throw new Error('ID d\'enregistrement invalide');
      }

      const blob = await this.recordingService.downloadRecording(recordingId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = recording.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    const confirmMessage = `Voulez-vous vraiment supprimer l'enregistrement "${recording.fileName}" ?`;
    
    if (confirm(confirmMessage)) {
      try {
        const recordingId = parseInt(recording.recordingId, 10);
        
        if (isNaN(recordingId)) {
          throw new Error('ID d\'enregistrement invalide');
        }

        await this.recordingService.deleteRecording(recordingId);
        
        this.snackBar.open('Enregistrement supprimé avec succès', 'OK', {
          duration: 2000,
          panelClass: ['success-snackbar']
        });
        
        // Recharger la liste
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

  formatDuration(seconds?: number): string {
    if (!seconds || seconds === 0) return '0s';
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = Math.round(bytes / Math.pow(k, i) * 100) / 100;
    
    return `${size} ${sizes[i]}`;
  }

  formatDate(date?: Date | string): string {
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

  canPlay(recording: RecordingResponse): boolean {
    return recording.status === 'COMPLETED' && !!recording.fileSize && recording.fileSize > 0;
  }

  canDownload(recording: RecordingResponse): boolean {
    return recording.status === 'COMPLETED' && !!recording.fileSize && recording.fileSize > 0;
  }
}