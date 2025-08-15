import { Component, OnInit, Inject } from '@angular/core';
import { SkillService } from '../../../../core/services/Skill/skill.service';
import { LivestreamService } from '../../../../core/services/LiveStream/livestream.service';
import { ExchangeService } from '../../../../core/services/Exchange/exchange.service';
import { Skill } from '../../../../models/skill/skill.model';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AcceptedReceiversDialogComponent } from '../../accepted-receivers-dialog/accepted-receivers-dialog.component';
import { SkillRatingsDialogComponent } from '../../SkillRatingsDialog/skill-ratings-dialog/skill-ratings-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { LivestreamSession } from '../../../../models/LivestreamSession/livestream-session';
import { firstValueFrom } from 'rxjs';
import { RatingService, SkillRatingStats } from '../../../../core/services/Rating/rating.service';

// Interface pour les données de confirmation de livestream
interface LivestreamConfirmationData {
  title: string;
  skillName: string;
  participantsCount: number;
  streamingDate: string;
  streamingTime: string;
  confirmText?: string;
  cancelText?: string;
  isImmediate?: boolean;
}

// Composant de confirmation pour livestream
@Component({
  selector: 'app-livestream-confirmation',
  standalone: true,
  imports: [
    CommonModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule
  ],
  template: `
    <div class="confirmation-dialog">
      <div class="dialog-header">
        <mat-icon class="dialog-icon">live_tv</mat-icon>
        <h2 class="dialog-title">{{ data.title }}</h2>
      </div>
      
      <div class="dialog-content">
        <div class="livestream-info">
          <h3>{{ data.skillName }}</h3>
          <div class="livestream-details">
            <div class="detail-item">
              <mat-icon>people</mat-icon>
              <span>{{ data.participantsCount }} participant(s) inscrits</span>
            </div>
            <div class="detail-item">
              <mat-icon>schedule</mat-icon>
              <span>{{ data.streamingDate }} à {{ data.streamingTime }}</span>
            </div>
            <div class="detail-item" *ngIf="data.isImmediate">
              <mat-icon>flash_on</mat-icon>
              <span>Démarrage immédiat</span>
            </div>
          </div>
        </div>
        
        <p class="confirmation-message">
          {{ data.isImmediate ? 
              'Voulez-vous démarrer le livestream maintenant ? Les participants recevront une notification immédiate.' :
              'Voulez-vous programmer ce livestream ? Les participants recevront une notification.' }}
        </p>
      </div>
      
      <div class="dialog-actions">
        <button mat-button 
                (click)="onCancel()" 
                class="cancel-btn">
          {{ data.cancelText || 'Annuler' }}
        </button>
        <button mat-raised-button 
                [color]="data.isImmediate ? 'warn' : 'primary'"
                (click)="onConfirm()" 
                class="confirm-btn">
          <mat-icon>{{ data.isImmediate ? 'live_tv' : 'schedule' }}</mat-icon>
          {{ data.confirmText || (data.isImmediate ? 'Démarrer' : 'Programmer') }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirmation-dialog {
      padding: 24px;
      max-width: 450px;
      min-width: 350px;
    }
    
    .dialog-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
      text-align: center;
    }
    
    .dialog-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #6c5ce7;
      margin-bottom: 16px;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .dialog-title {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: #2d3436;
    }
    
    .dialog-content {
      margin-bottom: 24px;
    }
    
    .livestream-info {
      background: rgba(108, 92, 231, 0.08);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    
    .livestream-info h3 {
      margin: 0 0 12px 0;
      color: #6c5ce7;
      font-size: 1.1rem;
      font-weight: 600;
      text-align: center;
    }
    
    .livestream-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #636e72;
      font-size: 0.9rem;
    }
    
    .detail-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #6c5ce7;
    }
    
    .confirmation-message {
      color: #636e72;
      line-height: 1.5;
      font-size: 0.9rem;
      text-align: center;
      margin: 0;
    }
    
    .dialog-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    
    .cancel-btn {
      padding: 10px 20px;
      color: #636e72;
    }
    
    .confirm-btn {
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .confirm-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class LivestreamConfirmationComponent {
  constructor(
    public dialogRef: MatDialogRef<LivestreamConfirmationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: LivestreamConfirmationData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

// Interface pour les compétences avec statut de session
interface SkillWithSessionStatus extends Skill {
  sessionStatus?: 'none' | 'scheduled' | 'live' | 'completed';
  sessionId?: number;
  hasActiveSession?: boolean;
  isSessionCompleted?: boolean; 
  session?: LivestreamSession;
}

@Component({
  selector: 'app-my-livestreams',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    MatChipsModule,
    DecimalPipe
  ],
  templateUrl: './my-livestreams.component.html',
  styleUrls: ['./my-livestreams.component.css']
})
export class MyLivestreamsComponent implements OnInit {
  skills: SkillWithSessionStatus[] = [];
  sessions: { [skillId: number]: LivestreamSession } = {};
  skillRatings: { [skillId: number]: SkillRatingStats } = {};
  isLoading = true;
  error: string | null = null;

  constructor(
    private skillService: SkillService,
    private livestreamService: LivestreamService,
    private exchangeService: ExchangeService,
    private ratingService: RatingService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSkills();
  }

  loadSkills(): void {
    this.isLoading = true;
    this.error = null;

    this.skillService.getMySkills().subscribe({
      next: (skills) => {
        // Afficher TOUTES les compétences (pas seulement celles avec participants)
        this.skills = skills.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.checkActiveSessions();
      },
      error: () => {
        this.error = 'Erreur lors du chargement des compétences';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      }
    });
  }

  checkActiveSessions(): void {
    const checkPromises = this.skills.map(skill => {
      return new Promise<void>((resolve) => {
        this.livestreamService.getSessionBySkillId(skill.id).subscribe({
          next: session => {
            if (session) {
              this.sessions[skill.id] = session;
              
              // Mapper le statut de session sur la compétence
              switch (session.status) {
                case 'LIVE':
                  skill.sessionStatus = 'live';
                  skill.hasActiveSession = true;
                  skill.isSessionCompleted = false;
                  break;
                case 'SCHEDULED':
                  skill.sessionStatus = 'scheduled';
                  skill.hasActiveSession = true;
                  skill.isSessionCompleted = false;
                  break;
                case 'COMPLETED':
                  skill.sessionStatus = 'completed';
                  skill.hasActiveSession = false;
                  skill.isSessionCompleted = true;
                  // Charger les ratings pour cette compétence
                  this.loadSkillRatings(skill.id);
                  break;
                default:
                  skill.sessionStatus = 'none';
                  skill.hasActiveSession = false;
                  skill.isSessionCompleted = false;
              }
              skill.sessionId = session.id;
              skill.session = session;
              resolve();
            } else {
              // Vérifier si des échanges ont été complétés pour cette compétence
              this.exchangeService.isSessionCompletedForSkill(skill.id).subscribe({
                next: (isCompleted) => {
                  if (isCompleted) {
                    skill.sessionStatus = 'completed';
                    skill.hasActiveSession = false;
                    skill.isSessionCompleted = true;
                    // Charger les ratings pour cette compétence
                    this.loadSkillRatings(skill.id);
                  } else {
                    skill.sessionStatus = 'none';
                    skill.hasActiveSession = false;
                    skill.isSessionCompleted = false;
                  }
                  resolve();
                },
                error: () => {
                  skill.sessionStatus = 'none';
                  skill.hasActiveSession = false;
                  skill.isSessionCompleted = false;
                  resolve();
                }
              });
            }
          },
          error: () => {
            skill.sessionStatus = 'none';
            skill.hasActiveSession = false;
            skill.isSessionCompleted = false;
            resolve();
          }
        });
      });
    });

    Promise.all(checkPromises).then(() => {
      this.isLoading = false;
    });
  }

  private loadSkillRatings(skillId: number): void {
    this.ratingService.getSkillRatingStats(skillId).subscribe({
      next: (stats) => {
        this.skillRatings[skillId] = stats;
      },
      error: (error) => {
        console.error(`Erreur lors du chargement des ratings pour la compétence ${skillId}:`, error);
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
      data: { 
        skillId: skillId, 
        skillName: skill.name  }
      });
    }
  }

  createLivestreamSession(skill: SkillWithSessionStatus, immediate: boolean = false): void {
    // Vérifier d'abord si la session n'est pas déjà terminée
    if (skill.isSessionCompleted || skill.sessionStatus === 'completed') {
      this.snackBar.open(
        'Cette session a déjà été terminée. Impossible de créer une nouvelle session pour cette compétence.',
        'Fermer', 
        { duration: 5000 }
      );
      return;
    }

    // Vérifier s'il y a une session active
    if (skill.hasActiveSession) {
      this.snackBar.open(
        'Une session est déjà active pour cette compétence.',
        'Fermer', 
        { duration: 3000 }
      );
      return;
    }

    const dialogRef = this.dialog.open(LivestreamConfirmationComponent, {
      width: '450px',
      disableClose: true,
      data: {
        title: immediate ? 'Démarrer le Livestream' : 'Programmer le Livestream',
        skillName: skill.name,
        participantsCount: skill.nbInscrits,
        streamingDate: skill.streamingDate,
        streamingTime: skill.streamingTime,
        isImmediate: immediate,
        confirmText: immediate ? 'Démarrer maintenant' : 'Programmer',
        cancelText: 'Annuler'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.performCreateSession(skill, immediate);
      }
    });
  }

  private performCreateSession(skill: SkillWithSessionStatus, immediate: boolean): void {
    this.isLoading = true;
    
    this.livestreamService.createSession(skill.id, immediate).subscribe({
      next: (session) => {
        this.sessions[skill.id] = session;
        skill.sessionStatus = immediate ? 'live' : 'scheduled';
        skill.hasActiveSession = true;
        skill.sessionId = session.id;
        
        this.snackBar.open(
          immediate 
            ? 'Livestream démarré avec succès !' 
            : `Livestream programmé pour ${session.startTime}`,
          'Fermer', 
          { duration: 5000 }
        );
        
        if (immediate) {
          console.log('Session créée avec producerToken:', !!session.producerToken);
          this.navigateToLivestream(session.id);
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Erreur lors de la création de la session:', err);
        this.snackBar.open('Échec de la création du livestream', 'Fermer', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  navigateToLivestream(sessionId: number): void {
    this.router.navigate(['/producer/livestream', sessionId]);
  }

  joinExistingSession(skill: SkillWithSessionStatus): void {
    if (skill.sessionId) {
      this.navigateToLivestream(skill.sessionId);
    }
  }

  // MÉTHODE MISE À JOUR pour ouvrir le dialogue amélioré
  viewSkillRatings(skillId: number): void {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;
    
    // Ouvrir le dialogue amélioré avec tous les commentaires
    const dialogRef = this.dialog.open(SkillRatingsDialogComponent, {
      width: '700px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'skill-ratings-dialog',
      data: {
        skillId: skillId,
        skillName: skill.name,
        ratings: this.skillRatings[skillId]
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      // Optionnel: actions après fermeture du dialogue
      console.log('Dialogue des évaluations fermé');
    });
  }

  getSessionStatusColor(status?: string): string {
    switch (status) {
      case 'live': return 'warn';
      case 'scheduled': return 'accent';
      case 'completed': return 'primary';
      default: return '';
    }
  }

  getSessionStatusLabel(status?: string): string {
    switch (status) {
      case 'live': return 'En direct';
      case 'scheduled': return 'Programmé';
      case 'completed': return 'Terminé';
      default: return 'Aucune session';
    }
  }

  getNoSessionMessage(skill: SkillWithSessionStatus): string {
    if (skill.isSessionCompleted || skill.sessionStatus === 'completed') {
      return 'Session terminée';
    }
    if (skill.nbInscrits === 0) {
      return 'Aucun participant inscrit';
    }
    return 'Session non disponible';
  }

  getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#4CAF50';
    if (rating >= 3.5) return '#8BC34A';
    if (rating >= 2.5) return '#FFC107';
    if (rating >= 1.5) return '#FF9800';
    return '#F44336';
  }

  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Très bon';
    if (rating >= 2.5) return 'Bon';
    if (rating >= 1.5) return 'Moyen';
    if (rating >= 1) return 'Faible';
    return 'Non noté';
  }

  getStarArray(rating: number): boolean[] {
    const stars: boolean[] = [];
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }

  canCreateSession(skill: SkillWithSessionStatus): boolean {
    // Ne peut pas créer si la session est complétée
    if (skill.isSessionCompleted || skill.sessionStatus === 'completed') {
      return false;
    }

    // Vérifier si la compétence a des participants inscrits
    if (skill.nbInscrits === 0) {
      return false;
    }

    // Vérifier si aucune session active n'existe
    return !skill.hasActiveSession;
  }

  canJoinSession(skill: SkillWithSessionStatus): boolean {
    return (skill.sessionStatus === 'live' || skill.sessionStatus === 'scheduled') && 
           !skill.isSessionCompleted;
  }
}