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
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatSnackBarModule,
    MatTooltipModule
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
  readonly allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private snackBar: MatSnackBar,
    private sanitizer: DomSanitizer
  ) {
    this.profileForm = this.createForm();
  }

  ngOnInit(): void {
    this.loadProfile();
    this.scrollToTop();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      firstName: ['', [
        Validators.required, 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
      ]],
      lastName: ['', [
        Validators.required, 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
      ]],
      phoneNumber: ['', [
        Validators.pattern(/^[\+]?[0-9\s\-\(\)]{8,20}$/)
      ]],
      bio: ['', [
        Validators.maxLength(500)
      ]],
      address: this.fb.group({
        city: ['', [
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
        ]],
        country: ['', [
          Validators.maxLength(50),
          Validators.pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
        ]],
        postalCode: ['', [
          Validators.maxLength(20),
          Validators.pattern(/^[a-zA-Z0-9\s-]+$/)
        ]]
      })
    });
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private loadProfile(): void {
    this.isLoading = true;
    this.userService.getCurrentUserProfile().subscribe({
      next: (profile) => {
        this.populateForm(profile);
        this.isLoading = false;
      },
      error: (err) => {
        this.handleError('Échec du chargement du profil', err);
        this.isLoading = false;
      }
    });
  }

  private populateForm(profile: UserProfileResponse): void {
    this.keycloakId = profile.keycloakId;
    this.previewUrl = profile.pictureUrl || 'assets/images/default-profile.png';
    
    this.profileForm.patchValue({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phoneNumber: profile.phoneNumber || '',
      bio: profile.bio || '',
      address: {
        city: profile.address?.city || '',
        country: profile.address?.country || '',
        postalCode: profile.address?.postalCode || ''
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      return;
    }
    
    if (!this.validateFile(file)) {
      this.resetFileInput();
      return;
    }
    
    this.selectedFile = file;
    this.createPreview(file);
  }

  private validateFile(file: File): boolean {
    // Validation du type de fichier
    if (!this.allowedFileTypes.includes(file.type)) {
      this.showError('Seuls les formats JPEG, PNG, GIF et WebP sont autorisés');
      return false;
    }

    // Validation de la taille
    if (file.size > this.maxFileSize) {
      this.showError(`La taille du fichier ne doit pas dépasser ${this.maxFileSize / 1024 / 1024}MB`);
      return false;
    }

    // Validation du nom de fichier
    if (file.name.length > 255) {
      this.showError('Le nom du fichier est trop long');
      return false;
    }

    return true;
  }

  private createPreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = this.sanitizer.bypassSecurityTrustUrl(reader.result as string);
    };
    reader.onerror = () => {
      this.showError('Erreur lors de la lecture du fichier');
      this.resetFileInput();
    };
    reader.readAsDataURL(file);
  }

  private resetFileInput(): void {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
    this.selectedFile = null;
  }

  removePhoto(): void {
    this.selectedFile = null;
    this.previewUrl = 'assets/images/default-profile.png';
    this.resetFileInput();
  }

  private async uploadImage(): Promise<string | null> {
    if (!this.selectedFile || !this.keycloakId) {
      return null;
    }

    this.isUploading = true;
    try {
      const response = await lastValueFrom(
        this.userService.uploadProfilePicture(this.selectedFile, this.keycloakId)
      );
      
      if (response?.pictureUrl) {
        this.previewUrl = response.pictureUrl;
        this.selectedFile = null;
        this.resetFileInput();
        return response.pictureUrl;
      }
      
      return null;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error('Échec du téléchargement de l\'image');
    } finally {
      this.isUploading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched(this.profileForm);
      this.showError('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    if (this.isLoading || this.isUploading) {
      return;
    }

    this.isLoading = true;
    
    try {
      // Upload de l'image si nécessaire
      if (this.selectedFile) {
        await this.uploadImage();
      }
      
      // Mise à jour du profil
      const formData = this.getFormData();
      console.log('Données envoyées:', formData); // Debug
      
      await lastValueFrom(
        this.userService.updateProfile(formData, this.keycloakId)
      );
      
      this.showSuccess('Profil mis à jour avec succès !');
      await this.navigateToProfile();
      
    } catch (error) {
      console.error('Erreur de mise à jour:', error); // Debug
      this.handleError('Échec de la mise à jour du profil', error);
    } finally {
      this.isLoading = false;
    }
  }

  private getFormData(): any {
    const formValue = this.profileForm.value;
    
    // Permettre les chaînes vides pour tous les champs optionnels
    return {
      firstName: formValue.firstName?.trim() || '',
      lastName: formValue.lastName?.trim() || '',
      phoneNumber: formValue.phoneNumber?.trim() || '',
      bio: formValue.bio?.trim() || '',
      address: {
        city: formValue.address?.city?.trim() || '',
        country: formValue.address?.country?.trim() || '',
        postalCode: formValue.address?.postalCode?.trim() || ''
      }
    };
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched({ onlySelf: true });
      }
    });
  }

  async navigateToProfile(): Promise<void> {
    // Détecter automatiquement la route selon le contexte
    const currentRoute = this.router.url;
    if (currentRoute.includes('/producer/')) {
      await this.router.navigate(['/producer/profile']);
    } else {
      await this.router.navigate(['/receiver/profile']);
    }
    this.scrollToTop();
  }

  // Getters pour les validations dans le template
  get firstName() { return this.profileForm.get('firstName'); }
  get lastName() { return this.profileForm.get('lastName'); }
  get phoneNumber() { return this.profileForm.get('phoneNumber'); }
  get bio() { return this.profileForm.get('bio'); }
  get city() { return this.profileForm.get('address.city'); }
  get country() { return this.profileForm.get('address.country'); }
  get postalCode() { return this.profileForm.get('address.postalCode'); }

  // Méthodes utilitaires pour les messages d'erreur
  getFieldError(fieldName: string): string | null {
    const field = this.profileForm.get(fieldName);
    if (field?.errors && field?.touched) {
      if (field.errors['required']) return 'Ce champ est obligatoire';
      if (field.errors['maxlength']) return `Maximum ${field.errors['maxlength'].requiredLength} caractères`;
      if (field.errors['pattern']) return 'Format invalide';
    }
    return null;
  }

  getBioCharacterCount(): number {
    return this.bio?.value?.length || 0;
  }

  getBioMaxLength(): number {
    return 500;
  }

  isBioLimitExceeded(): boolean {
    return this.getBioCharacterCount() > this.getBioMaxLength();
  }

  private handleError(message: string, error?: any): void {
    console.error(message, error);
    let errorMessage = message;
    
    // Personnaliser le message d'erreur selon le type
    if (error?.status === 400) {
      errorMessage = 'Données invalides. Veuillez vérifier vos informations.';
    } else if (error?.status === 413) {
      errorMessage = 'Le fichier est trop volumineux.';
    } else if (error?.status === 500) {
      errorMessage = 'Erreur serveur. Veuillez réessayer plus tard.';
    }
    
    this.showError(errorMessage);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Fermer', { 
      duration: 5000,
      panelClass: ['error-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Fermer', { 
      duration: 3000,
      panelClass: ['success-snackbar'],
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }
}