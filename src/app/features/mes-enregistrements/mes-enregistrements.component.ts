// mes-enregistrements.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RecordingService, RecordingResponse } from '../../core/services/Recording/recording.service';
import { VideoPlayerDialogComponent } from '../video-player-dialog/video-player-dialog.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

interface RecordingGroup {
  skillName: string;
  recordings: RecordingResponse[];
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
    MatTooltipModule
  ],
  templateUrl: './mes-enregistrements.component.html',
  styleUrls: ['./mes-enregistrements.component.css']
})
export class MesEnregistrementsComponent implements OnInit {
  recordingGroups: RecordingGroup[] = [];
  isLoading = true;
  isProducer = false;

  constructor(
    private recordingService: RecordingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadRecordings();
    this.checkUserRole();
  }

  async loadRecordings() {
    try {
      this.isLoading = true;
      const recordings = await this.recordingService.getUserRecordings();
      this.groupRecordingsBySkill(recordings);
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

  private groupRecordingsBySkill(recordings: RecordingResponse[]) {
    const groups = new Map<string, RecordingGroup>();
    
    recordings.forEach(recording => {
      const key = recording.skillName || 'Sans nom';
      if (!groups.has(key)) {
        groups.set(key, {
          skillName: key,
          recordings: []
        });
      }
      groups.get(key)!.recordings.push(recording);
    });

    // Trier les groupes par nom de compétence
    this.recordingGroups = Array.from(groups.values())
      .sort((a, b) => a.skillName.localeCompare(b.skillName));
    
    // Trier les enregistrements dans chaque groupe par numéro
    this.recordingGroups.forEach(group => {
      group.recordings.sort((a, b) => (a.recordingNumber || 0) - (b.recordingNumber || 0));
    });
  }

  private checkUserRole() {
    // Utiliser Keycloak pour obtenir les rôles
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.isProducer = payload.realm_access?.roles?.includes('PRODUCER') || 
                         payload.resource_access?.['backend-service']?.roles?.includes('PRODUCER');
      } catch (e) {
        console.error('Error parsing token:', e);
      }
    }
  }

  playRecording(recording: RecordingResponse) {
    // Vérifier si le fichier est prêt
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
      // Convertir recordingId string en number
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
        // Convertir recordingId string en number
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