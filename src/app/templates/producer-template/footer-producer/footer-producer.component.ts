import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer-producer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer-producer.component.html',
  styleUrls: ['./footer-producer.component.css']
})
export class FooterProducerComponent {
  currentYear = new Date().getFullYear();
}