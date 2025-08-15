import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { Category, SkillRequest } from '../../../models/skill/skill.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { CategoryService } from '../../../core/services/category/category.service';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, MAT_DATE_LOCALE, DateAdapter, NativeDateAdapter, MAT_DATE_FORMATS, MAT_NATIVE_DATE_FORMATS } from '@angular/material/core';
import { formatDate } from '@angular/common';
import { AcceptedReceiversDialogComponent } from '../accepted-receivers-dialog/accepted-receivers-dialog.component';

@Component({
  selector: 'app-skill-form',
  templateUrl: './skill-form.component.html',
  styleUrls: ['./skill-form.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatOptionModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatDatepickerModule, 
    MatNativeDateModule 
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
    { provide: DateAdapter, useClass: NativeDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
    NativeDateAdapter
  ]
})
export class SkillFormComponent implements OnInit {
  skillForm: FormGroup;
  categories: Category[] = [];
  isLoading = false;
  isEditing = false;
  selectedFile: File | null = null;
  previewUrl: string | ArrayBuffer | null = null;
  minDate: Date;
  currentTime: string;
  showConfirmDialog = false; // Nouvelle propriété pour le dialogue de confirmation

  constructor(
    private fb: FormBuilder,
    private skillService: SkillService,
    private categoryService: CategoryService,
    private dialogRef: MatDialogRef<SkillFormComponent>,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.isEditing = data.mode === 'edit';
    
    // Initialiser les valeurs par défaut
    const now = new Date();
    this.minDate = now;
    
    // Formatter l'heure actuelle en HH:mm
    this.currentTime = now.toTimeString().slice(0, 5);
    
    // Ajouter 1 heure à l'heure actuelle pour la valeur par défaut
    const defaultDateTime = new Date(now.getTime() + 60 * 60 * 1000); // +1 heure
    const defaultTime = defaultDateTime.toTimeString().slice(0, 5);

    this.skillForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
      availableQuantity: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
      price: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
      categoryId: ['', [Validators.required]],
      pictureUrl: [''],
      streamingDate: [now, [Validators.required, this.dateValidator.bind(this)]],
      streamingTime: [defaultTime, [Validators.required, this.timeValidator.bind(this)]]
    });

    // Si en mode édition, pré-remplir le formulaire
    if (this.isEditing && data.skill) {
      const skill = data.skill;
      this.skillForm.patchValue({
        name: skill.name,
        description: skill.description,
        availableQuantity: skill.availableQuantity,
        price: skill.price,
        categoryId: skill.categoryId,
        streamingDate: new Date(skill.streamingDate),
        streamingTime: skill.streamingTime
      });
      this.previewUrl = skill.pictureUrl || null;
    }
  }

  ngOnInit(): void {
    this.loadCategories();
    this.setupFormValidation();
  }

  private setupFormValidation(): void {
    // Validation en temps réel pour la date et l'heure
    this.skillForm.get('streamingDate')?.valueChanges.subscribe(() => {
      this.skillForm.get('streamingTime')?.updateValueAndValidity();
    });
    
    this.skillForm.get('streamingTime')?.valueChanges.subscribe(() => {
      this.validateDateTime();
    });
  }

  loadCategories(): void {
    this.categoryService.getAllCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (err) => {
        console.error('Erreur chargement catégories:', err);
        this.showError('Erreur lors du chargement des catégories');
      }
    });
  }

  // Validateur simplifié pour la date (seulement via datepicker)
  dateValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return { 'required': true };
    
    const date = new Date(control.value);
    
    // Vérifier que la date n'est pas dans le passé
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (date < today) {
      return { 'pastDate': true };
    }
    
    return null;
  }

  // Validateur pour l'heure (doit être dans le futur si c'est aujourd'hui)
  timeValidator(control: any): { [key: string]: boolean } | null {
    if (!control.value) return null;
    
    const dateControl = this.skillForm?.get('streamingDate');
    if (!dateControl?.value) return null;
    
    const selectedDate = new Date(dateControl.value);
    const today = new Date();
    
    // Si c'est aujourd'hui, vérifier que l'heure est dans le futur
    if (selectedDate.toDateString() === today.toDateString()) {
      const [hours, minutes] = control.value.split(':').map(Number);
      const selectedTime = new Date();
      selectedTime.setHours(hours, minutes, 0, 0);
      
      const now = new Date();
      return selectedTime <= now ? { 'pastTime': true } : null;
    }
    
    return null;
  }

  private validateDateTime(): void {
    const timeControl = this.skillForm.get('streamingTime');
    if (timeControl) {
      timeControl.updateValueAndValidity({ emitEvent: false });
    }
  }

  onSubmit(): void {
    if (this.skillForm.invalid) {
      this.markFormGroupTouched();
      this.showError('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    this.isLoading = true;
    const formData = this.prepareFormData();

    const operation = this.isEditing
      ? this.updateSkill(formData)
      : this.createSkill(formData);

    operation.subscribe({
      next: (response) => {
        this.handleSuccess();
      },
      error: (error) => {
        this.handleError(error);
      }
    });
  }

  private prepareFormData(): SkillRequest {
    const formValue = this.skillForm.value;
    
    // Formatter la date en YYYY-MM-DD
    const formattedDate = formatDate(formValue.streamingDate, 'yyyy-MM-dd', 'en');
    
    return {
      ...formValue,
      streamingDate: formattedDate,
      price: parseFloat(formValue.price),
      availableQuantity: parseInt(formValue.availableQuantity),
      categoryId: parseInt(formValue.categoryId)
    };
  }

  private createSkill(skillData: SkillRequest) {
    return this.selectedFile 
      ? this.skillService.createSkillWithPicture(skillData, this.selectedFile)
      : this.skillService.createSkill(skillData);
  }

  private updateSkill(skillData: SkillRequest) {
    const skillId = this.data.skill.id;
    return this.selectedFile 
      ? this.skillService.updateSkillWithPicture(skillId, skillData, this.selectedFile)
      : this.skillService.updateSkill(skillId, skillData);
  }

  private handleSuccess(): void {
    this.isLoading = false;
    const message = this.isEditing 
      ? '✅ Compétence mise à jour avec succès!' 
      : '🎉 Compétence créée avec succès!';
    
    this.snackBar.open(message, 'Fermer', { 
      duration: 4000,
      panelClass: ['success-snackbar']
    });
    
    this.dialogRef.close('success');
  }

  private handleError(error: any): void {
    this.isLoading = false;
    console.error('Erreur formulaire compétence:', error);
    
    let errorMessage = 'Une erreur est survenue';
    
    if (error.status === 400) {
      errorMessage = 'Données invalides. Vérifiez les informations saisies.';
    } else if (error.status === 409) {
      errorMessage = 'Une compétence avec ce nom existe déjà.';
    } else if (error.status === 413) {
      errorMessage = 'L\'image est trop volumineuse.';
    }
    
    this.showError(errorMessage);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.skillForm.controls).forEach(key => {
      const control = this.skillForm.get(key);
      control?.markAsTouched();
    });
  }

  private showError(message: string): void {
    this.snackBar.open(`❌ ${message}`, 'Fermer', { 
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  onCancel(): void {
    if (this.hasUnsavedChanges()) {
      this.showConfirmDialog = true;
    } else {
      this.dialogRef.close();
    }
  }

  // Méthodes pour le dialogue de confirmation personnalisé
  confirmCancel(): void {
    this.showConfirmDialog = false;
    this.dialogRef.close();
  }

  cancelConfirmation(): void {
    this.showConfirmDialog = false;
  }

  private hasUnsavedChanges(): boolean {
    return this.skillForm.dirty && !this.isLoading;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    // Validation du fichier
    if (!this.validateFile(file)) return;

    this.selectedFile = file;
    this.createImagePreview(file);
  }

  private validateFile(file: File): boolean {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (file.size > maxSize) {
      this.showError('La taille de l\'image ne doit pas dépasser 5MB');
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      this.showError('Format d\'image non supporté. Utilisez: JPEG, PNG, GIF ou WebP');
      return false;
    }

    return true;
  }

  private createImagePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => this.previewUrl = reader.result;
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.previewUrl = null;
    this.selectedFile = null;
    this.skillForm.patchValue({ pictureUrl: '' });
    
    // Réinitialiser l'input file
    const fileInput = document.getElementById('skillImage') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  // Getters pour faciliter l'accès aux contrôles dans le template
  get nameControl() { return this.skillForm.get('name'); }
  get descriptionControl() { return this.skillForm.get('description'); }
  get availableQuantityControl() { return this.skillForm.get('availableQuantity'); }
  get priceControl() { return this.skillForm.get('price'); }
  get categoryControl() { return this.skillForm.get('categoryId'); }
  get dateControl() { return this.skillForm.get('streamingDate'); }
  get timeControl() { return this.skillForm.get('streamingTime'); }

  // Méthodes utilitaires pour le template
  getFieldError(fieldName: string): string | null {
    const control = this.skillForm.get(fieldName);
    if (!control?.errors || !control.touched) return null;

    const errors = control.errors;
    
    if (errors['required']) return `Le champ ${this.getFieldLabel(fieldName)} est requis`;
    if (errors['minlength']) return `${this.getFieldLabel(fieldName)} trop court`;
    if (errors['maxlength']) return `${this.getFieldLabel(fieldName)} trop long`;
    if (errors['min']) return `Valeur minimale: ${errors['min'].min}`;
    if (errors['max']) return `Valeur maximale: ${errors['max'].max}`;
    
    // Erreurs de date spécifiques
    if (errors['pastDate']) return 'La date doit être aujourd\'hui ou ultérieure';
    
    // Erreurs de temps
    if (errors['pastTime']) return 'L\'heure doit être dans le futur';
    
    return 'Valeur invalide';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      'name': 'Nom',
      'description': 'Description',
      'availableQuantity': 'Nombre de places',
      'price': 'Prix',
      'categoryId': 'Catégorie',
      'streamingDate': 'Date',
      'streamingTime': 'Heure'
    };
    return labels[fieldName] || fieldName;
  }

  showAcceptedReceivers(skillId: number): void {
    this.dialog.open(AcceptedReceiversDialogComponent, {
      width: '500px',
      data: { skillId }
    });
  }
}