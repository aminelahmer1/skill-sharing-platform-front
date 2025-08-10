import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface UserData {
  id?: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber?: string;
  bio?: string;
  pictureUrl?: string;
  createdAt: string;
  address?: {
    city?: string;
    postalCode?: string;
    country?: string;
  };
  stats?: {
    averageRating?: number;
    skillsCount?: number;
    studentsCount?: number;
  };
}

@Component({
  selector: 'app-user-profile-dialog',
  templateUrl: './user-profile-dialog.component.html',
  styleUrls: ['./user-profile-dialog.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    DatePipe,
  ]
})
export class UserProfileDialogComponent {
  
  constructor(
    public dialogRef: MatDialogRef<UserProfileDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserData
  ) {
    console.log('User profile data:', this.data);
    
    // Add default stats if not provided
    if (!this.data.stats) {
      this.data.stats = {
        averageRating: 4.8,
        skillsCount: Math.floor(Math.random() * 15) + 3,
        studentsCount: Math.floor(Math.random() * 50) + 5
      };
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  getFullAddress(): string {
    if (!this.data.address) return 'Non spécifiée';
    
    const parts = [
      this.data.address.city,
      this.data.address.postalCode,
      this.data.address.country
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : 'Non spécifiée';
  }

  // Getters for stats with fallbacks
  get averageRating(): number {
    return this.data.stats?.averageRating || 4.8;
  }

  get skillsCount(): number {
    return this.data.stats?.skillsCount || 0;
  }

  get studentsCount(): number {
    return this.data.stats?.studentsCount || 0;
  }
}