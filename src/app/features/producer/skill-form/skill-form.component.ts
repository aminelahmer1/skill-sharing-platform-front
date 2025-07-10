import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
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
import { MatNativeDateModule } from '@angular/material/core';
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
    
    const today = new Date();
    this.minDate = today; 

    this.skillForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.required]],
      availableQuantity: [1, [Validators.required, Validators.min(1)]],
      price: [0, [Validators.required, Validators.min(0)]],
      categoryId: ['', [Validators.required]],
      pictureUrl: [''],
      streamingDate: [today, [Validators.required, this.dateValidator.bind(this)]], // Date par défaut : aujourd'hui
      streamingTime: ['09:00', [Validators.required]] // Heure par défaut : 09:00
    });

    if (this.isEditing && data.skill) {
      this.skillForm.patchValue({
        ...data.skill,
        streamingDate: new Date(data.skill.streamingDate) // Convertir en objet Date
      });
      this.previewUrl = data.skill.pictureUrl || null;
    }
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryService.getAllCategories().subscribe({
      next: (categories) => this.categories = categories,
      error: (err) => this.snackBar.open('Erreur lors du chargement des catégories', 'Fermer', { duration: 3000 })
    });
  }

  // Validateur personnalisé pour interdire les dates passées
  dateValidator(control: any): { [key: string]: boolean } | null {
    const selectedDate = new Date(control.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Réinitialiser l'heure pour comparaison
    return selectedDate < today ? { 'invalidDate': true } : null;
  }

  onSubmit(): void {
    if (this.skillForm.invalid) return;

    this.isLoading = true;
    let skillData: SkillRequest = this.skillForm.value;

    // Formatter la date en YYYY-MM-DD
    if (skillData.streamingDate) {
      skillData.streamingDate = formatDate(skillData.streamingDate, 'yyyy-MM-dd', 'en');
    }

    const operation = this.isEditing
      ? this.selectedFile 
        ? this.skillService.updateSkillWithPicture(this.data.skill.id, skillData, this.selectedFile)
        : this.skillService.updateSkill(this.data.skill.id, skillData)
      : this.selectedFile 
        ? this.skillService.createSkillWithPicture(skillData, this.selectedFile)
        : this.skillService.createSkill(skillData);

    operation.subscribe({
      next: () => {
        this.dialogRef.close('success');
        this.snackBar.open(`Compétence ${this.isEditing ? 'mise à jour' : 'créée'} avec succès`, 'Fermer', { duration: 3000 });
      },
      error: () => this.handleError(this.isEditing ? 'la mise à jour' : 'la création')
    });
  }

  private handleError(action: string): void {
    this.isLoading = false;
    this.snackBar.open(`Erreur lors de ${action}`, 'Fermer', { duration: 3000 });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open('La taille de l\'image ne doit pas dépasser 5MB', 'Fermer', { duration: 3000 });
        return;
      }
      if (!file.type.match(/image\/(jpeg|png|jpg|gif)/)) {
        this.snackBar.open('Format d\'image non supporté', 'Fermer', { duration: 3000 });
        return;
      }
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => this.previewUrl = reader.result;
      reader.readAsDataURL(file);
    }
  }

  removeImage(): void {
    this.previewUrl = null;
    this.selectedFile = null;
    this.skillForm.patchValue({ pictureUrl: '' });
  }
  showAcceptedReceivers(skillId: number): void {
  this.dialog.open(AcceptedReceiversDialogComponent, {
    width: '500px',
    data: { skillId }
  });}
}