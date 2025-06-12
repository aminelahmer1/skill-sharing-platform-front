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

  constructor(
    private skillService: SkillService,
    private userService: UserService,
    private exchangeService: ExchangeService,
    private keycloakService: KeycloakService,
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

      // Load skills and exchanges concurrently
      await Promise.all([this.loadSkills(), this.loadExchanges()]);
    } catch (error: any) {
      this.error = 'Erreur lors de l’initialisation';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur lors de l’initialisation :', error);
    } finally {
      this.isLoading = false;
    }
  }

  private loadSkills(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.skillService.getAllSkills().subscribe({
        next: (skills) => {
          this.skills = skills;
          this.loadProducerNames();
          resolve();
        },
        error: (err: any) => {
          this.error = 'Erreur lors du chargement des compétences';
          this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
          console.error('Erreur chargement compétences :', err);
          reject(err);
        }
      });
    });
  }

  private loadExchanges(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.exchangeService.getUserExchanges().subscribe({
        next: (exchanges) => {
          this.exchanges = exchanges;
          this.loadProducerNamesForExchanges();
          resolve();
        },
        error: (err: any) => {
          this.error = 'Erreur lors du chargement des échanges';
          this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
          console.error('Erreur chargement échanges :', err);
          reject(err);
        }
      });
    });
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
        console.log('Données utilisateur récupérées :', user);
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

  async reserveSkill(skill: Skill): Promise<void> {
    if (!this.keycloakService.getRoles().includes('RECEIVER')) {
      this.snackBar.open('Seuls les receivers peuvent réserver des compétences', 'Fermer', { duration: 3000 });
      return;
    }

    try {
      const userProfile = await this.keycloakService.getUserProfile();
      if (!userProfile || !userProfile.id) {
        throw new Error('Profil utilisateur non disponible');
      }
      const keycloakId = userProfile.id;
      console.log('Keycloak ID:', keycloakId);

      if (skill.nbInscrits >= skill.availableQuantity) {
        this.snackBar.open('Cette compétence n\'a plus de places disponibles', 'Fermer', { duration: 3000 });
        return;
      }

      const user = await firstValueFrom(this.userService.getUserByKeycloakId(keycloakId));
      console.log('Utilisateur récupéré :', user);
      const receiverId = user.id;

      const existingExchange = this.exchanges.find(ex => ex.skillId === skill.id && ex.receiverId === receiverId);
      if (existingExchange) {
        this.snackBar.open(`Vous avez déjà demandé cette compétence (${this.getStatusLabel(existingExchange.status)})`, 'Fermer', { duration: 3000 });
        return;
      }

      const request = {
        producerId: skill.userId,
        receiverId: receiverId,
        skillId: skill.id
      };

      this.isLoading = true;
      this.exchangeService.createExchange(request).subscribe({
        next: (response) => {
          this.exchanges.push(response);
          this.isLoading = false;
          this.snackBar.open('Demande de réservation envoyée avec succès', 'Fermer', { duration: 3000 });
          this.loadSkills();
        },
        error: (err: any) => {
          this.isLoading = false;
          const errorMessage = err.message || 'Erreur lors de l\'envoi de la demande';
          this.snackBar.open(errorMessage, 'Fermer', { duration: 3000 });
          console.error('Erreur de réservation :', err);
        }
      });
    } catch (error: any) {
      this.isLoading = false;
      this.snackBar.open('Erreur lors de la récupération de l\'utilisateur', 'Fermer', { duration: 3000 });
      console.error('Erreur lors de la récupération de l\'utilisateur :', {
        message: error.message,
        status: error.status,
        error: error.error
      });
    }
  }
}