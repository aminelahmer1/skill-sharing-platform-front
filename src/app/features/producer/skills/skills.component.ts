// skills.component.ts
import { Component, OnInit } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { Skill } from '../../../models/skill/skill.model';
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
    SkillFormComponent
  ]
})
export class SkillsComponent implements OnInit {
  skills: Skill[] = [];
  isLoading = true;
  error: string | null = null;

  constructor(
    private skillService: SkillService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadSkills();
  }

  loadSkills(): void {
    this.isLoading = true;
    this.error = null;
    
    this.skillService.getMySkills().subscribe({
      next: (skills) => {
        this.skills = skills;
        this.isLoading = false;
      },
      error: (err) => {
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