import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Session } from '../receiver-template/receiver-template.component';

@Component({
  selector: 'app-hero-receiver',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero-receiver.component.html',
  styleUrls: ['./hero-receiver.component.css']
})
export class HeroReceiverComponent {
  @Input() userProfile: any;
  @Input() sessions!: Session[];
}