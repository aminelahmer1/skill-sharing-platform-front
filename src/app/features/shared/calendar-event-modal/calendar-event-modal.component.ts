import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent } from '../../../models/calendar/calendar-event';
import { Router } from '@angular/router';

@Component({
  selector: 'app-calendar-event-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" (click)="close.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>{{ event.skillName }}</h2>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="event-detail">
            <span class="label">📅 Date:</span>
            <span>{{ event.streamingDate | date:'dd/MM/yyyy' }}</span>
          </div>
          
          <div class="event-detail">
            <span class="label">⏰ Heure:</span>
            <span>{{ event.streamingTime }}</span>
          </div>
          
          <div class="event-detail">
            <span class="label">📊 Statut:</span>
            <span class="status-badge" [style.background-color]="event.color">
              {{ getStatusLabel(event.status) }}
            </span>
          </div>
          
          <div class="event-detail" *ngIf="userRole === 'PRODUCER'">
            <span class="label">👤 Apprenant:</span>
            <span>{{ event.receiverName }}</span>
          </div>
          
          <div class="event-detail" *ngIf="userRole === 'RECEIVER'">
            <span class="label">👨‍🏫 Formateur:</span>
            <span>{{ event.producerName }}</span>
          </div>
          
          <div class="event-detail" *ngIf="event.categoryName">
            <span class="label">📚 Catégorie:</span>
            <span>{{ event.categoryName }}</span>
          </div>
          
          <div class="event-detail" *ngIf="event.price">
            <span class="label">💰 Prix:</span>
            <span>{{ event.price }} €</span>
          </div>
          
          <div class="event-description" *ngIf="event.skillDescription">
            <p class="label">Description:</p>
            <p>{{ event.skillDescription }}</p>
          </div>
        </div>
        
        <div class="modal-footer">
          <button 
            class="btn btn-primary"
            *ngIf="event.status === 'IN_PROGRESS'"
            (click)="joinLivestream()">
            🔴 Rejoindre le Live
          </button>
          
          <button 
            class="btn btn-outline"
            *ngIf="event.status === 'SCHEDULED' && userRole === 'PRODUCER'"
            (click)="startLivestream()">
            Démarrer la session
          </button>
          
          <button class="btn btn-secondary" (click)="close.emit()">
            Fermer
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.3s ease-out;
    }

    .modal-content {
      background: white;
      border-radius: 15px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h2 {
      margin: 0;
      color: var(--dark);
      font-size: 1.5rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #999;
      transition: all 0.3s ease;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }

    .close-btn:hover {
      background: #f5f5f5;
      color: var(--danger);
      transform: rotate(90deg);
    }

    .modal-body {
      padding: 1.5rem;
    }

    .event-detail {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .label {
      font-weight: 600;
      color: var(--dark);
      min-width: 120px;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 50px;
      color: white;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .event-description {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .event-description p {
      margin: 0.5rem 0;
      line-height: 1.6;
      color: #636e72;
    }

    .modal-footer {
      padding: 1.5rem;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      border: none;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-dark);
      transform: translateY(-2px);
    }

    .btn-outline {
      background: transparent;
      color: var(--primary);
      border: 2px solid var(--primary);
    }

    .btn-outline:hover {
      background: var(--primary);
      color: white;
    }

    .btn-secondary {
      background: #e0e0e0;
      color: var(--dark);
    }

    .btn-secondary:hover {
      background: #d0d0d0;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `]
})
export class CalendarEventModalComponent {
  @Input() event!: CalendarEvent;
  @Input() userRole: 'PRODUCER' | 'RECEIVER' = 'RECEIVER';
  @Output() close = new EventEmitter<void>();

  constructor(private router: Router) {}

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'PENDING': 'En attente',
      'ACCEPTED': 'Accepté',
      'SCHEDULED': 'Planifié',
      'IN_PROGRESS': 'En direct',
      'COMPLETED': 'Terminé',
      'REJECTED': 'Refusé',
      'CANCELLED': 'Annulé'
    };
    return labels[status] || status;
  }

  joinLivestream(): void {
    const route = this.userRole === 'PRODUCER' 
      ? '/producer/livestream' 
      : '/receiver/livestream';
    this.router.navigate([route, this.event.id]);
    this.close.emit();
  }

  startLivestream(): void {
    this.router.navigate(['/producer/livestream', this.event.skillId], {
      queryParams: { immediate: true }
    });
    this.close.emit();
  }
}