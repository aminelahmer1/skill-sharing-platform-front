import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, map, catchError, of, throwError, forkJoin } from 'rxjs';
import { CalendarEvent, CalendarView, CalendarDay, CalendarWeek, CalendarMonth, CalendarFilter } from '../../../models/calendar/calendar-event';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { LivestreamService } from '../LiveStream/livestream.service';

// Interface étendue pour les skills sans échanges
interface ExtendedCalendarEvent extends CalendarEvent {
  isSkillOnly?: boolean;
  hasNoExchange?: boolean;
  availableQuantity?: number;
  nbInscrits?: number;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private apiUrl = 'http://localhost:8822/api/v1/exchanges/calendar';
  private skillsApiUrl = 'http://localhost:8822/api/v1/skills';
  
  private currentViewSubject = new BehaviorSubject<CalendarView>({
    type: 'month',
    startDate: new Date(),
    endDate: new Date(),
    currentDate: new Date()
  });
  
  private eventsSubject = new BehaviorSubject<ExtendedCalendarEvent[]>([]);

  currentView$ = this.currentViewSubject.asObservable();
  events$ = this.eventsSubject.asObservable();

  constructor(private http: HttpClient,private livestreamService: LivestreamService) {
    console.log('CalendarService initialized');
    this.initializeCalendar();
  }

  private initializeCalendar(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    this.updateView({
      type: 'month',
      startDate: startOfMonth,
      endDate: endOfMonth,
      currentDate: now
    });
  }

  // Récupérer les compétences du producteur
  private getProducerSkills(): Observable<any[]> {
    const token = this.getAuthToken();
    const headers = new HttpHeaders().set('Authorization', token);
    
    return this.http.get<any[]>(`${this.skillsApiUrl}/my-skills`, { headers })
      .pipe(
        map(skills => {
          console.log(`Fetched ${skills?.length || 0} producer skills`);
          return skills || [];
        }),
        catchError(error => {
          console.error('Error fetching producer skills:', error);
          return of([]);
        })
      );
  }

  // Récupérer TOUS les événements pour un producteur (échanges + skills sans échanges)
  getProducerEvents(startDate: Date, endDate: Date): Observable<ExtendedCalendarEvent[]> {
    const params = new HttpParams()
      .set('startDate', this.formatDate(startDate))
      .set('endDate', this.formatDate(endDate));

    console.log(`Fetching producer events and skills from ${this.formatDate(startDate)} to ${this.formatDate(endDate)}`);

    // Récupérer les échanges ET les skills en parallèle
    return forkJoin({
      exchanges: this.http.get<CalendarEvent[]>(`${this.apiUrl}/events/producer`, { params })
        .pipe(
          catchError(error => {
            console.error('Error fetching exchanges:', error);
            return of([]);
          })
        ),
      skills: this.getProducerSkills()
    }).pipe(
      map(({ exchanges, skills }) => {
        console.log(`Processing ${exchanges.length} exchanges and ${skills.length} skills`);
        
        // Traiter les échanges normalement
        const processedExchanges = this.processAllEvents(exchanges);
        
        // Créer des événements pour les skills sans échanges
        const skillEvents = this.createSkillEvents(skills, exchanges, startDate, endDate);
        
        // Combiner tous les événements
        const allEvents = [...processedExchanges, ...skillEvents];
        
        console.log(`Total events for producer: ${allEvents.length} (${processedExchanges.length} exchanges + ${skillEvents.length} skill-only)`);
        
        return allEvents;
      })
    );
  }

