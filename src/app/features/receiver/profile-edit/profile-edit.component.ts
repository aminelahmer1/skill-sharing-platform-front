import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../core/services/User/user.service';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserProfileResponse } from '../../../models/user/user';
import { lastValueFrom } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.css']
})
export class ProfileEditComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  profileForm: FormGroup;
  selectedFile: File | null = null;
  previewUrl: SafeUrl | string | null = null;
  isLoading = false;
  isUploading = false;
  keycloakId = '';
  
  readonly maxFileSize = 2 * 1024 * 1024; // 2MB
  readonly allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif'];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private snackBar: MatSnackBar,
    private sanitizer: DomSanitizer
  ) {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.maxLength(50)]],
      phoneNumber: ['', [Validators.pattern(/^[0-9\+\-\s]+$/)]],
      bio: ['', [Validators.maxLength(500)]],
      address: this.fb.group({
        city: ['', [Validators.maxLength(50)]],
        country: ['', [Validators.maxLength(50)]],
        postalCode: ['', [Validators.maxLength(20)]]
      })
    });
  }

  ngOnInit(): void {
    this.loadProfile();
    this.scrollToTop();
  }

  private scrollToTop(): void {
    window.scrollTo(0, 0);
  }

  private loadProfile(): void {
    this.isLoading = true;
    this.userService.getCurrentUserProfile().subscribe({
      next: (profile) => {
        this.keycloakId = profile.keycloakId;
        this.previewUrl = profile.pictureUrl || 'assets/images/default-profile.png';
        this.profileForm.patchValue({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phoneNumber: profile.phoneNumber,
          bio: profile.bio || '',
          address: {
            city: profile.address?.city || '',
            country: profile.address?.country || '',
            postalCode: profile.address?.postalCode || ''
          }
        });
        this.isLoading = false;
      },
      error: (err) => {
        this.handleError('Échec du chargement du profil', err);
        this.isLoading = false;
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file || !this.validateFile(file)) {
      return;
    }
    
    this.selectedFile = file;
    this.createPreview(file);
  }

  private validateFile(file: File): boolean {
    if (!this.allowedFileTypes.includes(file.type)) {
      this.showError('Seuls les images JPEG, PNG ou GIF sont autorisées');
      return false;
    }

    if (file.size > this.maxFileSize) {
      this.showError(`Taille maximale : ${this.maxFileSize / 1024 / 1024}MB`);
      return false;
    }

    return true;
  }

  private createPreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = this.sanitizer.bypassSecurityTrustUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  private async uploadImage(): Promise<void> {
    if (!this.selectedFile || !this.keycloakId) return;

    this.isUploading = true;
    try {
      const res = await lastValueFrom(
        this.userService.uploadProfilePicture(this.selectedFile, this.keycloakId)
      );
      this.previewUrl = res.pictureUrl || this.previewUrl;
      this.showSuccess('Photo de profil mise à jour !');
      this.selectedFile = null;
    } catch (err) {
      this.handleError('Échec du téléchargement', err);
    } finally {
      this.isUploading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid) {
      this.showError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    this.isLoading = true;
    
    try {
      if (this.selectedFile) await this.uploadImage();
      
      const formData = this.profileForm.value;
      await lastValueFrom(
        this.userService.updateProfile(formData, this.keycloakId)
      );
      
      this.showSuccess('Profil mis à jour avec succès !');
      this.navigateToProfile();
    } catch (error) {
      this.handleError('Échec de la mise à jour du profil', error);
    } finally {
      this.isLoading = false;
    }
  }

  navigateToProfile(): void {
    this.router.navigate(['/receiver/profile']);
    this.scrollToTop();
  }

  private handleError(message: string, error?: any): void {
    console.error(message, error);
    this.showError(message);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Fermer', { 
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Fermer', { 
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }
}