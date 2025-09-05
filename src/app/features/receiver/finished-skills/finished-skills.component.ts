import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { UserService } from '../../../core/services/User/user.service';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';
import { SkillResponse } from '../../../core/services/Exchange/exchange.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';
import { CommonModule, SlicePipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { RatingService, RatingResponse, SkillRatingStats } from '../../../core/services/Rating/rating.service';
import { SkillRatingsDialogComponent } from '../../producer/SkillRatingsDialog/skill-ratings-dialog/skill-ratings-dialog.component';
import { RatingDialogComponent } from '../../RatingDialog/rating-dialog/rating-dialog.component';

// RxJS imports pour performance
import { forkJoin, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

interface SkillWithExchange extends SkillResponse {
  exchangeStatus: string;
  exchangeId: number;
  showFullDescription?: boolean;
  sessionData?: LivestreamSession;
  producerName?: string;
  hasRated?: boolean;
  currentRating?: number;
  currentComment?: string;
  ratingDate?: string;
}

@Component({
  selector: 'app-finished-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    MatChipsModule,
    SlicePipe,
    DatePipe,
    DecimalPipe
  ],
  template: `
    <div class="skills-container">
      <mat-progress-bar *ngIf="isLoading" mode="indeterminate"></mat-progress-bar>
      
      <div *ngIf="error" class="error-message">
        <mat-icon>error</mat-icon> {{ error }}
      </div>
      
      <div *ngIf="!isLoading && !error">
        <div *ngIf="skills.length === 0" class="no-skills">
          <img src="assets/images/default-skills.png" alt="Aucune compétence terminée" class="empty-state-img">
          <p>Vous n'avez pas encore de compétences terminées.</p>
          <small>Les compétences apparaîtront ici après avoir terminé vos sessions</small>
        </div>
        
        <div class="skills-grid">
          <mat-card *ngFor="let skill of skills; trackBy: trackBySkillId" 
                    class="skill-card" 
                    [class.session-completed]="true">
            <div class="skill-image-container">
              <img [src]="skill.pictureUrl || 'assets/images/default-skills.png'" 
                   alt="{{ skill.name }}" 
                   class="skill-image">
              
              <!-- Status chip overlay - Toujours "Terminé" -->
              <div class="status-overlay">
                <mat-chip color="primary" selected>
                  Terminé
                </mat-chip>
              </div>
            </div>
            
            <mat-card-content>
              <!-- Titre avec limitation à 3 lignes -->
              <h3 class="skill-title" [title]="skill.name">{{ skill.name }}</h3>
              
              <span class="skill-category">{{ skill.categoryName }}</span>
              
              <!-- Description avec toggle pour voir plus/moins -->
              <div class="skill-description-wrapper">
                <p class="skill-description" 
                   [class.expanded]="skill.showFullDescription">
                  {{ skill.description }}
                </p>
                <button *ngIf="skill.description && skill.description.length > 200" 
                        mat-button 
                        class="toggle-description-btn"
                        (click)="toggleDescription(skill)">
                  {{ skill.showFullDescription ? 'Voir moins' : 'Voir plus' }}
                </button>
              </div>
              
              <!-- Métadonnées sur une seule ligne -->
              <div class="skill-meta">
                <div class="single-meta-row">
                  <!-- Participants -->
                  <div class="meta-item">
                    <mat-icon>people</mat-icon>
                    <span>{{ skill.nbInscrits }}/{{ skill.availableQuantity }}</span>
                  </div>

                  <!-- Date -->
                  <div class="meta-item">
                    <mat-icon>calendar_today</mat-icon>
                    <span>{{ skill.streamingDate | date:'dd/MM/yy' }}</span>
                  </div>

                  <!-- Heure -->
                  <div class="meta-item">
                    <mat-icon>access_time</mat-icon>
                    <span>{{ skill.streamingTime }}</span>
                  </div>

                  <!-- Prix -->
                  <div class="meta-item price">
                    <span>TND {{ skill.price | number:'1.2-2' }}</span>
                  </div>
                  
                </div> 
                <br>
                <div>
                <span>Proposé par : </span>
                <a (click)="openProducerProfile(skill.userId)" class="producer-link">
                  {{ getProducerName(skill.userId) }}
                </a></div>
              </div>
              
              <!-- Producer info compacte -->
              <div class="producer-info">
              
                
                <!-- Section Rating compacte -->
                <div class="skill-rating-compact" *ngIf="skill.hasRated">
                  <div class="rating-summary">
                    <mat-icon>star</mat-icon>
                    <span class="rating-label">Votre note:</span>
                    <div class="rating-value">
                      <span class="rating-number" [style.color]="getRatingColor(skill.currentRating!)">
                        {{ skill.currentRating | number:'1.1-1' }}
                      </span>
                      <span class="rating-count">/5</span>
                      
                      <!-- Affichage des étoiles mini -->
                      <div class="stars-mini">
                        <mat-icon *ngFor="let star of getStarArray(skill.currentRating!)" 
                                  [class.filled]="star"
                                  class="star-icon-mini">
                          {{ star ? 'star' : 'star_border' }}
                        </mat-icon>
                      </div>
                    </div>
                    
                    <!-- Bouton pour voir les détails -->
                    <button mat-stroked-button 
                            color="primary" 
                            class="view-rating-btn"
                            (click)="viewMyRating(skill)">
                      <mat-icon>visibility</mat-icon>
                      Voir détails
                    </button>
                  </div>
                </div>
                
                <!-- Prompt d'évaluation compact -->
                <div class="rating-prompt-compact" *ngIf="!skill.hasRated">
                  <button mat-raised-button 
                          color="primary" 
                          class="rate-compact-btn"
                          (click)="openRatingDialog(skill)">
                    <mat-icon>star_rate</mat-icon>
                    Évaluer
                  </button>
                </div>
              </div>
            </mat-card-content>
            
            <mat-card-actions>
              <!-- Badge session terminée centré -->
              <div class="session-completed-badge">
                <mat-icon>check_circle</mat-icon>
                <span>Session terminée</span>
              </div>
            </mat-card-actions>
          </mat-card>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Container principal */
    .skills-container {
      padding: 0px 20px 20px 20px;
      max-width: 1200px;
      margin: -30px auto 0 auto;
      background-color: #f5f6fa;
      min-height: 100vh;
      animation: fadeIn 0.8s ease-out;
    }

    /* Error Message */
    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #d63031;
      background-color: #ffebee;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid #d63031;
      animation: fadeIn 0.5s ease-out;
    }

    /* No Skills */
    .no-skills {
      text-align: center;
      padding: 60px 20px;
      color: #636e72;
      background: white;
      border-radius: 15px;
      border: 2px dashed #6c5ce7;
      animation: fadeIn 0.8s ease-out;
    }

    .empty-state-img {
      width: 200px;
      height: 150px;
      object-fit: cover;
      margin-bottom: 20px;
      opacity: 0.7;
      animation: float 6s ease-in-out infinite;
    }

    /* Skills Grid */
    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 24px;
      margin-top: 0;
      align-items: stretch; /* Force l'étirement des cartes */
    }

    .skill-card {
      position: relative;
      overflow: visible;
      transition: all 0.3s ease;
      border-radius: 15px;
      background: white;
      border: 2px solid #a5d6a7;
      box-shadow: 0 5px 20px rgba(0,0,0,0.05);
      animation: scaleIn 0.5s ease-out;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .skill-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 15px 40px rgba(76, 175, 80, 0.15);
      border-color: #4caf50;
    }

    /* Style spécial pour sessions terminées */
    .skill-card.session-completed {
      background: linear-gradient(to bottom, rgba(168, 214, 167, 0.02), transparent);
    }

    .skill-card.session-completed::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 60px 60px 0;
      border-color: transparent #4caf50 transparent transparent;
    }

    .skill-card.session-completed::after {
      content: '✓';
      position: absolute;
      top: 8px;
      right: 8px;
      color: white;
      font-size: 24px;
      font-weight: bold;
      z-index: 1;
    }

    /* Skill Image */
    .skill-image-container {
      position: relative;
      height: 200px;
      overflow: hidden;
      border-radius: 15px 15px 0 0;
      flex-shrink: 0;
    }

    .skill-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .skill-card:hover .skill-image {
      transform: scale(1.05);
    }

    .status-overlay {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 2;
    }

    .status-overlay mat-chip {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      animation: chipPulse 2s infinite;
      border-radius: 20px;
      padding: 4px 12px;
    }

    @keyframes chipPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.9; transform: scale(1.02); }
    }

    /* Card Content */
    .skill-card mat-card-content {
      padding: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
        min-height: 0; 
    }

    /* Titre avec limitation à 3 lignes */
    .skill-title {
      margin: 0 0 8px 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #2d3436;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      max-height: calc(1.3em * 3);
      word-wrap: break-word;
      word-break: break-word;
      min-height: 2.6em;
    }

    /* Catégorie */
    .skill-category {
  display: inline-block;
  background-color: #e3f2fd;
  color: #1976d2;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  align-self: flex-start;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

    /* Description avec toggle */
    .skill-description-wrapper {
  position: relative;
  margin: 12px 0;
  flex: 1; /* Prend l'espace disponible restant */
  min-height: 0; /* Permet la réduction */
  display: flex;
  flex-direction: column;
}

    .skill-description {
  color: #636e72;
  line-height: 1.5;
  font-size: 0.9rem;
  margin: 0;
  flex: 1;
  word-wrap: break-word;
  word-break: break-word;
  transition: all 0.3s ease;
  
  /* Mode collapsed par défaut */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: calc(1.5em * 4); /* 4 lignes max en mode collapsed */
}

   .skill-description.expanded {
  -webkit-line-clamp: 8; /* Limite à 8 lignes max même en expanded */
  max-height: calc(1.5em * 8);
  overflow: hidden; /* Garde le scroll caché */
}

    .toggle-description-btn {
      font-size: 0.8rem;
      color: #1976d2;
      padding: 4px 8px;
      margin-top: 4px;
      min-height: 0;
      line-height: 1.2;
    }

    .toggle-description-btn:hover {
      background-color: rgba(25, 118, 210, 0.08);
    }

    /* Skill Meta */
   .skill-meta {
  margin: 16px 0;
  border-top: 1px solid #e0e0e0;
  padding-top: 16px;
  flex-shrink: 0; /* Ne se réduit pas */
  min-height: 80px; /* Hauteur minimale constante */
}

    .single-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      gap: 12px;
      flex-wrap: nowrap;
    }

    .single-meta-row .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
      color: #636e72;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .single-meta-row .meta-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #999;
      flex-shrink: 0;
    }

    .single-meta-row .meta-item.price {
      color: #4caf50;
      font-weight: 600;
      font-size: 1rem;
    }

    /* Producer info avec rating compact */
   .producer-info {
  margin-top: auto; /* Pousse vers le bas */
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  font-size: 0.85rem;
  color: #636e72;
  flex-shrink: 0; /* Ne se réduit pas */
}

    .producer-link {
      color: #1976d2;
      cursor: pointer;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s ease;
      border-radius: 4px;
      padding: 2px 4px;
    }

    .producer-link:hover {
      color: #1565c0;
      background: rgba(25, 118, 210, 0.08);
      transform: translateY(-1px);
    }

    /* Rating Section Compact */
    .skill-rating-compact {
      background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
      border-left: 4px solid #FFD700;
    }

    .rating-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .rating-summary > mat-icon {
      color: #FFD700;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .rating-label {
      font-weight: 600;
      color: #555;
      font-size: 0.85rem;
    }

    .rating-value {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .rating-number {
      font-size: 1.1rem;
      font-weight: bold;
      transition: color 0.3s ease;
    }

    .rating-count {
      font-size: 0.8rem;
      color: #666;
    }

    .stars-mini {
      display: inline-flex;
      gap: 2px;
    }

    .star-icon-mini {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #ddd;
      transition: color 0.2s ease;
    }

    .star-icon-mini.filled {
      color: #FFD700;
    }

    /* Bouton voir détails rating */
    .view-rating-btn {
      font-size: 0.8rem;
      height: 32px;
      font-weight: 500;
      border-radius: 8px;
      background: #e3f2fd;
      color: #1976d2;
      border: 1px solid #90caf9;
      margin-left: 8px;
    }

    .view-rating-btn:hover {
      background: #1976d2;
      color: white;
    }

    .view-rating-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }

    /* Prompt d'évaluation compact */
    .rating-prompt-compact {
      margin-top: 12px;
      display: flex;
      justify-content: center;
    }

    .rate-compact-btn {
      height: 36px;
      font-weight: 500;
      border-radius: 8px;
      background: #e8f5e8;
      color: #388e3c;
      border: 1px solid #a5d6a7;
      font-size: 0.9rem;
    }

    .rate-compact-btn:hover {
      background: #388e3c;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(56, 142, 60, 0.2);
    }

    .rate-compact-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 4px;
    }

    /* Card Actions */
  .skill-card mat-card-actions {
  padding: 16px 20px;
  background-color: #f5f6fa;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0; /* Ne se réduit pas */
  min-height: 70px; /* Hauteur constante */
  display: flex;
  align-items: center;
  justify-content: center;
}

    /* Badge session terminée centré */
    .session-completed-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #e8f5e8;
      color: #388e3c;
      border: 1px solid #a5d6a7;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.85rem;
      margin: 0 auto;
      width: fit-content;
      text-align: center;
    }

    .session-completed-badge mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes scaleIn {
      from { transform: scale(0.8); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    @keyframes slideInLeft {
      from { transform: translateX(-50px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes float {
      0% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-20px) rotate(10deg); }
      100% { transform: translateY(0) rotate(0deg); }
    }

    /* Progress bar styling */
    mat-progress-bar {
      margin-bottom: 20px;
      border-radius: 4px;
    }

    mat-progress-bar .mat-progress-bar-fill::after {
      background: linear-gradient(45deg, #6c5ce7, #a29bfe);
    }

    /* Focus states */
    .view-rating-btn:focus,
    .rate-compact-btn:focus,
    .producer-link:focus,
    .toggle-description-btn:focus {
      outline: 2px solid #6c5ce7;
      outline-offset: 2px;
    }

    /* Status chip colors */
    mat-chip[color="primary"] {
      background-color: #e8f5e8 !important;
      color: #388e3c !important;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .skills-container {
        padding: 16px;
      }
      
      .skills-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      
      .skill-card {
        margin: 0;
      }
      
      .skill-title {
        font-size: 1.1rem;
      }
      
      .single-meta-row {
        gap: 8px;
      }
      
      .single-meta-row .meta-item {
        font-size: 0.8rem;
      }
      
      .single-meta-row .meta-item mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      
      .skill-rating-compact {
        padding: 10px;
      }
      
      .rating-summary {
        flex-wrap: wrap;
        gap: 6px;
      }
      
      .rating-value {
        width: 100%;
        justify-content: space-between;
      }
      
      .skill-description {
        -webkit-line-clamp: 3;
        max-height: calc(1.5em * 3);
      }
    }

    @media (max-width: 480px) {
      .skill-image-container {
        height: 160px;
      }
      
      .single-meta-row {
        gap: 6px;
        flex-wrap: wrap;
      }
      
      .single-meta-row .meta-item {
        font-size: 0.75rem;
      }
      
      .single-meta-row .meta-item.price {
        font-size: 0.85rem;
        width: 100%;
        justify-content: center;
        margin-top: 4px;
      }
      
      .skill-description {
        font-size: 0.85rem;
        -webkit-line-clamp: 3;
        max-height: calc(1.5em * 3);
      }
      
      .skill-title {
        font-size: 1rem;
        -webkit-line-clamp: 2;
        max-height: calc(1.3em * 2);
        min-height: 1.3em;
      }
    }
  `]
})
export class FinishedSkillsComponent implements OnInit {
  skills: SkillWithExchange[] = [];
  sessions: { [skillId: number]: LivestreamSession } = {};
  producerNames: { [key: number]: string } = {};
  isLoading = true;
  error: string | null = null;