  // Créer des événements calendrier pour les skills sans échanges
  private createSkillEvents(skills: any[], exchanges: CalendarEvent[], startDate: Date, endDate: Date): ExtendedCalendarEvent[] {
    const skillEvents: ExtendedCalendarEvent[] = [];
    
    // Créer un Set des skillIds qui ont déjà des échanges
    const skillsWithExchanges = new Set(exchanges.map(e => e.skillId));
    
    skills.forEach(skill => {
      // Si la compétence a une date de streaming et n'a pas d'échanges
      if (skill.streamingDate && skill.streamingTime) {
        const skillDate = new Date(skill.streamingDate + 'T' + skill.streamingTime);
        
        // Vérifier si la date est dans la période demandée
        if (skillDate >= startDate && skillDate <= endDate) {
          // Vérifier si cette compétence n'a pas déjà d'échanges OU si on veut toujours l'afficher
          const hasNoExchanges = !skillsWithExchanges.has(skill.id);
          
          if (hasNoExchanges) {
            // Créer un événement "fantôme" pour cette compétence
            const skillEvent: ExtendedCalendarEvent = {
              id: -skill.id, // ID négatif pour différencier des vrais échanges
              skillId: skill.id,
              skillName: skill.name,
              skillDescription: skill.description,
              producerId: skill.userId,
              producerName: 'Moi',
              receiverId: 0,
              receiverName: 'Aucun inscrit',
              status: 'PENDING', // Utiliser PENDING pour les skills sans échanges
              streamingDate: skillDate.toISOString(),
              streamingTime: skill.streamingTime,
              price: skill.price,
              categoryName: skill.categoryName || '',
              role: 'PRODUCER',
              eventType: 'pending', // Type pending pour les skills sans échanges
              color: '#95a5a6', // Couleur grise pour les skills sans échanges
              createdAt: skill.createdAt || new Date().toISOString(),
              updatedAt: skill.updatedAt || new Date().toISOString(),
              // Propriétés supplémentaires pour identifier les skills sans échanges
              isSkillOnly: true, // Marqueur pour identifier les skills sans échanges
              hasNoExchange: true, // Indicateur supplémentaire
              availableQuantity: skill.availableQuantity,
              nbInscrits: skill.nbInscrits || 0
            };
            
            skillEvents.push(skillEvent);
            console.log(`Added skill-only event: ${skill.name} on ${skill.streamingDate}`);
          }
        }
      }
    });
    
    return skillEvents;
  }

  // Récupérer TOUS les événements pour un receveur (pas de changement)
  getReceiverEvents(startDate: Date, endDate: Date): Observable<ExtendedCalendarEvent[]> {
    const params = new HttpParams()
      .set('startDate', this.formatDate(startDate))
      .set('endDate', this.formatDate(endDate));

    console.log(`Fetching ALL receiver events from ${this.formatDate(startDate)} to ${this.formatDate(endDate)}`);

    return this.http.get<CalendarEvent[]>(`${this.apiUrl}/events/receiver`, { params })
      .pipe(
        map(events => {
          console.log(`Received ${events?.length || 0} receiver events (all statuses)`);
          return this.processAllEvents(events || []);
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Error fetching receiver events:', error);
          return of([]);
        })
      );
  }

  // Récupérer les prochains événements
  getUpcomingEvents(days: number = 7): Observable<ExtendedCalendarEvent[]> {
    const params = new HttpParams().set('days', days.toString());

    console.log(`Fetching upcoming events for next ${days} days`);

    return this.http.get<CalendarEvent[]>(`${this.apiUrl}/upcoming`, { params })
      .pipe(
        map(events => {
          console.log(`Received ${events?.length || 0} upcoming events`);
          return this.processAllEvents(events || []);
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Error fetching upcoming events:', error);
          return of([]);
        })
      );
  }

