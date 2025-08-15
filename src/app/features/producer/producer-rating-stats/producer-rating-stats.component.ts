import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RatingService, ProducerRatingStats } from '../../../core/services/Rating/rating.service';
import { UserService } from '../../../core/services/User/user.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-producer-rating-stats',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatExpansionModule,
    MatTooltipModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './producer-rating-stats.component.html',
  styleUrls: ['./producer-rating-stats.component.css']
})
export class ProducerRatingStatsComponent implements OnInit {
  @Input() isOwnProfile = true; // Si c'est le profil du producteur connecté
  @Input() producerId?: number; // ID du producteur (si ce n'est pas le profil connecté)
  
  stats?: ProducerRatingStats;
  isLoading = true;
  error?: string;
  
  constructor(
    private ratingService: RatingService,
    private userService: UserService
  ) {}

  ngOnInit(): void {
    this.loadStats();
  }

  async loadStats(): Promise<void> {
    this.isLoading = true;
    this.error = undefined;
    
    try {
      if (this.isOwnProfile) {
        // Charger les stats du producteur connecté
        const currentUser = await firstValueFrom(this.userService.getCurrentUserProfile());
        this.stats = await firstValueFrom(
          this.ratingService.getProducerRatingStats(currentUser.id)
        );
      } else if (this.producerId) {
        // Charger les stats d'un autre producteur
        this.stats = await firstValueFrom(
          this.ratingService.getProducerRatingStats(this.producerId)
        );
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
      this.error = 'Impossible de charger les statistiques';
    } finally {
      this.isLoading = false;
    }
  }

  getStarArray(rating: number): boolean[] {
    return this.ratingService.getStarArray(rating);
  }

  getRatingColor(rating: number): string {
    return this.ratingService.getRatingColor(rating);
  }

  getRatingLabel(rating: number): string {
    return this.ratingService.getRatingLabel(rating);
  }

  getPercentageWidth(percentage: number): string {
    return `${percentage}%`;
  }
}