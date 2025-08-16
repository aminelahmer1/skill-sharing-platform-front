import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { RatingService, ProducerRatingStats } from '../../../core/services/Rating/rating.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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
}

// ✨ INTERFACE MISE À JOUR - Suppression de totalRatings
interface UserStats {
  averageRating: number;
  skillsCount: number;
  hasData: boolean;
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
    MatProgressSpinnerModule,
    DatePipe,
  ]
})
export class UserProfileDialogComponent implements OnInit {
  // ✨ STATS MISES À JOUR - Suppression de totalRatings
  userStats: UserStats = {
    averageRating: 0,
    skillsCount: 0,
    hasData: false
  };
  
  isLoadingStats = true;
  statsError = false;

  constructor(
    public dialogRef: MatDialogRef<UserProfileDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserData,
    private skillService: SkillService,
    private ratingService: RatingService
  ) {
    console.log('🔍 User profile data reçue:', this.data);
    console.log('🔍 FirstName:', this.data.firstName);
    console.log('🔍 LastName:', this.data.lastName); 
    console.log('🔍 Username:', this.data.username);
    console.log('🔍 Email:', this.data.email);
  }

  ngOnInit(): void {
    this.loadUserStats();
  }

  private loadUserStats(): void {
    if (!this.data.id) {
      console.warn('⚠️ Pas d\'ID utilisateur fourni pour charger les statistiques');
      this.isLoadingStats = false;
      this.statsError = true;
      return;
    }

    this.isLoadingStats = true;
    this.statsError = false;

    console.log(`📊 Chargement des statistiques pour l'utilisateur ${this.data.id}...`);

    // ✨ CHARGEMENT OPTIMISÉ - Seulement rating et compétences
    const ratingStatsCall = this.ratingService.getProducerRatingStats(this.data.id, false).pipe(
      catchError(error => {
        console.error('❌ Erreur lors du chargement des statistiques de rating:', error);
        return of(null);
      })
    );

    const skillsCountCall = this.skillService.getSkillsCountByProducer(this.data.id).pipe(
      catchError(error => {
        console.error('❌ Erreur lors du chargement du nombre de compétences:', error);
        return of(0);
      })
    );

    // Exécuter les deux appels en parallèle
    forkJoin({
      ratingStats: ratingStatsCall,
      skillsCount: skillsCountCall
    }).subscribe({
      next: ({ ratingStats, skillsCount }) => {
        if (ratingStats || skillsCount > 0) {
          // ✨ MISE À JOUR - Suppression de totalRatings
          this.userStats = {
            averageRating: ratingStats?.averageRating || 0,
            skillsCount: skillsCount,
            hasData: true
          };
          console.log('✅ Statistiques chargées avec succès:', this.userStats);
        } else {
          this.userStats = {
            averageRating: 0,
            skillsCount: 0,
            hasData: false
          };
          console.log('⚠️ Aucune statistique disponible pour ce producteur');
        }
        this.isLoadingStats = false;
      },
      error: (error) => {
        console.error('❌ Erreur lors du chargement des statistiques:', error);
        this.statsError = true;
        this.isLoadingStats = false;
      }
    });
  }

  /**
   * ✨ Obtient le nom d'affichage de l'utilisateur
   */
  getDisplayName(): string {
    if (this.data.firstName || this.data.lastName) {
      return `${this.data.firstName || ''} ${this.data.lastName || ''}`.trim();
    }
    return this.data.username || this.data.email || 'Utilisateur';
  }

  /**
   * ✨ Obtient l'identifiant secondaire (username ou email)
   */
  getSecondaryIdentifier(): string {
    // Si on a un nom complet, afficher username ou email en secondaire
    if (this.data.firstName || this.data.lastName) {
      return this.data.username || this.data.email;
    }
    // Sinon, afficher l'email en secondaire
    return this.data.email;
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

  // ✨ GETTERS OPTIMISÉS pour l'affichage des statistiques

  get averageRating(): string {
    if (this.isLoadingStats) return '...';
    if (!this.userStats.hasData || this.statsError) return 'N/A';
    if (this.userStats.averageRating === 0) return 'Pas encore noté';
    return this.userStats.averageRating.toFixed(1);
  }

  get skillsCount(): string {
    if (this.isLoadingStats) return '...';
    if (this.statsError) return 'N/A';
    return this.userStats.skillsCount.toString();
  }

  /**
   * ✨ Obtient la couleur pour l'affichage de la note
   */
  getRatingColor(): string {
    if (!this.userStats.hasData || this.userStats.averageRating === 0) {
      return '#95a5a6'; // Gris pour pas de données
    }
    
    if (this.userStats.averageRating >= 4.5) return '#4CAF50'; // Vert - Excellent
    if (this.userStats.averageRating >= 3.5) return '#8BC34A'; // Vert clair - Très bon
    if (this.userStats.averageRating >= 2.5) return '#FFC107'; // Orange - Moyen
    if (this.userStats.averageRating >= 1.5) return '#FF9800'; // Orange foncé - Faible
    return '#F44336'; // Rouge - Très faible
  }

  /**
   * ✨ Affiche les étoiles pour la note moyenne
   */
  getStarArray(): boolean[] {
    const stars: boolean[] = [];
    const rating = this.userStats.averageRating;
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }

  /**
   * ✨ Vérifie si on doit afficher les étoiles
   */
  shouldShowStars(): boolean {
    return this.userStats.hasData && this.userStats.averageRating > 0 && !this.isLoadingStats;
  }
}