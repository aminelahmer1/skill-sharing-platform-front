import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { UserService } from '../../../core/services/User/user.service';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';
import { SkillResponse } from '../../../core/services/Exchange/exchange.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { firstValueFrom } from 'rxjs';

interface SkillWithExchange extends SkillResponse {
  exchangeStatus?: string;
  exchangeId?: number;
}

@Component({
  selector: 'app-accepted-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    MatChipsModule
  ],
  templateUrl: './accepted-skills.component.html',
  styleUrls: ['./accepted-skills.component.css']
})
export class AcceptedSkillsComponent implements OnInit {
  skills: SkillWithExchange[] = [];
  sessions: { [skillId: number]: LivestreamSession } = {};
  isLoading = true;
  error: string | null = null;
  producerNames: { [key: number]: string } = {};

  constructor(
    private exchangeService: ExchangeService,
    private userService: UserService,
    private livestreamService: LivestreamService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadAcceptedSkills();
  }

  loadAcceptedSkills(): void {
    this.isLoading = true;
    this.error = null;
    
    // First get all user exchanges to map exchange status to skills
    this.exchangeService.getUserExchanges().subscribe({
      next: (exchanges) => {
        // Then get accepted skills
        this.exchangeService.getAcceptedSkills().subscribe({
          next: (skills) => {
            // Map exchange status to skills
            this.skills = skills.map(skill => {
              const exchange = exchanges.find(ex => ex.skillId === skill.id);
              return {
                ...skill,
                exchangeStatus: exchange?.status,
                exchangeId: exchange?.id
              };
            });
            
            this.loadProducerNames();
            this.checkActiveSessions();
            this.isLoading = false;
          },
          error: (err) => {
            this.error = 'Erreur lors du chargement des compétences acceptées';
            this.isLoading = false;
            this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
            console.error('Erreur chargement compétences acceptées :', err);
          }
        });
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des échanges';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
        console.error('Erreur chargement échanges :', err);
      }
    });
  }

  loadProducerNames(): void {
    this.skills.forEach(skill => {
      if (!this.producerNames[skill.userId]) {
        this.userService.getUserById(skill.userId).subscribe({
          next: (user) => this.producerNames[skill.userId] = `${user.firstName} ${user.lastName}`,
          error: () => this.producerNames[skill.userId] = 'Utilisateur inconnu'
        });
      }
    });
  }

  checkActiveSessions(): void {
    this.skills.forEach(skill => {
      this.livestreamService.getSessionBySkillId(skill.id).subscribe({
        next: (session: LivestreamSession | null) => {
          if (session && (session.status === 'LIVE' || session.status === 'SCHEDULED')) {
            this.sessions[skill.id] = session;
            console.log(`Session trouvée pour skill ${skill.id}:`, session);
          }
        },
        error: (err) => {
          console.warn(`Erreur vérification session pour compétence ${skill.id}`, err);
        }
      });
    });
  }

  openProducerProfile(userId: number): void {
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
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  /**
   * Rejoindre un livestream - méthode mise à jour comme dans receiverskills
   */
  async joinLivestreamSession(skill: SkillWithExchange): Promise<void> {
    // Vérifier qu'il y a bien une session active pour cette compétence
    const session = this.sessions[skill.id];
    if (!session) {
      this.snackBar.open('Aucune session active trouvée pour cette compétence', 'Fermer', { duration: 3000 });
      return;
    }

    // Vérifier que l'utilisateur est autorisé à rejoindre
    if (!this.canJoinLivestream(skill)) {
      this.snackBar.open('Vous n\'êtes pas autorisé à rejoindre cette session', 'Fermer', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    
    try {
      console.log(`Tentative de rejoindre la session ${session.id} pour la compétence ${skill.id}`);
      
      // Obtenir le token pour rejoindre la session
      const joinToken = await firstValueFrom(
        this.livestreamService.joinSession(session.id)
      );

      if (!joinToken) {
        throw new Error('Échec de la récupération du token de session');
      }

      console.log('Token de session obtenu avec succès');

      // Récupérer les détails de la session pour obtenir le nom de la room
      const sessionDetails = await firstValueFrom(
        this.livestreamService.getSession(session.id)
      );

      if (!sessionDetails) {
        throw new Error('Impossible de récupérer les détails de la session');
      }

      console.log('Détails de session récupérés:', sessionDetails);

      // Naviguer vers le composant livestream avec les bonnes données
      this.router.navigate(['/receiver/livestream', session.id], {
        state: { 
          sessionToken: joinToken, 
          roomName: sessionDetails.roomName 
        }
      });

      this.snackBar.open('Connexion au livestream en cours...', 'Fermer', { duration: 2000 });
      
    } catch (error: any) {
      console.error('Erreur lors de la tentative de rejoindre le livestream:', error);
      
      let errorMessage = 'Erreur lors de la connexion au livestream';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
      
      this.snackBar.open(errorMessage, 'Fermer', { duration: 5000 });
    } finally {
      this.isLoading = false;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'PENDING': return 'accent';
      case 'ACCEPTED': return 'primary';
      case 'IN_PROGRESS': return 'primary';
      case 'COMPLETED': return 'primary';
      case 'REJECTED': return 'warn';
      case 'CANCELLED': return 'warn';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'ACCEPTED': return 'Accepté';
      case 'IN_PROGRESS': return 'En cours';
      case 'COMPLETED': return 'Terminé';
      case 'REJECTED': return 'Rejeté';
      case 'CANCELLED': return 'Annulé';
      default: return status;
    }
  }

  canJoinLivestream(skill: SkillWithExchange): boolean {
    const session = this.sessions[skill.id];
    return session && 
           (session.status === 'LIVE' || session.status === 'SCHEDULED') &&
           (skill.exchangeStatus === 'ACCEPTED' || 
            skill.exchangeStatus === 'IN_PROGRESS' || 
            skill.exchangeStatus === 'SCHEDULED');
  }
}