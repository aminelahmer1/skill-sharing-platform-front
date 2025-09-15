import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RecordingResponse, RecordingService } from '../../core/services/Recording/recording.service';

@Component({
  selector: 'app-video-player-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './video-player-dialog.component.html',
  styleUrls: ['./video-player-dialog.component.css']
})
export class VideoPlayerDialogComponent implements OnInit, OnDestroy {
  videoUrl = '';
  isLoading = true;
  hasError = false;
  private blob?: Blob;

  constructor(
    private recordingService: RecordingService,
    public dialogRef: MatDialogRef<VideoPlayerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      recording: RecordingResponse;
      videoUrl?: string;
    }
  ) {}

  async ngOnInit() {
    if (this.data.recording) {
      await this.loadVideoBlob();
    } else if (this.data.videoUrl) {
      this.videoUrl = this.data.videoUrl;
      this.isLoading = false;
    }
  }

  private async loadVideoBlob() {
    try {
      this.isLoading = true;
      this.blob = await this.recordingService.downloadRecording(
        parseInt(this.data.recording!.recordingId, 10)
      );
      this.videoUrl = URL.createObjectURL(this.blob);
    } catch (err) {
      console.error('Erreur chargement vidéo:', err);
      this.hasError = true;
    } finally {
      this.isLoading = false;
    }
  }

  onLoadStart() {
    this.isLoading = true;
    this.hasError = false;
  }

  onLoadedData() {
    this.isLoading = false;
    this.hasError = false;
  }

  onError(event: Event) {
    console.error('Video loading error:', event);
    this.isLoading = false;
    this.hasError = true;
  }

  retry() {
    this.hasError = false;
    this.loadVideoBlob();
  }

  download() {
    if (!this.blob || !this.data.recording) return;
    const url = URL.createObjectURL(this.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.data.recording.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  close() {
    this.dialogRef.close();
  }

  ngOnDestroy() {
    if (this.videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.videoUrl);
    }
  }

  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  formatFileSize(bytes: number): string {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(date: string | Date): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dateObj);
  }
}