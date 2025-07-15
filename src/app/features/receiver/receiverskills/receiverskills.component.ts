import { Component, OnInit } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { UserService } from '../../../core/services/User/user.service';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { Skill } from '../../../models/skill/skill.model';
import { MatDialog } from '@angular/material/dialog';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';
import { Router } from '@angular/router';

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
    MatSnackBarModule
  ],
  templateUrl: './receiverskills.component.html',
  styleUrls: ['./receiverskills.component.css']
})
export class ReceiverskillsComponent implements OnInit {
  skills: Skill[] = [];
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
    private snackBar: MatSnackBar,
    private router: Router
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

      // Load skills, exchanges and livestream sessions
      await Promise.all([
        this.loadSkills(), 
        this.loadExchanges()
      ]);
      
      // Check livestream sessions after skills are loaded
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
      this.skills = await firstValueFrom(this.skillService.getAllSkills());
      this.loadProducerNames();
    } catch (error: any) {
      this.error = 'Erreur lors du chargement des compétences';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur chargement compétences :', error);
      throw error;
    }
  }

  private async loadExchanges(): Promise<void> {
    try {
      this.exchanges = await firstValueFrom(this.exchangeService.getUserExchanges());
      this.loadProducerNamesForExchanges();
    } catch (error: any) {
      this.error = 'Erreur lors du chargement des échanges';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur chargement échanges :', error);
      throw error;
    }
  }

  private async checkLivestreamSessions(): Promise<void> {
  try {
    // Seulement pour les compétences où l'utilisateur est accepté
    const acceptedSkills = this.skills.filter(skill => 
      this.exchanges.some(ex => 
        ex.skillId === skill.id && 
        ex.receiverId === this.receiverId &&
        (ex.status === 'ACCEPTED' || ex.status === 'IN_PROGRESS')
      )
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
          width: '500px',
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

  getExchangeStatusForSkill(skillId: number): string | null {
    const exchange = this.exchanges.find(ex => ex.skillId === skillId && ex.receiverId === this.receiverId);
    return exchange ? this.getStatusLabel(exchange.status) : null;
  }

  private getStatusLabel(status: string): string {
    const statusLabels: { [key: string]: string } = {
      PENDING: 'En attente',
      ACCEPTED: 'Accepté',
      WAITING: 'En attente de session',
      IN_PROGRESS: 'En cours',
      COMPLETED: 'Terminé',
      REJECTED: 'Refusé',
      CANCELLED: 'Annulé'
    };
    return statusLabels[status] || status;
  }

  canJoinLivestream(skillId: number): boolean {
  if (!this.receiverId) return false;
  
  // Vérifie que l'utilisateur est bien un receiver accepté
  const isAcceptedReceiver = this.exchanges.some(ex => 
    ex.skillId === skillId && 
    ex.receiverId === this.receiverId && 
    (ex.status === 'ACCEPTED' || ex.status === 'IN_PROGRESS')
  );
  
  const session = this.livestreamSessions[skillId];
  return isAcceptedReceiver && !!session && session.status === 'LIVE';
}

  async joinLivestream(skill: Skill): Promise<void> {
    if (!this.receiverId) {
      this.snackBar.open('Erreur: ID utilisateur non disponible', 'Fermer', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    try {
      const session = this.livestreamSessions[skill.id];
      if (!session) {
        throw new Error('Aucune session active trouvée');
      }

      // Obtenir le token pour rejoindre la session
      const token = await firstValueFrom(
        this.livestreamService.joinSession(session.id)
      );

      if (!token) {
        throw new Error('Échec de la récupération du token');
      }

      // Rediriger vers le composant de livestream
      this.router.navigate(['/receiver/livestream', session.id]);
      
    } catch (error: any) {
      console.error('Erreur lors de la tentative de rejoindre le livestream:', error);
      this.snackBar.open(
        error.message || 'Erreur lors de la connexion au livestream', 
        'Fermer', 
        { duration: 3000 }
      );
    } finally {
      this.isLoading = false;
    }
  }

  async reserveSkill(skill: Skill): Promise<void> {
    if (!this.keycloakService.getRoles().includes('RECEIVER')) {
      this.snackBar.open('Seuls les receivers peuvent réserver des compétences', 'Fermer', { duration: 3000 });
      return;
    }

    if (!this.receiverId) {
      this.snackBar.open('Erreur: ID utilisateur non disponible', 'Fermer', { duration: 3000 });
      return;
    }

    if (skill.nbInscrits >= skill.availableQuantity) {
      this.snackBar.open('Cette compétence n\'a plus de places disponibles', 'Fermer', { duration: 3000 });
      return;
    }

    const existingExchange = this.exchanges.find(ex => ex.skillId === skill.id && ex.receiverId === this.receiverId);
    if (existingExchange) {
      this.snackBar.open(`Vous avez déjà demandé cette compétence (${this.getStatusLabel(existingExchange.status)})`, 'Fermer', { duration: 3000 });
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
      this.snackBar.open('Demande de réservation envoyée avec succès', 'Fermer', { duration: 3000 });
      
      // Recharger les compétences pour mettre à jour le nombre d'inscrits
      await this.loadSkills();
    } catch (error: any) {
      const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'envoi de la demande';
      this.snackBar.open(errorMessage, 'Fermer', { duration: 3000 });
      console.error('Erreur de réservation :', error);
    } finally {
      this.isLoading = false;
    }
  }
}