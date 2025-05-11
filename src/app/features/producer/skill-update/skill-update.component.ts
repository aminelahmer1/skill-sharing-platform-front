import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { Category, Skill } from '../../../models/skill/skill.model';
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

@Component({
  selector: 'app-skill-update',
  templateUrl: './skill-update.component.html',
  styleUrls: ['./skill-update.component.css'],
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
    MatDialogModule
  ]
})
export class SkillUpdateComponent implements OnInit {
  skillForm: FormGroup;
  categories: Category[] = [];
  isLoading = false;
  selectedFile: File | null = null;
  previewUrl: string | ArrayBuffer | null = null;

  constructor(
    private fb: FormBuilder,
    private skillService: SkillService,
    private categoryService: CategoryService,
    private dialogRef: MatDialogRef<SkillUpdateComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { skill: Skill }
  ) {
    this.skillForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.required]],
      availableQuantity: [1, [Validators.required, Validators.min(1)]],
      price: [0, [Validators.required, Validators.min(0)]],
      categoryId: ['', [Validators.required]],
      pictureUrl: ['']
    });

    if (this.data.skill) {
      this.skillForm.patchValue(this.data.skill);
      this.previewUrl = this.data.skill.pictureUrl || null;
    }
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryService.getAllCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (err) => {
        this.snackBar.open('Erreur lors du chargement des catégories', 'Fermer', { duration: 3000 });
      }
    });
  }

  onSubmit(): void {
    if (this.skillForm.invalid) return;
  
    this.isLoading = true;
    const skillData = this.skillForm.value;
  
    if (this.selectedFile) {
      // Si nouvelle image sélectionnée
      this.skillService.updateSkillWithPicture(this.data.skill.id, skillData, this.selectedFile).subscribe({
        next: () => this.handleSuccess(),
        error: (err) => this.handleError('la mise à jour avec image')
      });
    } else if (this.previewUrl === null && this.data.skill.pictureUrl) {
      // Si image supprimée (previewUrl null mais il y avait une image avant)
      this.skillService.removeSkillPicture(this.data.skill.id).subscribe({
        next: () => this.handleSuccess(),
        error: (err) => this.handleError('la suppression d\'image')
      });
    } else {
      // Mise à jour simple sans changement d'image
      this.skillService.updateSkill(this.data.skill.id, skillData).subscribe({
        next: () => this.handleSuccess(),
        error: (err) => this.handleError('la mise à jour')
      });
    }
  }
  
  private handleSuccess(): void {
    this.dialogRef.close('success');
    this.snackBar.open('Compétence mise à jour avec succès', 'Fermer', { duration: 3000 });
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
      // Validation du fichier
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
      reader.onload = () => {
        this.previewUrl = reader.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(): void {
    this.previewUrl = null;
    this.selectedFile = null;
    this.skillForm.patchValue({ pictureUrl: '' });
  }
}