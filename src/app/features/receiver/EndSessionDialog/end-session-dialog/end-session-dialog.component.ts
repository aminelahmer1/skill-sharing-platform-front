import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-end-session-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './end-session-dialog.component.html',
  styleUrls: ['./end-session-dialog.component.css']
})
export class EndSessionDialogComponent {
  isProcessing = false;
  participantCount: number;

  constructor(
    public dialogRef: MatDialogRef<EndSessionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { participantCount: number }
  ) {
    this.participantCount = data.participantCount || 0;
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.isProcessing = true;
    // Retourner true pour confirmer
    this.dialogRef.close(true);
  }
}