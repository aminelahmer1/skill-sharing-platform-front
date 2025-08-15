import { Component, OnInit } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { CategoryService } from '../../../core/services/category/category.service';
import { Skill, Category } from '../../../models/skill/skill.model';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { SkillFormComponent } from '../skill-form/skill-form.component';
import { AcceptedReceiversDialogComponent } from '../accepted-receivers-dialog/accepted-receivers-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-producer-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    DecimalPipe
  ],
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.css']
})
export class SkillsComponent implements OnInit {
  skills: Skill[] = [];
  categories: Category[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private skillService: SkillService,
    private categoryService: CategoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
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
      error: () => {
        this.snackBar.open('Erreur lors du chargement des catégories', 'Fermer', { duration: 3000 });
      }
    });
  }

  loadSkills(): void {
    this.isLoading = true;
    this.error = null;

    this.skillService.getMySkills().subscribe({
      next: (skills) => {
        // Tri par date de streaming (plus récent vers plus ancien)
        this.skills = skills.sort((a, b) => {
          try {
            // Créer des objets Date complets avec date et heure
            const dateTimeA = this.createDateTime(a.streamingDate, a.streamingTime);
            const dateTimeB = this.createDateTime(b.streamingDate, b.streamingTime);
            
            // Tri décroissant (plus récent en premier)
            return dateTimeB.getTime() - dateTimeA.getTime();
          } catch (error) {
            console.error('Erreur lors du tri des compétences:', error);
            // Fallback sur la date de création si problème
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
        });
        this.isLoading = false;
      },
      error: () => {
        this.error = 'Erreur lors du chargement des compétences';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      }
    });
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
          error: () => {
            this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
          }
        });
      }
    });
  }

  openUpdateDialog(skill: Skill): void {
    // Vérifier si la compétence peut être modifiée
    if (!this.canEditSkill(skill)) {
      this.snackBar.open('⏰ Cette compétence ne peut plus être modifiée car sa date est passée', 'Fermer', { 
        duration: 4000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    const dialogRef = this.dialog.open(SkillFormComponent, {
      width: '600px',
      panelClass: 'skill-form-dialog',
      data: { skill, mode: 'edit' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'success') {
        this.loadSkills();
      }
    });
  }

  showAcceptedReceivers(skillId: number): void {
    const skill = this.skills.find(s => s.id === skillId);
    if (skill && skill.nbInscrits > 0) {
      this.dialog.open(AcceptedReceiversDialogComponent, {
        width: '800px',
        maxWidth: '95vw',
        maxHeight: '80vh',
        panelClass: 'receivers-dialog',
        data: { skillId, skillName: skill.name }
      });
    }
  }

  /**
   * Vérifie si une compétence peut être modifiée
   * Une compétence ne peut être modifiée que si sa date/heure n'est pas encore passée
   */
  canEditSkill(skill: Skill): boolean {
    if (!skill.streamingDate || !skill.streamingTime) {
      return true; // Si pas de date/heure, on autorise la modification
    }

    try {
      // Créer un objet Date complet avec la date et l'heure
      const [hours, minutes] = skill.streamingTime.split(':').map(Number);
      const skillDateTime = new Date(skill.streamingDate);
      skillDateTime.setHours(hours, minutes, 0, 0);

      const now = new Date();
      
      // La compétence peut être modifiée si sa date/heure est dans le futur
      return skillDateTime > now;
    } catch (error) {
      console.error('Erreur lors de la vérification de la date:', error);
      return true; // En cas d'erreur, on autorise par défaut
    }
  }

  /**
   * Vérifie si une compétence est expirée (pour affichage visuel)
   */
  isSkillExpired(skill: Skill): boolean {
    return !this.canEditSkill(skill);
  }

  /**
   * Obtient le message tooltip pour le bouton de modification
   */
  getEditTooltip(skill: Skill): string {
    if (this.canEditSkill(skill)) {
      return 'Modifier cette compétence';
    } else {
      return 'Cette compétence ne peut plus être modifiée car sa date est passée';
    }
  }

  /**
   * Crée un objet Date complet à partir d'une date et d'une heure
   */
  private createDateTime(dateStr: string, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const dateTime = new Date(dateStr);
    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime;
  }
}