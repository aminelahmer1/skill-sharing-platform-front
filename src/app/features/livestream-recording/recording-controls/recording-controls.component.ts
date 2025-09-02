import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RecordingService, RecordingStatus } from '../../../core/services/Recording/recording.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-recording-controls',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './recording-controls.component.html',
  styleUrls: ['./recording-controls.component.css']
})
export class RecordingControlsComponent implements OnInit, OnDestroy {
  @Input() sessionId!: number;
  @Input() isHost = false;
  
  recordingStatus: RecordingStatus = { isRecording: false };
  isProcessing = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private recordingService: RecordingService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.recordingService.recordingStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.recordingStatus = status;
      });
  }

  async toggleRecording(): Promise<void> {
    if (!this.isHost || this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      if (this.recordingStatus?.isRecording) {
        // Remove firstValueFrom since stopRecording now returns Promise<void>
        await this.recordingService.stopRecording(this.sessionId);
        this.showNotification('Enregistrement arrêté', 'success');
      } else {
        // Remove firstValueFrom since startRecording now returns Promise<RecordingResponse>
        const response = await this.recordingService.startRecording(this.sessionId);
        this.showNotification('Enregistrement démarré', 'success');
      }
    } catch (error) {
      console.error('Recording toggle failed:', error);
      this.showNotification('Erreur lors de l\'enregistrement', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  get formattedDuration(): string {
    if (!this.recordingStatus?.duration) return '00:00';
    return this.recordingService.formatDuration(this.recordingStatus.duration);
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    this.snackBar.open(message, 'Fermer', {
      duration: 3000,
      panelClass: type === 'error' ? ['error-snackbar'] : ['success-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}