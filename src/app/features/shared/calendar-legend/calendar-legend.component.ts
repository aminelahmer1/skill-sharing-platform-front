import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-calendar-legend',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="calendar-legend">
      <h3 class="legend-title">Légende</h3>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-color" style="background-color: #fdcb6e"></span>
          <span class="legend-label">En attente</span>
        </div>
        
        <div class="legend-item">
          <span class="legend-color" [style.background-color]="getAcceptedColor()"></span>
          <span class="legend-label">Accepté</span>
        </div>
        
        <div class="legend-item">
          <span class="legend-color" style="background-color: #a29bfe"></span>
          <span class="legend-label">Planifié</span>
        </div>
        
        <div class="legend-item">
          <span class="legend-color live" [style.background-color]="getLiveColor()"></span>
          <span class="legend-label">En direct</span>
        </div>
        
        <div class="legend-item">
          <span class="legend-color" style="background-color: #00b894"></span>
          <span class="legend-label">Terminé</span>
        </div>
        
        <div class="legend-item">
          <span class="legend-color" style="background-color: #636e72"></span>
          <span class="legend-label">Refusé/Annulé</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .calendar-legend {
      margin-top: 2rem;
      padding: 1rem;
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .legend-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--dark);
      margin-bottom: 1rem;
    }

    .legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .legend-color.live {
      animation: pulse 2s infinite;
    }

    .legend-label {
      font-size: 0.85rem;
      color: #636e72;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    @media (max-width: 768px) {
      .legend-items {
        flex-direction: column;
        gap: 0.5rem;
      }
    }
  `]
})
export class CalendarLegendComponent {
  @Input() userRole: 'PRODUCER' | 'RECEIVER' = 'RECEIVER';

  getAcceptedColor(): string {
    return this.userRole === 'PRODUCER' ? '#fd79a8' : '#74b9ff';
  }

  getLiveColor(): string {
    return this.userRole === 'PRODUCER' ? '#ff6b6b' : '#0984e3';
  }
}