import { Component, ElementRef, ViewChild, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { KeycloakService } from '../../../core/services/keycloak.service';

interface CalendarEvent {
  title: string;
  date: string;
  time: string;
  duration: number;
  type: 'producer' | 'receiver';
}

interface CalendarDay {
  number: number;
  isToday: boolean;
  isEmpty: boolean;
  date?: Date;
  events: CalendarEvent[];
}

interface ChatMessage {
  sender: string;
  content: string;
  isProducer: boolean;
}

@Component({
  selector: 'app-main-template',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './main-template.component.html',
  styleUrls: ['./main-template.component.css'],
})
export class MainTemplateComponent implements OnInit {
  @ViewChild('calendarSection') calendarSection!: ElementRef;

  private keycloakService = inject(KeycloakService);
  private router = inject(Router);

  isMenuActive = false;
  loginButtonText = 'Connexion';
  registerButtonText = "S'inscrire";
  isLoading = true;
  error: string | null = null;

  currentDate = new Date(2025, 3, 22);
  currentMonth = this.currentDate.getMonth();
  currentYear = this.currentDate.getFullYear();
  today = new Date(2025, 3, 22);
  monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  calendarDays: CalendarDay[] = [];
  calendarTitle = '';
  showCalendarError = false;
  events: CalendarEvent[] = [
    { title: 'Cours de JavaScript', date: '2025-04-15', time: '14:00', duration: 60, type: 'producer' },
    { title: 'Apprendre le design', date: '2025-04-18', time: '10:30', duration: 45, type: 'receiver' },
    { title: 'Session de mentorat', date: '2025-04-20', time: '16:00', duration: 90, type: 'producer' },
    { title: 'Cours de français', date: '2025-04-22', time: '09:00', duration: 60, type: 'receiver' },
    { title: 'Atelier React', date: '2025-04-25', time: '18:00', duration: 120, type: 'producer' },
  ];

  chatMessages: ChatMessage[] = [];
  chatInput = '';
  activeInfoText: string | null = null;

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const isAuthenticated = await this.keycloakService.isAuthenticated();
      if (isAuthenticated) {
        const roles = this.keycloakService.getRoles();
        if (roles.includes('PRODUCER')) {
          await this.router.navigate(['/producer']);
        } else if (roles.includes('RECEIVER')) {
          await this.router.navigate(['/receiver']);
        }
      }
      this.renderCalendar();
      this.initializeChat();
    } catch (error) {
      console.error('MainTemplate init error:', error);
      this.error = 'Erreur lors du chargement. Veuillez réessayer.';
    } finally {
      this.isLoading = false;
    }
  }

  toggleMenu(): void {
    this.isMenuActive = !this.isMenuActive;
  }

  scrollToCalendar(event: MouseEvent): void {
    event.preventDefault();
    this.calendarSection.nativeElement.scrollIntoView({ behavior: 'smooth' });
  }

  onLoginHover(): void {
    this.loginButtonText = '🔑 Connexion';
  }

  onLoginHoverOut(): void {
    this.loginButtonText = 'Connexion';
  }

  async login(): Promise<void> {
    try {
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Login navigation error:', error);
      this.error = 'Erreur lors de la redirection. Veuillez réessayer.';
    }
  }

  onRegisterHover(): void {
    this.registerButtonText = "🚀 S'inscrire";
  }

  onRegisterHoverOut(): void {
    this.registerButtonText = "S'inscrire";
  }

  async register(): Promise<void> {
    try {
      await this.router.navigate(['/register']);
    } catch (error) {
      console.error('Register navigation error:', error);
      this.error = 'Erreur lors de la redirection. Veuillez réessayer.';
    }
  }

  private getDaysInMonth(): number {
    return new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
  }

  private getFirstDayOfMonth(): number {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1;
  }

  private getEventsForDay(day: number): CalendarEvent[] {
    return this.events.filter((event) => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === this.currentMonth &&
        eventDate.getFullYear() === this.currentYear
      );
    });
  }

  renderCalendar(): void {
    try {
      this.calendarDays = [];
      const daysInMonth = this.getDaysInMonth();
      const startingDay = this.getFirstDayOfMonth();

      for (let i = 0; i < startingDay; i++) {
        this.calendarDays.push({ number: 0, isToday: false, isEmpty: true, events: [] });
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const isToday =
          day === this.today.getDate() &&
          this.currentMonth === this.today.getMonth() &&
          this.currentYear === this.currentYear;
        const date = new Date(this.currentYear, this.currentMonth, day);
        const events = this.getEventsForDay(day);
        this.calendarDays.push({ number: day, isToday, isEmpty: false, date, events });
      }

      this.calendarTitle = `${this.monthNames[this.currentMonth]} ${this.currentYear}`;
      this.showCalendarError = false;
    } catch (error) {
      console.error('Error rendering calendar:', error);
      this.showCalendarError = true;
    }
  }

  prevMonth(): void {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.renderCalendar();
  }

  nextMonth(): void {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.renderCalendar();
  }

  initializeChat(): void {
    setTimeout(() => {
      this.chatMessages.push({
        sender: 'Jean',
        content: "N'hésitez pas à poser des questions dans le chat!",
        isProducer: true,
      });
    }, 2000);
  }

  sendMessage(): void {
    if (!this.chatInput.trim()) return;

    this.chatMessages.push({
      sender: 'Vous',
      content: this.chatInput.trim(),
      isProducer: false,
    });

    this.chatInput = '';

    setTimeout(() => {
      this.chatMessages.push({
        sender: 'Jean',
        content: 'Merci pour votre message! Je vais y répondre dans la session.',
        isProducer: true,
      });
    }, 1000);
  }

  onChatKeypress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.sendMessage();
    }
  }

  toggleInfoText(event: MouseEvent, id: string): void {
    event.preventDefault();
    this.activeInfoText = this.activeInfoText === id ? null : id;
  }
}