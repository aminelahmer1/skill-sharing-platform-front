import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Session } from '../producer-template/producer-template.component';

@Component({
  selector: 'app-hero-producer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero-producer.component.html',
  styleUrls: ['./hero-producer.component.css']
})
export class HeroProducerComponent {
  @Input() userProfile: any;
  @Input() sessions!: Session[];
}