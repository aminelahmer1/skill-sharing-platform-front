import { Component, OnInit, Inject } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { UserService } from '../../../core/services/User/user.service';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { Skill } from '../../../models/skill/skill.model';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';

// Interface pour les données de confirmation
interface ConfirmationData {
  title: string;
  message: string;
  skillName: string;
  producerName: string;
  price: number;
  date: string;
  time: string;
  confirmText?: string;
  cancelText?: string;
}

// Composant de confirmation intégré
@Component({
  selector: 'app-reservation-confirmation',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirmation-dialog">
      <div class="dialog-header">
        <mat-icon class="dialog-icon">book_online</mat-icon>
        <h2 class="dialog-title">{{ data.title }}</h2>
      </div>
      
      <div class="dialog-content">
        <div class="skill-info">
          <h3>{{ data.skillName }}</h3>
          <div class="skill-details">
            <div class="detail-item">
              <mat-icon>person</mat-icon>
              <span>{{ data.producerName }}</span>
            </div>
            <div class="detail-item">
              <mat-icon>monetization_on</mat-icon>
              <span>{{ data.price }} TND</span>
            </div>
            <div class="detail-item">
              <mat-icon>schedule</mat-icon>
              <span>{{ data.date }} à {{ data.time }}</span>
            </div>
          </div>
        </div>
        
        <p class="confirmation-message">
          Confirmez-vous votre réservation ? Vous recevrez une notification une fois que le producteur aura validé votre demande.
        </p>
      </div>
      
      <div class="dialog-actions">
        <button mat-button 
                (click)="onCancel()" 
                class="cancel-btn">
          {{ data.cancelText || 'Annuler' }}
        </button>
        <button mat-raised-button 
                color="primary" 
                (click)="onConfirm()" 
                class="confirm-btn">
          <mat-icon>book_online</mat-icon>
          {{ data.confirmText || 'Réserver' }}
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
      color: #1976d2;
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
      color: #333;
    }
    
    .dialog-content {
      margin-bottom: 24px;
    }
    
    .skill-info {
      background: #f8f9ff;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    
    .skill-info h3 {
      margin: 0 0 12px 0;
      color: #1976d2;
      font-size: 1.1rem;
      font-weight: 600;
      text-align: center;
    }
    
    .skill-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
      font-size: 0.9rem;
    }
    
    .detail-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #1976d2;
    }
    
    .confirmation-message {
      color: #666;
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
      color: #666;
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
export class ReservationConfirmationComponent {
  constructor(
    public dialogRef: MatDialogRef<ReservationConfirmationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
import { Router } from '@angular/router';

interface SkillWithExchangeStatus extends Skill {
  exchangeStatus?: 'available' | 'pending' | 'accepted' | 'completed' | 'in_progress' | 'rejected';
  exchangeMessage?: string;
  isUserReserved?: boolean;
  rejectionReason?: string;
}

@Component({
  selector: 'app-receiverskills',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatChipsModule
  ],
  templateUrl: './receiverskills.component.html',
  styleUrls: ['./receiverskills.component.css']
})
export class ReceiverskillsComponent implements OnInit {
  skills: SkillWithExchangeStatus[] = [];
  exchanges: ExchangeResponse[] = [];
  isLoading = true;
  error: string | null = null;
  producerNames: { [key: number]: string } = {};
  receiverId: number | null = null;
  livestreamSessions: { [skillId: number]: any } = {};

  constructor(
    private skillService: SkillService,
    private userService: UserService,
    private exchangeService: ExchangeService,
    private keycloakService: KeycloakService,
    private livestreamService: LivestreamService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      // Fetch receiver's ID
      const userProfile = await this.keycloakService.getUserProfile();
      if (!userProfile || !userProfile.id) {
        throw new Error('Profil utilisateur non disponible');
      }
      const keycloakId = userProfile.id;
      const user = await firstValueFrom(this.userService.getUserByKeycloakId(keycloakId));
      this.receiverId = user.id;

      // Load exchanges first to get user's reservation status
      await this.loadExchanges();
      
      // Then load skills and map with exchange status
      await this.loadSkills();
      
      // Check livestream sessions
      await this.checkLivestreamSessions();
    } catch (error: any) {
      this.error = 'Erreur lors de l\'initialisation';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur lors de l\'initialisation :', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadSkills(): Promise<void> {
    try {
      const rawSkills = await firstValueFrom(this.skillService.getAllSkills());
      
      // Filtrer les compétences pour exclure celles déjà présentes dans accepted-skills
      // Les compétences ACCEPTED, IN_PROGRESS, et COMPLETED sont visibles dans accepted-skills
      // On ne montre ici que les compétences disponibles, en attente, ou rejetées
      const availableSkills = rawSkills.filter(skill => {
        const userExchange = this.exchanges.find(ex => ex.skillId === skill.id && ex.receiverId === this.receiverId);
        
        if (userExchange) {
          // Exclure les compétences avec ces statuts (elles sont dans accepted-skills)
          const excludedStatuses = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
          return !excludedStatuses.includes(userExchange.status);
        }
        
        // Inclure toutes les compétences sans échange (disponibles pour réservation)
        return true;
      });
      
      this.skills = this.mapSkillsWithExchangeStatus(availableSkills);
      this.loadProducerNames();
    } catch (error: any) {
      this.error = 'Erreur lors du chargement des compétences';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur chargement compétences :', error);
      throw error;
    }
  }

  private mapSkillsWithExchangeStatus(rawSkills: Skill[]): SkillWithExchangeStatus[] {
    return rawSkills.map(skill => {
      const userExchange = this.exchanges.find(ex => ex.skillId === skill.id && ex.receiverId === this.receiverId);
      const skillWithStatus: SkillWithExchangeStatus = {
        ...skill,
        exchangeStatus: 'available',
        isUserReserved: false
      };

      if (userExchange) {
        switch (userExchange.status) {
          case 'PENDING':
            skillWithStatus.exchangeStatus = 'pending';
            skillWithStatus.exchangeMessage = 'Demande en attente de validation';
            skillWithStatus.isUserReserved = true;
            break;
          case 'ACCEPTED':
            skillWithStatus.exchangeStatus = 'accepted';
            skillWithStatus.exchangeMessage = 'Réservation acceptée';
            skillWithStatus.isUserReserved = true;
            break;
          case 'IN_PROGRESS':
            skillWithStatus.exchangeStatus = 'in_progress';
            skillWithStatus.exchangeMessage = 'Session en cours';
            skillWithStatus.isUserReserved = true;
            break;
          case 'COMPLETED':
            skillWithStatus.exchangeStatus = 'completed';
            skillWithStatus.exchangeMessage = 'Session terminée';
            skillWithStatus.isUserReserved = true;
            break;
          case 'REJECTED':
            skillWithStatus.exchangeStatus = 'rejected';
            skillWithStatus.exchangeMessage = 'Demande rejetée - Non disponible';
            skillWithStatus.rejectionReason = userExchange.rejectionReason;
            skillWithStatus.isUserReserved = true; // Marquer comme "réservé" pour empêcher nouvelle réservation
            break;
          default:
            skillWithStatus.exchangeStatus = 'available';
            skillWithStatus.isUserReserved = false;
        }
      }

      return skillWithStatus;
    });
  }

  private async loadExchanges(): Promise<void> {
    try {
      this.exchanges = await firstValueFrom(this.exchangeService.getUserExchanges());
      this.loadProducerNamesForExchanges();
    } catch (error: any) {
      console.warn('Erreur lors du chargement des échanges - continuons sans:', error);
      this.exchanges = []; // Continue without exchanges
    }
  }

  private async checkLivestreamSessions(): Promise<void> {
    try {
      // Only for accepted skills
      const acceptedSkills = this.skills.filter(skill => 
        skill.exchangeStatus === 'accepted' || skill.exchangeStatus === 'in_progress'
      );

      for (const skill of acceptedSkills) {
        try {
          const session = await firstValueFrom(
            this.livestreamService.getSessionBySkillId(skill.id)
          );
          
          if (session && (session.status === 'LIVE' || session.status === 'SCHEDULED')) {
            this.livestreamSessions[skill.id] = session;
          }
        } catch (error) {
          console.warn(`Erreur vérification session pour compétence ${skill.id}`, error);
        }
      }
    } catch (error) {
      console.error('Erreur vérification sessions:', error);
    }
  }

  private loadProducerNames(): void {
    this.skills.forEach(skill => {
      if (!this.producerNames[skill.userId]) {
        this.userService.getUserById(skill.userId).subscribe({
          next: (user) => {
            this.producerNames[skill.userId] = `${user.firstName} ${user.lastName}`;
          },
          error: () => {
            this.producerNames[skill.userId] = 'Utilisateur inconnu';
          }
        });
      }
    });
  }

  private loadProducerNamesForExchanges(): void {
    this.exchanges.forEach(exchange => {
      if (!this.producerNames[exchange.producerId]) {
        this.userService.getUserById(exchange.producerId).subscribe({
          next: (user) => {
            this.producerNames[exchange.producerId] = `${user.firstName} ${user.lastName}`;
          },
          error: () => {
            this.producerNames[exchange.producerId] = 'Utilisateur inconnu';
          }
        });
      }
    });
  }

  openProducerProfile(userId: number): void {
    this.userService.getUserById(userId).subscribe({
      next: (user) => {
        this.dialog.open(UserProfileDialogComponent, {
          width: '420px',
          maxWidth: '420px',
          panelClass: 'custom-dialog-container',
          data: user
        });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors du chargement du profil', 'Fermer', { duration: 3000 });
        console.error('Erreur récupération utilisateur :', err);
      }
    });
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  reserveSkill(skill: SkillWithExchangeStatus): void {
    const dialogRef = this.dialog.open(ReservationConfirmationComponent, {
      width: '450px',
      disableClose: true,
      panelClass: 'reservation-confirmation-dialog',
      data: {
        title: 'Confirmer la réservation',
        skillName: skill.name,
        producerName: this.getProducerName(skill.userId),
        price: skill.price,
        date: skill.streamingDate,
        time: skill.streamingTime,
        confirmText: 'Réserver maintenant',
        cancelText: 'Annuler'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.performReservation(skill);
      }
    });
  }

  private async performReservation(skill: SkillWithExchangeStatus): Promise<void> {
    if (!this.receiverId) {
      this.snackBar.open('Erreur: ID utilisateur non disponible', 'Fermer', { duration: 3000 });
      return;
    }

    if (skill.nbInscrits >= skill.availableQuantity) {
      this.snackBar.open('Cette compétence n\'a plus de places disponibles', 'Fermer', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    try {
      const request = {
        producerId: skill.userId,
        receiverId: this.receiverId,
        skillId: skill.id
      };

      const response = await firstValueFrom(this.exchangeService.createExchange(request));
      this.exchanges.push(response);
      
      // Update skill status locally
      skill.exchangeStatus = 'pending';
      skill.exchangeMessage = 'Demande en attente de validation';
      skill.isUserReserved = true;
      
      this.snackBar.open('Demande de réservation envoyée avec succès', 'Fermer', { duration: 3000 });
      
      // Reload skills to update inscription count
      await this.loadSkills();
    } catch (error: any) {
      const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'envoi de la demande';
      this.snackBar.open(errorMessage, 'Fermer', { duration: 3000 });
      console.error('Erreur de réservation :', error);
    } finally {
      this.isLoading = false;
    }
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'pending': return 'accent';
      case 'accepted': return 'primary';
      case 'in_progress': return 'primary';
      case 'completed': return 'primary';
      case 'rejected': return 'warn';
      case 'available': return '';
      default: return '';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'pending': return 'En attente';
      case 'accepted': return 'Accepté';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      case 'rejected': return 'Rejeté';
      case 'available': return 'Disponible';
      default: return '';
    }
  }

canReserve(skill: SkillWithExchangeStatus): boolean {
    // Une compétence peut être réservée si :
    // 1. Elle est disponible (pas d'échange en cours)
    // 2. Il reste des places disponibles
    // 3. L'utilisateur ne l'a pas déjà réservée
    // 4. Elle n'a pas été rejetée
    return skill.exchangeStatus === 'available' && 
           skill.nbInscrits < skill.availableQuantity && 
           !skill.isUserReserved;
  }


  showExchangeMessage(skill: SkillWithExchangeStatus): boolean {
    return !!(skill.exchangeMessage && skill.exchangeStatus !== 'available');
  }

  hasLivestreamSession(skill: SkillWithExchangeStatus): boolean {
    return !!this.livestreamSessions[skill.id];
  }
}