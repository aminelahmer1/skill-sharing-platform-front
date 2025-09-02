
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
import { ReceiverDetailsDialogComponent } from '../receiver-details-dialog/receiver-details-dialog.component';

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
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FormsModule
  ],
  template: `
    <div class="reject-dialog-container">
      <div class="dialog-header">
        <mat-icon class="warning-icon">warning</mat-icon>
        <h2 mat-dialog-title class="dialog-title">Refuser la demande</h2>
        <p class="dialog-subtitle">Voulez-vous préciser une raison pour ce refus ?</p>
      </div>

      <mat-dialog-content class="dialog-content">
        <mat-form-field appearance="outline" class="reason-field">
          <mat-label>Raison du refus</mat-label>
          <textarea 
            matInput 
            [(ngModel)]="reason" 
            placeholder="Expliquez brièvement pourquoi vous refusez cette demande..."
            rows="4"
            maxlength="500">
          </textarea>
          <mat-hint align="end">{{reason.length}}/500</mat-hint>
        </mat-form-field>
        
        <div class="info-note">
          <mat-icon>info</mat-icon>
          <span>Cette raison sera communiquée au demandeur pour l'aider à comprendre votre décision.</span>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions class="dialog-actions">
        <button 
          mat-button 
          class="cancel-btn" 
          (click)="onCancel()"
          type="button">
          <mat-icon>close</mat-icon>
          Annuler
        </button>
        
        <button 
          mat-raised-button 
          class="reject-btn" 
          color="warn" 
          (click)="onReject()"
          type="button">
          <mat-icon>block</mat-icon>
          Refuser la demande
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .reject-dialog-container {
      width: 100%;
      max-width: 500px;
      margin: 0 auto;
    }

    .dialog-header {
      text-align: center;
      padding: 20px 0 16px 0;
      border-bottom: 1px solid #f0f0f0;
      margin-bottom: 20px;
    }

    .warning-icon {
      font-size: 48px !important;
      width: 48px !important;
      height: 48px !important;
      color: #ff9800 !important;
      margin-bottom: 12px;
      animation: pulse 2s infinite;
    }

    .dialog-title {
      margin: 0 0 8px 0 !important;
      font-size: 1.5rem !important;
      font-weight: 600 !important;
      color: #2d3436 !important;
      text-align: center !important;
    }

    .dialog-subtitle {
      margin: 0;
      color: #636e72;
      font-size: 0.95rem;
      line-height: 1.4;
    }

    .dialog-content {
      padding: 0 24px !important;
      text-align: left;
    }

    .reason-field {
      width: 100%;
      margin-bottom: 16px;
    }

    .reason-field textarea {
      resize: vertical;
      min-height: 80px;
    }

    .info-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background-color: #e3f2fd;
      padding: 12px;
      border-radius: 8px;
      border-left: 4px solid #2196f3;
      margin-top: 16px;
    }

    .info-note mat-icon {
      color: #2196f3 !important;
      font-size: 20px !important;
      width: 20px !important;
      height: 20px !important;
      margin-top: 2px;
    }

    .info-note span {
      color: #1976d2;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .dialog-actions {
      justify-content: center !important;
      gap: 16px !important;
      padding: 24px !important;
      margin: 0 !important;
      border-top: 1px solid #f0f0f0;
    }

    .cancel-btn,
    .reject-btn {
      min-width: 140px !important;
      height: 44px !important;
      border-radius: 12px !important;
      font-weight: 600 !important;
      text-transform: none !important;
      transition: all 0.3s ease !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .cancel-btn {
      background-color: #f8f9fa !important;
      color: #6c757d !important;
      border: 2px solid #dee2e6 !important;
    }

    .cancel-btn:hover {
      background-color: #e9ecef !important;
      color: #495057 !important;
      border-color: #adb5bd !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    }

    .cancel-btn mat-icon {
      color: #6c757d !important;
    }

    .reject-btn {
      background-color: #d63031 !important;
      color: white !important;
      border: 2px solid #d63031 !important;
    }

    .reject-btn:hover {
      background-color: #c62828 !important;
      border-color: #c62828 !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 6px 20px rgba(214, 48, 49, 0.4) !important;
    }

    .reject-btn mat-icon {
      color: white !important;
    }

    @keyframes pulse {
      0%, 100% { 
        transform: scale(1);
        opacity: 1;
      }
      50% { 
        transform: scale(1.05);
        opacity: 0.8;
      }
    }

    @media (max-width: 500px) {
      .dialog-header {
        padding: 16px 0 12px 0;
      }

      .warning-icon {
        font-size: 40px !important;
        width: 40px !important;
        height: 40px !important;
      }

      .dialog-title {
        font-size: 1.3rem !important;
      }

      .dialog-actions {
        flex-direction: column !important;
        gap: 12px !important;
        padding: 20px !important;
      }

      .cancel-btn,
      .reject-btn {
        width: 100% !important;
        min-width: auto !important;
      }

      .dialog-content {
        padding: 0 20px !important;
      }
    }
  `]
})
export class RejectDialogComponent {
  reason: string = '';

  constructor(
    private dialogRef: MatDialogRef<RejectDialogComponent>
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onReject(): void {
    this.dialogRef.close(this.reason.trim());
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

  showReceiverDetails(receiverId: number): void {
  this.userService.getUserById(receiverId).subscribe({
    next: (receiver) => {
      this.dialog.open(ReceiverDetailsDialogComponent, {
        width: '450px',
        data: { receiver }
      });
    },
    error: (err) => {
      this.snackBar.open('Erreur lors du chargement des détails', 'Fermer', { duration: 3000 });
    }
  });
}
}
