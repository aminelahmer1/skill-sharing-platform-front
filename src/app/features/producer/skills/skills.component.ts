import { Component, OnInit } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { CategoryService } from '../../../core/services/category/category.service';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';
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
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';

@Component({
  selector: 'app-producer-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    DecimalPipe,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  templateUrl: './skills.component.html',
  styleUrls: ['./skills.component.css']
})
export class SkillsComponent implements OnInit {
  skills: Skill[] = [];
  filteredSkills: Skill[] = [];
  categories: Category[] = [];
  sessions: { [skillId: number]: LivestreamSession } = {};
  isLoading = true;
  error: string | null = null;

  selectedCategory: number | null = null;
  selectedDate: Date | null = null;
  sortOrder: 'asc' | 'desc' | 'default' = 'default';

  constructor(
    private skillService: SkillService,
    private categoryService: CategoryService,
    private livestreamService: LivestreamService,
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
        this.skills = skills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.applyFiltersAndSort();
        this.checkActiveSessions();
        this.isLoading = false;
      },
      error: () => {
        this.error = 'Erreur lors du chargement des compétences';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      }
    });
  }

  checkActiveSessions(): void {
  this.skills.forEach(skill => {
    this.livestreamService.getSessionBySkillId(skill.id).subscribe({
      next: session => {
        if (session && (session.status === 'LIVE' || session.status === 'SCHEDULED')) {
          this.sessions[skill.id] = session;
        }
      },
      error: () => {} // Ignore errors if session not found
    });
  });
}


  applyFiltersAndSort(): void {
    let filtered = [...this.skills];

    if (this.selectedCategory) {
      filtered = filtered.filter(skill => skill.categoryId === this.selectedCategory);
    }

    if (this.selectedDate) {
      const selectedDateStr = this.selectedDate.toISOString().split('T')[0];
      filtered = filtered.filter(skill => skill.streamingDate === selectedDateStr);
    }

    if (this.sortOrder === 'asc') {
      filtered = filtered.sort((a, b) => a.nbInscrits - b.nbInscrits);
    } else if (this.sortOrder === 'desc') {
      filtered = filtered.sort((a, b) => b.nbInscrits - a.nbInscrits);
    } else {
      filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    this.filteredSkills = filtered;
  }

  onCategoryChange(): void {
    this.applyFiltersAndSort();
  }

  onDateChange(): void {
    this.applyFiltersAndSort();
  }

  onSortChange(): void {
    this.applyFiltersAndSort();
  }

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
          error: () => {
            this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000 });
          }
        });
      }
    });
  }

  openUpdateDialog(skill: Skill): void {
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
        width: '500px',
        panelClass: 'receivers-dialog',
        data: { skillId, skillName: skill.name }
      });
    }
  }

  createLivestreamSession(skillId: number): void {
    this.livestreamService.createSession(skillId).subscribe({
      next: (session) => {
        this.sessions[skillId] = session;
        this.snackBar.open(`Session de livestream créée pour la compétence ${skillId}`, 'Fermer', { duration: 3000 });
        this.router.navigate(['/producer/livestream', session.id], {
          state: { producerToken: session.producerToken, roomName: session.roomName }
        });
      },
      error: () => {
        this.snackBar.open('Erreur lors de la création de la session de livestream', 'Fermer', { duration: 3000 });
      }
    });
  }
  navigateToLivestream(sessionId: number, producerToken: string, roomName: string): void {
    this.router.navigate(['/producer/livestream', sessionId], { state: { producerToken, roomName } });
  }
}