import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExchangeService } from '../../../core/services/Exchange/exchange.service';
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
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';

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
    MatButtonModule
  ],
  templateUrl: './accepted-skills.component.html',
  styleUrls: ['./accepted-skills.component.css']
})
export class AcceptedSkillsComponent implements OnInit {
  skills: SkillResponse[] = [];
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
    this.exchangeService.getAcceptedSkills().subscribe({
      next: (skills) => {
        this.skills = skills;
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
      this.livestreamService.getSession(skill.id).subscribe({
        next: (session: LivestreamSession) => {
          if (session && session.status === 'LIVE') {
            this.sessions[skill.id] = session;
          }
        },
        error: () => {}
      });
    });
  }

  openProducerProfile(userId: number): void {
    this.userService.getUserById(userId).subscribe({
      next: (user) => this.dialog.open(UserProfileDialogComponent, { width: '500px', data: user }),
      error: (err) => {
        this.snackBar.open('Erreur lors du chargement du profil', 'Fermer', { duration: 3000 });
        console.error('Erreur récupération utilisateur :', err);
      }
    });
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  joinLivestream(skillId: number): void {
    const session = this.sessions[skillId];
    if (session && session.status === 'LIVE') {
      this.livestreamService.joinSession(session.id).subscribe({
        next: (joinToken) => {
          this.router.navigate(['/receiver/livestream', session.id], { state: { joinToken, roomName: session.roomName } });
        },
        error: () => this.snackBar.open('Erreur lors de la tentative de rejoindre la session', 'Fermer', { duration: 3000 })
      });
    } else {
      this.snackBar.open('La session n\'est pas en direct', 'Fermer', { duration: 3000 });
    }
  }
}