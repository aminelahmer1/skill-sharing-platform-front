
import { Component, OnInit } from '@angular/core';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { UserService } from '../../../core/services/User/user.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatDialogContent, MatDialogActions, MatDialogRef } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface PendingRequest {
  id: number;
  skillId: number;
  skillName: string;
  receiverName: string;
  createdAt: string;
  canAccept: boolean;
}

interface SkillResponse {
  id: number;
  name: string;
  nbInscrits: number;
  availableQuantity: number;
}

@Component({
  selector: 'app-reject-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatDialogContent,
    MatDialogActions
  ],
  template: `
    <h2 mat-dialog-title>Refuser la demande</h2>
    <mat-form-field appearance="fill">
      <mat-label>Raison du refus (facultatif)</mat-label>
      <textarea matInput [(ngModel)]="reason" placeholder="Entrez la raison du refus"></textarea>
    </mat-form-field>
    <mat-dialog-actions>
      <button mat-button (click)="onCancel()">Annuler</button>
      <button mat-button color="warn" (click)="onReject()">Refuser</button>
    </mat-dialog-actions>
  `
})
export class RejectDialogComponent {
  reason: string = '';

  constructor(private dialogRef: MatDialogRef<RejectDialogComponent>) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onReject(): void {
    console.log('Reason from dialog:', this.reason); // Debug log
    this.dialogRef.close(this.reason);
  }
}

@Component({
  selector: 'app-producer-requests',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTableModule,
    MatTooltipModule
  ],
  templateUrl: './producer-requests.component.html',
  styleUrls: ['./producer-requests.component.css']
})
export class ProducerRequestsComponent implements OnInit {
  pendingRequestsBySkill: { [skillName: string]: PendingRequest[] } = {};
  isLoading = true;
  error: string | null = null;
  displayedColumns: string[] = ['receiverName', 'createdAt', 'actions'];

  constructor(
    private exchangeService: ExchangeService,
    private userService: UserService,
    private keycloakService: KeycloakService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadPendingRequests();
  }

  loadPendingRequests(): void {
    this.isLoading = true;
    this.pendingRequestsBySkill = {};
    this.exchangeService.getPendingExchangesForProducer().subscribe({
      next: (exchanges: ExchangeResponse[]) => {
        const seenIds = new Set<number>();
        const pendingExchanges = exchanges
          .filter(e => e.status === 'PENDING' && !seenIds.has(e.id))
          .map(e => { seenIds.add(e.id); return e; });
        
        console.log('Raw Exchanges:', exchanges);
        console.log('Filtered and Deduplicated Pending Exchanges:', pendingExchanges);

        if (exchanges.length !== pendingExchanges.length) {
          console.warn('Duplicates or non-PENDING exchanges detected:', {
            originalCount: exchanges.length,
            filteredCount: pendingExchanges.length,
            duplicateIds: exchanges.filter(e => seenIds.has(e.id) && !pendingExchanges.includes(e)).map(e => e.id)
          });
        }

        if (pendingExchanges.length === 0) {
          this.isLoading = false;
          return;
        }

        const uniqueSkillIds = [...new Set(pendingExchanges.map(e => e.skillIdField))];
        const skillObservables: Observable<SkillResponse>[] = uniqueSkillIds.map(skillId =>
          this.exchangeService.getSkillById(skillId).pipe(
            catchError(() => of({ id: skillId, name: '', nbInscrits: 0, availableQuantity: 0 }))
          )
        );

        forkJoin(skillObservables).subscribe(skills => {
          const capacityMap = new Map<number, SkillResponse>(
            skills.map(s => [s.id, s])
          );

          this.pendingRequestsBySkill = pendingExchanges.reduce((acc, exchange) => {
            const skill = capacityMap.get(exchange.skillIdField) || { id: exchange.skillIdField, name: exchange.skillName, nbInscrits: 0, availableQuantity: 0 };
            const request: PendingRequest = {
              id: exchange.id,
              skillId: exchange.skillIdField,
              skillName: exchange.skillName,
              receiverName: exchange.receiverName,
              createdAt: exchange.createdAt,
              canAccept: skill.nbInscrits < skill.availableQuantity
            };
            if (!acc[exchange.skillName]) {
              acc[exchange.skillName] = [];
            }
            acc[exchange.skillName].push(request);
            return acc;
          }, {} as { [skillName: string]: PendingRequest[] });

          console.log('Pending Requests By Skill:', this.pendingRequestsBySkill);
          this.isLoading = false;
        });
      },
      error: (err: any) => {
        this.error = 'Erreur lors du chargement des demandes';
        this.isLoading = false;
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
        console.error('Erreur :', err);
      }
    });
  }

  acceptRequest(exchangeId: number): void {
    this.exchangeService.acceptExchange(exchangeId).subscribe({
      next: () => {
        this.snackBar.open('Demande acceptée avec succès', 'Fermer', { duration: 3000 });
        this.loadPendingRequests();
      },
      error: (err: any) => {
        const errorMessage = err.error?.error || 'Erreur lors de l\'acceptation de la demande';
        this.snackBar.open(errorMessage, 'Fermer', { duration: 3000 });
        console.error('Erreur :', err);
      }
    });
  }

  rejectRequest(exchangeId: number): void {
    const dialogRef = this.dialog.open(RejectDialogComponent);
    dialogRef.afterClosed().subscribe(reason => {
      console.log('Reason received:', reason); // Debug log
      if (reason !== undefined) {
        this.exchangeService.rejectExchange(exchangeId, reason).subscribe({
          next: () => {
            this.snackBar.open('Demande refusée avec succès', 'Fermer', { duration: 3000 });
            this.loadPendingRequests();
          },
          error: (err: any) => {
            this.snackBar.open('Erreur lors du refus de la demande', 'Fermer', { duration: 3000 });
            console.error('Erreur :', err);
          }
        });
      }
    });
  }

  objectKeys(obj: { [key: string]: any }): string[] {
    return Object.keys(obj);
  }
}