  constructor(
    private exchangeService: ExchangeService,
    private userService: UserService,
    private livestreamService: LivestreamService,
    private ratingService: RatingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFinishedSkills();
  }

  loadFinishedSkills(): void {
    this.isLoading = true;
    this.error = null;

    // Charger les échanges terminés et les compétences acceptées
    const exchangesCall = this.exchangeService.getUserExchanges().pipe(
      map(exchanges => exchanges.filter(ex => ex.status === 'COMPLETED')),
      catchError(() => of([]))
    );

    const skillsCall = this.exchangeService.getAcceptedSkills().pipe(
      catchError(() => of([]))
    );

    forkJoin([exchangesCall, skillsCall]).subscribe({
      next: ([finishedExchanges, allSkills]) => {
        if (finishedExchanges.length === 0) {
          this.skills = [];
          this.isLoading = false;
          return;
        }

        // Créer le map des échanges
        const exchangeMap = new Map(finishedExchanges.map(ex => [ex.skillId, ex]));
        
        // Filtrer et mapper les compétences avec données d'échange
        const relevantSkills: SkillWithExchange[] = allSkills
          .map(skill => {
            const exchange = exchangeMap.get(skill.id);
            return exchange ? {
              ...skill,
              exchangeStatus: exchange.status,
              exchangeId: exchange.id,
              showFullDescription: false
            } as SkillWithExchange : null;
          })
          .filter((skill): skill is SkillWithExchange => skill !== null);

        this.skills = relevantSkills;
        this.loadAdditionalData();
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement';
        this.isLoading = false;
        console.error('Erreur:', err);
      }
    });
  }

