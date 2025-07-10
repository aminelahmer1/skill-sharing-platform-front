// receiver-details-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA,MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { UserResponse } from '../../../models/user/user';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-receiver-details-dialog',
  templateUrl: './receiver-details-dialog.component.html',
  styleUrls: ['./receiver-details-dialog.component.css'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule,MatDialogModule]
})
export class ReceiverDetailsDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ReceiverDetailsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { receiver: UserResponse }
  ) {}

  closeDialog(): void {
    this.dialogRef.close();
  }
}