  // Récupérer les détails d'un événement
  getEventDetails(exchangeId: number): Observable<CalendarEvent> {
    return this.http.get<CalendarEvent>(`${this.apiUrl}/events/${exchangeId}`)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          console.error('Error fetching event details:', error);
          return throwError(() => error);
        })
      );
  }

  // Mettre à jour la vue du calendrier
  updateView(view: CalendarView): void {
    console.log('Updating calendar view:', view);
    this.currentViewSubject.next(view);
  }

  // Générer la structure du calendrier mensuel AVEC TOUS LES ÉVÉNEMENTS
  generateMonthCalendar(year: number, month: number, events: ExtendedCalendarEvent[]): CalendarMonth {
    try {
      console.log(`Generating calendar for ${month}/${year} with ${events.length} events`);
      
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDate = this.getWeekStart(firstDay);
      const weeks: CalendarWeek[] = [];
      
      let currentDate = new Date(startDate);
      let weekNumber = 1;
      let iterationCount = 0;
      const maxIterations = 42;
      
      while ((currentDate <= lastDay || currentDate.getDay() !== 0) && iterationCount < maxIterations) {
        const week: CalendarWeek = {
          weekNumber,
          days: []
        };
        
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(currentDate);
          const dayEvents = this.getAllEventsForDate(dayDate, events);
          
          week.days.push({
            date: dayDate,
            isCurrentMonth: dayDate.getMonth() === month,
            isToday: this.isToday(dayDate),
            isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
            events: dayEvents,
            dayNumber: dayDate.getDate(),
            monthName: dayDate.getMonth() !== month ? this.getMonthName(dayDate.getMonth()) : undefined
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        weeks.push(week);
        weekNumber++;
        iterationCount += 7;
        
        if (currentDate.getMonth() !== month && currentDate.getDay() === 0) {
          break;
        }
      }
      
      const totalEvents = weeks.reduce((acc, week) => 
        acc + week.days.reduce((dayAcc, day) => dayAcc + day.events.length, 0), 0
      );
      console.log(`Calendar generated with ${totalEvents} total events displayed`);
      
      return {
        month,
        year,
        weeks,
        name: this.getMonthName(month)
      };
    } catch (error) {
      console.error('Error generating month calendar:', error);
      return {
        month,
        year,
        weeks: [],
        name: this.getMonthName(month)
      };
    }
  }

  // Obtenir TOUS les événements sans filtrage
  getFilteredEvents(events: ExtendedCalendarEvent[], filter: CalendarFilter): ExtendedCalendarEvent[] {
    console.log(`Returning all ${events.length} events without filtering`);
    return events;
  }

  // Traiter TOUS les événements sans exclusion
  private processAllEvents(events: ExtendedCalendarEvent[]): ExtendedCalendarEvent[] {
    if (!events || !Array.isArray(events)) {
      return [];
    }

    const processed = events.map(event => {
      try {
        console.log(`Processing event: ${event.skillName} - Status: ${event.status}`);
        
        return {
          ...event,
          streamingDate: event.streamingDate ? new Date(event.streamingDate).toISOString() : '',
          color: this.getEventColor(event)
        };
      } catch (error) {
        console.error('Error processing event:', error, event);
        return event;
      }
    }).filter(event => event != null);

    const statusCount = processed.reduce((acc, event) => {
      acc[event.status] = (acc[event.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Events by status:', statusCount);
    
    return processed;
  }

  private getEventColor(event: ExtendedCalendarEvent): string {
    const role = event.role;
    const status = event.status;
    
    // Couleur spéciale pour les skills sans échanges
    if (event.hasNoExchange || event.isSkillOnly) {
      return '#bdc3c7'; // Gris clair pour les skills sans inscriptions
    }
    
    if (role === 'PRODUCER') {
      switch (status) {
        case 'PENDING': return '#fdcb6e';
        case 'ACCEPTED': return '#fd79a8';
        case 'SCHEDULED': return '#a29bfe';
        case 'IN_PROGRESS': return '#ff6b6b';
        case 'COMPLETED': return '#00b894';
        case 'REJECTED': return '#e74c3c';
        case 'CANCELLED': return '#95a5a6';
        default: return '#dfe6e9';
      }
    } else {
      switch (status) {
        case 'PENDING': return '#fdcb6e';
        case 'ACCEPTED': return '#74b9ff';
        case 'SCHEDULED': return '#a29bfe';
        case 'IN_PROGRESS': return '#0984e3';
        case 'COMPLETED': return '#00b894';
        case 'REJECTED': return '#e74c3c';
        case 'CANCELLED': return '#95a5a6';
        default: return '#dfe6e9';
      }
    }
  }

  // Obtenir TOUS les événements pour une date donnée
  private getAllEventsForDate(date: Date, events: ExtendedCalendarEvent[]): ExtendedCalendarEvent[] {
    if (!events || !Array.isArray(events)) {
      return [];
    }

    const eventsForDate = events.filter(event => {
      if (!event || !event.streamingDate) return false;
      
      try {
        const eventDate = new Date(event.streamingDate);
        const matches = eventDate.getDate() === date.getDate() &&
                       eventDate.getMonth() === date.getMonth() &&
                       eventDate.getFullYear() === date.getFullYear();
        
        if (matches) {
          console.log(`Event on ${date.toDateString()}: ${event.skillName} (${event.status})`);
        }
        
        return matches;
      } catch {
        return false;
      }
    });

    console.log(`Found ${eventsForDate.length} events for ${date.toDateString()}`);
    return eventsForDate;
  }

  private getAuthToken(): string {
    return 'Bearer ' + (localStorage.getItem('access_token') || '');
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  private isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getMonthName(month: number): string {
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return months[month] || '';
  }

  private getUserRole(): string {
    try {
      const token = localStorage.getItem('access_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const roles = payload.roles || payload.realm_access?.roles || [];
        if (roles.includes('PRODUCER')) return 'PRODUCER';
        if (roles.includes('RECEIVER')) return 'RECEIVER';
      }
    } catch (error) {
      console.error('Error getting user role:', error);
    }
    return '';
  }

  getSessionBySkillId(skillId: number): Observable<LivestreamSession | null> {
  return this.livestreamService.getSessionBySkillId(skillId);
}

createSession(skillId: number, immediate: boolean): Observable<LivestreamSession> {
  return this.livestreamService.createSession(skillId, immediate);
}
}