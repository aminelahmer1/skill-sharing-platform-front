import { Component, OnInit } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { CategoryService } from '../../../core/services/category/category.service'; // Importer le service Category
import { Skill,Category } from '../../../models/skill/skill.model';

import { MatDialog } from '@angular/material/dialog';
import { SkillFormComponent } from '../skill-form/skill-form.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { SkillUpdateComponent } from '../skill-update/skill-update.component';
import { MatSelectModule } from '@angular/material/select'; // Pour la liste déroulante
import { MatDatepickerModule } from '@angular/material/datepicker'; // Pour le sélecteur de date
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-producer-skills',
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    DecimalPipe,
    SkillFormComponent,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ]
})
export class SkillsComponent implements OnInit {
  skills: Skill[] = [];
  filteredSkills: Skill[] = []; // Liste filtrée pour l'affichage
  categories: Category[] = [];
  isLoading = true;
  error: string | null = null;

  // Variables pour les filtres
  selectedCategory: number | null = null;
  selectedDate: Date | null = null;
  sortOrder: 'asc' | 'desc' | 'default' = 'default'; // Tri par défaut (par createdAt)

  constructor(
    private skillService: SkillService,
    private categoryService: CategoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadSkills();
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

  loadSkills(): void {
    this.isLoading = true;
    this.error = null;

    this.skillService.getMySkills().subscribe({
      next: (skills) => {
        this.skills = skills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.applyFiltersAndSort(); // Appliquer les filtres et tris après le chargement
        this.isLoading = false;
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des compétences';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      }
    });
  }

  // Appliquer les filtres et le tri
  applyFiltersAndSort(): void {
    let filtered = [...this.skills];

    // Filtre par catégorie
    if (this.selectedCategory) {
      filtered = filtered.filter(skill => skill.categoryId === this.selectedCategory);
    }

    // Filtre par date
    if (this.selectedDate) {
      const selectedDateStr = this.selectedDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
      filtered = filtered.filter(skill => skill.streamingDate === selectedDateStr);
    }

    // Tri par nombre d'inscrits
    if (this.sortOrder === 'asc') {
      filtered = filtered.sort((a, b) => a.nbInscrits - b.nbInscrits);
    } else if (this.sortOrder === 'desc') {
      filtered = filtered.sort((a, b) => b.nbInscrits - a.nbInscrits);
    } else {
      // Tri par défaut (par createdAt, déjà appliqué dans loadSkills)
      filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    this.filteredSkills = filtered;
  }

  // Gestion des changements de filtres
  onCategoryChange(): void {
    this.applyFiltersAndSort();
  }

  onDateChange(): void {
    this.applyFiltersAndSort();
  }

  onSortChange(): void {
    this.applyFiltersAndSort();
  }

  // Réinitialiser les filtres
  resetFilters(): void {
    this.selectedCategory = null;
    this.selectedDate = null;
    this.sortOrder = 'default';
    this.applyFiltersAndSort();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(SkillFormComponent, {
      width: '600px',
      panelClass: 'skill-form-dialog',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') {
        this.snackBar.open('Compétence créée avec succès', 'Fermer', { duration: 3000 });
        this.loadSkills();
      }
    });
  }

  deleteSkill(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmer la suppression',
        message: 'Êtes-vous sûr de vouloir supprimer cette compétence ?',
        confirmText: 'Supprimer',
        cancelText: 'Annuler'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.skillService.deleteSkill(id).subscribe({
          next: () => {
            this.snackBar.open('Compétence supprimée avec succès', 'Fermer', { duration: 3000 });
            this.loadSkills();
          },
          error: (err) => {
            this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
          }
        });
      }
    });
  }

  openUpdateDialog(skill: Skill): void {
    const dialogRef = this.dialog.open(SkillUpdateComponent, {
      width: '600px',
      panelClass: 'skill-form-dialog',
      data: { skill }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') {
        this.loadSkills();
      }
    });
  }
}