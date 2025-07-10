import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { UserResponse } from '../../../models/user-response';
import { ExchangeService } from '../../../core/services/Exchange/exchange.service';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-accepted-receivers-dialog',
  templateUrl: './accepted-receivers-dialog.component.html',
  styleUrls: ['./accepted-receivers-dialog.component.css'],
  standalone: true,
  imports: [CommonModule, MatListModule, MatIconModule, MatProgressSpinnerModule ,
    MatDialogModule, 
    MatButtonModule]
})
export class AcceptedReceiversDialogComponent {
  isLoading = true;
  receivers: UserResponse[] = [];
  error: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<AcceptedReceiversDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { skillId: number },
    private exchangeService: ExchangeService
  ) {
    this.loadReceivers();
  }

  loadReceivers() {
    this.exchangeService.getAcceptedReceiversForSkill(this.data.skillId).subscribe({
      next: (receivers) => {
        this.receivers = receivers;
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des participants';
        this.isLoading = false;
      }
    });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}