  private loadAdditionalData(): void {
    // Charger les noms des producteurs et les statuts de rating
    const userIds = [...new Set(this.skills.map(skill => skill.userId))];
    
    const additionalCalls = [
      // Charger les utilisateurs
      ...userIds.map(userId => 
        this.userService.getUserById(userId).pipe(
          catchError(() => of({ id: userId, firstName: 'Utilisateur', lastName: 'inconnu' })),
          map(user => ({ type: 'user' as const, userId, data: user }))
        )
      ),
      // Charger les statuts de rating
      ...this.skills.map(skill =>
        this.ratingService.getRatingForExchange(skill.exchangeId).pipe(
          catchError(() => of(null)),
          map(rating => ({ type: 'rating' as const, skillId: skill.id, data: rating }))
        )
      )
    ];

    forkJoin(additionalCalls).subscribe({
      next: (results) => {
        // Traiter les résultats avec type guards
        results.forEach(result => {
          if (result.type === 'user' && 'userId' in result) {
            if (result.data && typeof result.data === 'object' && 'firstName' in result.data && 'lastName' in result.data) {
              const userData = result.data as { firstName: string; lastName: string };
              const fullName = `${userData.firstName} ${userData.lastName}`;
              this.producerNames[result.userId] = fullName;
            }
          } else if (result.type === 'rating' && 'skillId' in result) {
            const skill = this.skills.find(s => s.id === result.skillId);
            if (skill) {
              if (result.data && typeof result.data === 'object' && 'rating' in result.data) {
                const ratingData = result.data as RatingResponse;
                skill.hasRated = true;
                skill.currentRating = ratingData.rating;
                skill.currentComment = ratingData.comment;
                skill.ratingDate = ratingData.ratingDate;
              } else {
                skill.hasRated = false;
              }
            }
          }
        });

        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  openProducerProfile(userId: number): void {
    if (this.producerNames[userId] && this.producerNames[userId] !== 'Chargement...') {
      this.userService.getUserById(userId).subscribe({
        next: (user) => this.dialog.open(UserProfileDialogComponent, { 
          width: '420px',
          maxWidth: '420px',
          panelClass: 'custom-dialog-container',
          data: user 
        }),
        error: (err) => {
          this.snackBar.open('Erreur lors du chargement du profil', 'Fermer', { duration: 3000 });
          console.error('Erreur récupération utilisateur :', err);
        }
      });
    } else {
      this.snackBar.open('Profil en cours de chargement...', 'Fermer', { duration: 2000 });
    }
  }

  // Méthodes pour le rating
  getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#4CAF50';
    if (rating >= 3.5) return '#8BC34A';
    if (rating >= 2.5) return '#FFC107';
    if (rating >= 1.5) return '#FF9800';
    return '#F44336';
  }

  getStarArray(rating: number): boolean[] {
    const stars: boolean[] = [];
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }

  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Très bon';
    if (rating >= 2.5) return 'Bon';
    if (rating >= 1.5) return 'Moyen';
    if (rating >= 1) return 'Faible';
    return 'Non noté';
  }

  // Ouvrir le dialogue de rating pour évaluer/modifier
  openRatingDialog(skill: SkillWithExchange): void {
    const dialogRef = this.dialog.open(RatingDialogComponent, {
      width: '500px',
      maxWidth: '90vw',
      disableClose: false,
      data: {
        exchangeId: skill.exchangeId,
        skillName: skill.name,
        producerName: this.getProducerName(skill.userId),
        existingRating: skill.currentRating,
        existingComment: skill.currentComment
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.rated) {
        // Recharger les données de rating pour cette compétence
        this.reloadSkillRating(skill);
        
        this.snackBar.open(
          skill.hasRated ? 'Évaluation modifiée avec succès' : 'Évaluation enregistrée avec succès',
          'Fermer',
          { duration: 3000, panelClass: ['success-snackbar'] }
        );
      }
    });
  }

  // Voir les détails du rating
  viewMyRating(skill: SkillWithExchange): void {
    // Ouvrir le même dialogue de rating mais en mode visualisation/modification
    this.openRatingDialog(skill);
  }

  // Recharger le rating d'une compétence spécifique
  private reloadSkillRating(skill: SkillWithExchange): void {
    this.ratingService.getRatingForExchange(skill.exchangeId).subscribe({
      next: (rating) => {
        if (rating) {
          skill.hasRated = true;
          skill.currentRating = rating.rating;
          skill.currentComment = rating.comment;
          skill.ratingDate = rating.ratingDate;
        } else {
          skill.hasRated = false;
          skill.currentRating = undefined;
          skill.currentComment = undefined;
          skill.ratingDate = undefined;
        }
      },
      error: (error) => {
        console.error('Erreur lors du rechargement du rating:', error);
      }
    });
  }

  /**
   * Toggle pour afficher/masquer la description complète
   */
  toggleDescription(skill: SkillWithExchange): void {
    skill.showFullDescription = !skill.showFullDescription;
  }

  trackBySkillId(index: number, skill: SkillWithExchange): number {
    return skill.id;
  }
}