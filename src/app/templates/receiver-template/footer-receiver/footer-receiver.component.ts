import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer-receiver',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer-receiver.component.html',
  styleUrls: ['./footer-receiver.component.css']
})
export class FooterReceiverComponent {
  currentYear = new Date().getFullYear();
}