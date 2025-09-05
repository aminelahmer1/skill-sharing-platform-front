import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Inject } from '@angular/core';
import { SkillService } from '../../../../core/services/Skill/skill.service';
import { LivestreamService } from '../../../../core/services/LiveStream/livestream.service';
import { ExchangeService } from '../../../../core/services/Exchange/exchange.service';
import { Skill } from '../../../../models/skill/skill.model';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AcceptedReceiversDialogComponent } from '../../accepted-receivers-dialog/accepted-receivers-dialog.component';
import { SkillRatingsDialogComponent } from '../../SkillRatingsDialog/skill-ratings-dialog/skill-ratings-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LivestreamSession } from '../../../../models/LivestreamSession/livestream-session';
import { firstValueFrom, Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { RatingService, SkillRatingStats } from '../../../../core/services/Rating/rating.service';
import { CategoryService } from '../../../../core/services/category/category.service';
import { Category } from '../../../../models/skill/skill.model';

// Interface pour les données de confirmation de livestream
interface LivestreamConfirmationData {
  title: string;
  skillName: string;
  participantsCount: number;
  streamingDate: string;
  streamingTime: string;
  confirmText?: string;
  cancelText?: string;
  isImmediate?: boolean;
}

// Composant de confirmation pour livestream
@Component({
  selector: 'app-livestream-confirmation',
  standalone: true,
  imports: [
    CommonModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule
  ],
  template: `
    <div class="confirmation-dialog">
      <div class="dialog-header">
        <mat-icon class="dialog-icon">live_tv</mat-icon>
        <h2 class="dialog-title">{{ data.title }}</h2>
      </div>
      
      <div class="dialog-content">
        <div class="livestream-info">
          <h3>{{ data.skillName }}</h3>
          <div class="livestream-details">
            <div class="detail-item">
              <mat-icon>people</mat-icon>
              <span>{{ data.participantsCount }} participant(s) inscrits</span>
            </div>
            <div class="detail-item">
              <mat-icon>schedule</mat-icon>
              <span>{{ data.streamingDate }} à {{ data.streamingTime }}</span>
            </div>
            <div class="detail-item" *ngIf="data.isImmediate">
              <mat-icon>flash_on</mat-icon>
              <span>Démarrage immédiat</span>
            </div>
          </div>
        </div>
        
        <p class="confirmation-message">
          {{ data.isImmediate ? 
              'Voulez-vous démarrer le livestream maintenant ? Les participants recevront une notification immédiate.' :
              'Voulez-vous programmer ce livestream ? Les participants recevront une notification.' }}
        </p>
      </div>
      
      <div class="dialog-actions">
        <button mat-button 
                (click)="onCancel()" 
                class="cancel-btn">
          {{ data.cancelText || 'Annuler' }}
        </button>
        <button mat-raised-button 
                [color]="data.isImmediate ? 'warn' : 'primary'"
                (click)="onConfirm()" 
                class="confirm-btn">
          <mat-icon>{{ data.isImmediate ? 'live_tv' : 'schedule' }}</mat-icon>
          {{ data.confirmText || (data.isImmediate ? 'Démarrer' : 'Programmer') }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirmation-dialog {
      padding: 24px;
      max-width: 450px;
      min-width: 350px;
    }
    
    .dialog-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
      text-align: center;
    }
    
    .dialog-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #6c5ce7;
      margin-bottom: 16px;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .dialog-title {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: #2d3436;
    }
    
    .dialog-content {
      margin-bottom: 24px;
    }
    
    .livestream-info {
      background: rgba(108, 92, 231, 0.08);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    
    .livestream-info h3 {
      margin: 0 0 12px 0;
      color: #6c5ce7;
      font-size: 1.1rem;
      font-weight: 600;
      text-align: center;
    }
    
    .livestream-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #636e72;
      font-size: 0.9rem;
    }
    
    .detail-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #6c5ce7;
    }
    
    .confirmation-message {
      color: #636e72;
      line-height: 1.5;
      font-size: 0.9rem;
      text-align: center;
      margin: 0;
    }
    
    .dialog-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    
    .cancel-btn {
      padding: 10px 20px;
      color: #636e72;
    }
    
    .confirm-btn {
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .confirm-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class LivestreamConfirmationComponent {
  constructor(
    public dialogRef: MatDialogRef<LivestreamConfirmationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: LivestreamConfirmationData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

// Interface pour les compétences avec statut de session
interface SkillWithSessionStatus extends Skill {
  sessionStatus?: 'none' | 'scheduled' | 'live' | 'completed';
  sessionId?: number;
  hasActiveSession?: boolean;
  isSessionCompleted?: boolean; 
  session?: LivestreamSession;
  showFullDescription?: boolean;
}

// Interface pour les suggestions de recherche
interface SearchSuggestion {
  type: 'skill' | 'category';
  title: string;
  typeLabel: string;
  data: any;
}

@Component({
  selector: 'app-my-livestreams',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    DecimalPipe
  ],
  templateUrl: './my-livestreams.component.html',
  styleUrls: ['./my-livestreams.component.css']
})
export class MyLivestreamsComponent implements OnInit, OnDestroy {
  // Propriétés existantes
  skills: SkillWithSessionStatus[] = [];
  filteredSkills: SkillWithSessionStatus[] = [];
  originalSkills: SkillWithSessionStatus[] = [];
  sessions: { [skillId: number]: LivestreamSession } = {};
  skillRatings: { [skillId: number]: SkillRatingStats } = {};
  isLoading = true;
  error: string | null = null;

  // Propriétés pour la recherche
  searchQuery: string = '';
  showSuggestions: boolean = false;
  searchSuggestions: SearchSuggestion[] = [];
  selectedSuggestionIndex: number = -1;
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  // Propriétés pour les filtres
  showFilters: boolean = false;
  selectedCategory: number | null = null;
  selectedDateRange: string = '';
  selectedSessionStatus: string = '';
  sortBy: string = 'priority';
  categories: Category[] = [];

  // Compteur de filtres actifs
  get activeFiltersCount(): number {
    let count = 0;
    if (this.searchQuery) count++;
    if (this.selectedCategory) count++;
    if (this.selectedDateRange) count++;
    if (this.selectedSessionStatus) count++;
    return count;
  }

  // Expose Math pour le template
  Math = Math;

  constructor(
    private skillService: SkillService,
    private livestreamService: LivestreamService,
    private exchangeService: ExchangeService,
    private ratingService: RatingService,
    private categoryService: CategoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadSkills();
    this.setupSearchDebounce();
  }
loadSkills(): void {
  this.isLoading = true;
  this.error = null;

  this.skillService.getMySkills().subscribe({
    next: (skills) => {
      // Trier par date de création (plus récent en premier)
      const sortedSkills = skills.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // ⭐⭐ CORRECTION : Initialiser les tableaux pour la recherche/filtrage
      this.originalSkills = [...sortedSkills];
      this.filteredSkills = [...sortedSkills];
      
      // Appliquer le filtrage après avoir vérifié les sessions
      this.skills = sortedSkills;
      this.checkActiveSessions();
    },
    error: () => {
      this.error = 'Erreur lors du chargement des livestreams.';
      this.isLoading = false;
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
    }
  });
}
   checkActiveSessions(): void {
  const checkPromises = this.skills.map(skill => {
    return new Promise<void>((resolve) => {
      this.livestreamService.getSessionBySkillId(skill.id).subscribe({
        next: session => {
          if (session) {
            this.sessions[skill.id] = session;
            
            // Mapper le statut de session sur la compétence
            switch (session.status) {
              case 'LIVE':
                skill.sessionStatus = 'live';
                skill.hasActiveSession = true;
                skill.isSessionCompleted = false;
                break;
              case 'SCHEDULED':
                skill.sessionStatus = 'scheduled';
                skill.hasActiveSession = true;
                skill.isSessionCompleted = false;
                break;
              case 'COMPLETED':
                skill.sessionStatus = 'completed';
                skill.hasActiveSession = false;
                skill.isSessionCompleted = true;
                // Charger les ratings pour cette compétence
                this.loadSkillRatings(skill.id);
                break;
              default:
                skill.sessionStatus = 'none';
                skill.hasActiveSession = false;
                skill.isSessionCompleted = false;
            }
            skill.sessionId = session.id;
            skill.session = session;
            resolve();
          } else {
            // Vérifier si des échanges ont été complétés pour cette compétence
            this.exchangeService.isSessionCompletedForSkill(skill.id).subscribe({
              next: (isCompleted) => {
                if (isCompleted) {
                  skill.sessionStatus = 'completed';
                  skill.hasActiveSession = false;
                  skill.isSessionCompleted = true;
                  // Charger les ratings pour cette compétence
                  this.loadSkillRatings(skill.id);
                } else {
                  skill.sessionStatus = 'none';
                  skill.hasActiveSession = false;
                  skill.isSessionCompleted = false;
                }
                resolve();
              },
              error: () => {
                skill.sessionStatus = 'none';
                skill.hasActiveSession = false;
                skill.isSessionCompleted = false;
                resolve();
              }
            });
          }
        },
        error: () => {
          skill.sessionStatus = 'none';
          skill.hasActiveSession = false;
          skill.isSessionCompleted = false;
          resolve();
        }
      });
    });
  });

  Promise.all(checkPromises).then(() => {
    // Appliquer le filtrage et le tri prioritaire
    this.skills = this.filterVisibleSkills(this.skills);
    this.skills = this.sortSkillsByPriority(this.skills);
    
    // ⭐⭐ CORRECTION : Mettre à jour les tableaux de recherche/filtrage
    this.originalSkills = [...this.skills];
    this.filteredSkills = [...this.skills];
    
    this.isLoading = false;
    
    // Log pour debug (à supprimer en production)
    console.log(`Affichage de ${this.skills.length} livestreams après filtrage et tri`);
  });
}
   private filterVisibleSkills(skills: SkillWithSessionStatus[]): SkillWithSessionStatus[] {
    return skills.filter(skill => !this.shouldHideSkill(skill));
  }

   private shouldHideSkill(skill: SkillWithSessionStatus): boolean {
    // Ne pas masquer les sessions complétées ou actives
    if (skill.isSessionCompleted || skill.hasActiveSession) {
      return false;
    }

    // Ne pas masquer si il y a des inscriptions
    if (skill.nbInscrits > 0) {
      return false;
    }

    // Masquer si pas d'inscription ET date/heure passée
    return this.isDateTimePassed(skill.streamingDate, skill.streamingTime);
  }
   /**
   * Vérifie si la date et l'heure de streaming sont passées
   * @param streamingDate Date au format string
   * @param streamingTime Heure au format string (HH:mm)
   * @returns true si la date/heure est passée
   */
  private isDateTimePassed(streamingDate: string, streamingTime: string): boolean {
    try {
      // Créer un objet Date à partir de la date et l'heure de streaming
      const streamingDateTime = new Date(`${streamingDate}T${streamingTime}:00`);
      const now = new Date();
      
      // Comparer avec l'heure actuelle
      return streamingDateTime < now;
    } catch (error) {
      console.error('Erreur lors de la vérification de la date/heure:', error);
      // En cas d'erreur, ne pas masquer la compétence
      return false;
    }
  }


private loadSkillRatings(skillId: number): void {
    this.ratingService.getSkillRatingStats(skillId).subscribe({
      next: (stats) => {
        this.skillRatings[skillId] = stats;
      },
      error: (error) => {
        console.error(`Erreur lors du chargement des ratings pour la compétence ${skillId}:`, error);
      }
    });
  }
  /**
   * Tri les compétences par ordre de priorité
   * 1. Sessions LIVE (date la plus proche en premier)
   * 2. Sessions SCHEDULED qui attendent le début (date la plus proche en premier)
   * 3. Nouvelles compétences avec inscriptions (date la plus proche en premier)
   * 4. Nouvelles compétences sans inscriptions (date la plus proche en premier)
   * 5. Sessions terminées (date la plus récente en premier)
   */
  private sortSkillsByPriority(skills: SkillWithSessionStatus[]): SkillWithSessionStatus[] {
    return skills.sort((a, b) => {
      // 1. PRIORITÉ MAXIMALE : Sessions LIVE
      if (a.sessionStatus === 'live' && b.sessionStatus !== 'live') return -1;
      if (b.sessionStatus === 'live' && a.sessionStatus !== 'live') return 1;
      if (a.sessionStatus === 'live' && b.sessionStatus === 'live') {
        return this.compareDates(a, b); // Plus proche en premier
      }

      // 2. DEUXIÈME PRIORITÉ : Sessions SCHEDULED
      if (a.sessionStatus === 'scheduled' && b.sessionStatus !== 'scheduled' && b.sessionStatus !== 'live') return -1;
      if (b.sessionStatus === 'scheduled' && a.sessionStatus !== 'scheduled' && a.sessionStatus !== 'live') return 1;
      if (a.sessionStatus === 'scheduled' && b.sessionStatus === 'scheduled') {
        return this.compareDates(a, b); // Plus proche en premier
      }

      // 3. TROISIÈME PRIORITÉ : Nouvelles compétences AVEC inscriptions
      const aHasInscriptions = (a.sessionStatus === 'none' && a.nbInscrits > 0);
      const bHasInscriptions = (b.sessionStatus === 'none' && b.nbInscrits > 0);
      
      if (aHasInscriptions && !bHasInscriptions && b.sessionStatus !== 'live' && b.sessionStatus !== 'scheduled') return -1;
      if (bHasInscriptions && !aHasInscriptions && a.sessionStatus !== 'live' && a.sessionStatus !== 'scheduled') return 1;
      if (aHasInscriptions && bHasInscriptions) {
        return this.compareDates(a, b); // Plus proche en premier
      }

      // 4. QUATRIÈME PRIORITÉ : Nouvelles compétences SANS inscriptions
      const aNoInscriptions = (a.sessionStatus === 'none' && a.nbInscrits === 0);
      const bNoInscriptions = (b.sessionStatus === 'none' && b.nbInscrits === 0);
      
      if (aNoInscriptions && !bNoInscriptions && b.sessionStatus !== 'live' && b.sessionStatus !== 'scheduled' && !bHasInscriptions) return -1;
      if (bNoInscriptions && !aNoInscriptions && a.sessionStatus !== 'live' && a.sessionStatus !== 'scheduled' && !aHasInscriptions) return 1;
      if (aNoInscriptions && bNoInscriptions) {
        return this.compareDates(a, b); // Plus proche en premier
      }

      // 5. CINQUIÈME PRIORITÉ : Sessions terminées
      if (a.sessionStatus === 'completed' && b.sessionStatus !== 'completed') return 1;
      if (b.sessionStatus === 'completed' && a.sessionStatus !== 'completed') return -1;
      if (a.sessionStatus === 'completed' && b.sessionStatus === 'completed') {
        return this.compareDatesDescending(a, b); // Plus récent en premier pour les terminées
      }

      // Tri par défaut : date la plus proche
      return this.compareDates(a, b);
    });
  }

  /**
   * Compare les dates de streaming (ordre croissant - plus proche en premier)
   */
  private compareDates(a: SkillWithSessionStatus, b: SkillWithSessionStatus): number {
    try {
      const dateA = new Date(`${a.streamingDate}T${a.streamingTime}:00`);
      const dateB = new Date(`${b.streamingDate}T${b.streamingTime}:00`);
      return dateA.getTime() - dateB.getTime();
    } catch (error) {
      console.error('Erreur lors de la comparaison des dates:', error);
      return 0;
    }
  }

  /**
   * Compare les dates de streaming (ordre décroissant - plus récent en premier)
   */
  private compareDatesDescending(a: SkillWithSessionStatus, b: SkillWithSessionStatus): number {
    try {
      const dateA = new Date(`${a.streamingDate}T${a.streamingTime}:00`);
      const dateB = new Date(`${b.streamingDate}T${b.streamingTime}:00`);
      return dateB.getTime() - dateA.getTime();
    } catch (error) {
      console.error('Erreur lors de la comparaison des dates:', error);
      return 0;
    }
  }
  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
  }

  /**
   * Configuration du debounce pour la recherche
   */
  private setupSearchDebounce(): void {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  /**
   * Chargement des catégories
   */
  private loadCategories(): void {
    this.categoryService.getAllCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des catégories:', error);
      }
    });
  }

  /**
   * Gestion du changement de recherche
   */
  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
    if (this.searchQuery.length > 0) {
      this.generateSuggestions();
    } else {
      this.showSuggestions = false;
      this.searchSuggestions = [];
      this.applyFilters();
    }
  }

  /**
   * Génération des suggestions de recherche
   */
  private generateSuggestions(): void {
    const query = this.searchQuery.toLowerCase();
    this.searchSuggestions = [];

    // Suggestions basées sur les compétences
    this.originalSkills.forEach(skill => {
      if (skill.name.toLowerCase().includes(query)) {
        this.searchSuggestions.push({
          type: 'skill',
          title: skill.name,
          typeLabel: 'Compétence',
          data: skill
        });
      }
    });

    // Suggestions basées sur les catégories
    this.categories.forEach(category => {
      if (category.name.toLowerCase().includes(query)) {
        this.searchSuggestions.push({
          type: 'category',
          title: category.name,
          typeLabel: 'Catégorie',
          data: category
        });
      }
    });

    // Limiter à 10 suggestions
    this.searchSuggestions = this.searchSuggestions.slice(0, 10);
    this.showSuggestions = this.searchSuggestions.length > 0;
  }

  /**
   * Effectuer la recherche
   */
  private performSearch(query: string): void {
    this.applyFilters();
  }

  /**
   * Sélection d'une suggestion
   */
  selectSuggestion(suggestion: SearchSuggestion): void {
    if (suggestion.type === 'skill') {
      this.searchQuery = suggestion.title;
    } else if (suggestion.type === 'category') {
      this.selectedCategory = suggestion.data.id;
      this.searchQuery = '';
    }
    this.showSuggestions = false;
    this.applyFilters();
  }

  /**
   * Effacer la recherche
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.showSuggestions = false;
    this.searchSuggestions = [];
    this.applyFilters();
  }

  /**
   * Gestion du clavier pour les suggestions
   */
  onSearchInputKeyDown(event: KeyboardEvent): void {
    if (!this.showSuggestions || this.searchSuggestions.length === 0) return;

    switch(event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.min(
          this.selectedSuggestionIndex + 1, 
          this.searchSuggestions.length - 1
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(this.searchSuggestions[this.selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        this.showSuggestions = false;
        this.selectedSuggestionIndex = -1;
        break;
    }
  }

  /**
   * Toggle des filtres
   */
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  /**
   * Application des filtres
   */
 applyFilters(): void {
  let filtered = [...this.originalSkills]; // ⭐ Utiliser originalSkills au lieu de skills

  // Filtre par recherche
  if (this.searchQuery) {
    const query = this.searchQuery.toLowerCase();
    filtered = filtered.filter(skill => 
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      (skill.categoryName && skill.categoryName.toLowerCase().includes(query))
    );
  }

  // Filtre par catégorie
  if (this.selectedCategory) {
    filtered = filtered.filter(skill => skill.categoryId === this.selectedCategory);
  }

  // Filtre par date
  if (this.selectedDateRange) {
    filtered = this.filterByDateRange(filtered, this.selectedDateRange);
  }

  // Filtre par statut de session
  if (this.selectedSessionStatus) {
    filtered = this.filterBySessionStatus(filtered, this.selectedSessionStatus);
  }

  // Application du tri
  this.filteredSkills = this.sortSkills(filtered, this.sortBy);
}
  /**
   * Application du tri
   */
  applySort(): void {
    this.filteredSkills = this.sortSkills(this.filteredSkills, this.sortBy);
  }

  /**
   * Filtrage par période
   */
  private filterByDateRange(skills: SkillWithSessionStatus[], range: string): SkillWithSessionStatus[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return skills.filter(skill => {
      const skillDate = new Date(skill.streamingDate);
      
      switch (range) {
        case 'today':
          return skillDate.toDateString() === today.toDateString();
        case 'tomorrow':
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return skillDate.toDateString() === tomorrow.toDateString();
        case 'week':
          const weekEnd = new Date(today);
          weekEnd.setDate(weekEnd.getDate() + 7);
          return skillDate >= today && skillDate <= weekEnd;
        case 'month':
          const monthEnd = new Date(today);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          return skillDate >= today && skillDate <= monthEnd;
        case 'past':
          return skillDate < today;
        default:
          return true;
      }
    });
  }

  /**
   * Filtrage par statut de session
   */
  private filterBySessionStatus(skills: SkillWithSessionStatus[], status: string): SkillWithSessionStatus[] {
    switch (status) {
      case 'live':
        return skills.filter(skill => skill.sessionStatus === 'live');
      case 'scheduled':
        return skills.filter(skill => skill.sessionStatus === 'scheduled');
      case 'with-inscriptions':
        return skills.filter(skill => skill.sessionStatus === 'none' && skill.nbInscrits > 0);
      case 'without-inscriptions':
        return skills.filter(skill => skill.sessionStatus === 'none' && skill.nbInscrits === 0);
      case 'completed':
        return skills.filter(skill => skill.isSessionCompleted || skill.sessionStatus === 'completed');
      default:
        return skills;
    }
  }

  /**
   * Tri des compétences
   */
  private sortSkills(skills: SkillWithSessionStatus[], sortBy: string): SkillWithSessionStatus[] {
    const sorted = [...skills];
    
    switch (sortBy) {
      case 'priority':
        return this.sortSkillsByPriority(sorted);
      case 'dateAsc':
        return sorted.sort((a, b) => this.compareDates(a, b));
      case 'dateDesc':
        return sorted.sort((a, b) => this.compareDates(b, a));
      case 'inscriptionsDesc':
        return sorted.sort((a, b) => b.nbInscrits - a.nbInscrits);
      case 'inscriptionsAsc':
        return sorted.sort((a, b) => a.nbInscrits - b.nbInscrits);
      case 'nameAsc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameDesc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted;
    }
  }

  /**
   * Réinitialisation des filtres
   */
resetFilters(): void {
  this.searchQuery = '';
  this.selectedCategory = null;
  this.selectedDateRange = '';
  this.selectedSessionStatus = '';
  this.sortBy = 'priority';
  this.showSuggestions = false;
  this.searchSuggestions = [];
  
  // ⭐⭐ CORRECTION : Réinitialiser filteredSkills avec toutes les compétences
  this.filteredSkills = [...this.originalSkills];
}
  /**
   * Obtenir le nom de la catégorie
   */
  getCategoryName(categoryId: number | null): string {
    if (!categoryId) return '';
    const category = this.categories.find(c => c.id === categoryId);
    return category ? category.name : '';
  }

  /**
   * Obtenir le label de la période
   */
  getDateRangeLabel(range: string): string {
    switch (range) {
      case 'today': return "Aujourd'hui";
      case 'tomorrow': return 'Demain';
      case 'week': return 'Cette semaine';
      case 'month': return 'Ce mois';
      case 'past': return 'Dates passées';
      default: return '';
    }
  }

  /**
   * Obtenir le label du statut de session pour les filtres
   */
getSessionStatusFilterLabel(status: string): string {
  switch (status) {
    case 'live': return '🔵 Sessions LIVE'; // Bleu
    case 'scheduled': return '⚫ Sessions programmées'; // Noir
    case 'with-inscriptions': return '🔴 Avec inscriptions'; // Rouge
    case 'without-inscriptions': return '🟡 Sans inscriptions'; // Jaune
    case 'completed': return '🟢 Sessions terminées'; // Vert
    default: return '';
  }
}
getNoSessionMessage(skill: SkillWithSessionStatus): string {
    if (skill.isSessionCompleted || skill.sessionStatus === 'completed') {
      return 'Session terminée';
    }
    if (skill.nbInscrits === 0) {
      return 'Aucun participant inscrit';
    }
    return 'Session non disponible';
  }
// Ces méthodes doivent vérifier le statut correctement
canCreateSession(skill: SkillWithSessionStatus): boolean {
  // Ne peut pas créer si la session est complétée
  if (skill.isSessionCompleted || skill.sessionStatus === 'completed') {
    return false;
  }

  // Vérifier si la compétence a des participants inscrits
  if (skill.nbInscrits === 0) {
    return false;
  }

  // Vérifier si aucune session active n'existe
  return !skill.hasActiveSession;
}

canJoinSession(skill: SkillWithSessionStatus): boolean {
  return (skill.sessionStatus === 'live' || skill.sessionStatus === 'scheduled') && 
         !skill.isSessionCompleted;
}

  /**
   * Toggle pour afficher/masquer la description complète
   */
  toggleDescription(skill: SkillWithSessionStatus): void {
    skill.showFullDescription = !skill.showFullDescription;
  }



createLivestreamSession(skill: SkillWithSessionStatus, immediate: boolean = false): void {
  // Trouver la compétence réelle pour vérifications
  const realSkill = this.originalSkills.find(s => s.id === skill.id);
  if (!realSkill) return;

  // Vérifier d'abord si la session n'est pas déjà terminée
  if (realSkill.isSessionCompleted || realSkill.sessionStatus === 'completed') {
    this.snackBar.open(
      'Cette session a déjà été terminée. Impossible de créer une nouvelle session pour cette compétence.',
      'Fermer', 
      { duration: 5000 }
    );
    return;
  }

  // Vérifier s'il y a une session active
  if (realSkill.hasActiveSession) {
    this.snackBar.open(
      'Une session est déjà active pour cette compétence.',
      'Fermer', 
      { duration: 3000 }
    );
    return;
  }

  const dialogRef = this.dialog.open(LivestreamConfirmationComponent, {
    width: '450px',
    disableClose: true,
    data: {
      title: immediate ? 'Démarrer le Livestream' : 'Programmer le Livestream',
      skillName: realSkill.name,
      participantsCount: realSkill.nbInscrits,
      streamingDate: realSkill.streamingDate,
      streamingTime: realSkill.streamingTime,
      isImmediate: immediate,
      confirmText: immediate ? 'Démarrer maintenant' : 'Programmer',
      cancelText: 'Annuler'
    }
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result === true) {
      this.performCreateSession(realSkill, immediate);
    }
  });
}

private performCreateSession(realSkill: SkillWithSessionStatus, immediate: boolean): void {
  this.isLoading = true;
  
  this.livestreamService.createSession(realSkill.id, immediate).subscribe({
    next: (session) => {
      this.sessions[realSkill.id] = session;
      
      // Mettre à jour la compétence réelle
      realSkill.sessionStatus = immediate ? 'live' : 'scheduled';
      realSkill.hasActiveSession = true;
      realSkill.sessionId = session.id;
      
      // Mettre à jour aussi la compétence filtrée si elle existe
      const filteredSkill = this.filteredSkills.find(s => s.id === realSkill.id);
      if (filteredSkill) {
        filteredSkill.sessionStatus = realSkill.sessionStatus;
        filteredSkill.hasActiveSession = realSkill.hasActiveSession;
        filteredSkill.sessionId = realSkill.sessionId;
      }
      
      this.snackBar.open(
        immediate 
          ? 'Livestream démarré avec succès !' 
          : `Livestream programmé pour ${session.startTime}`,
        'Fermer', 
        { duration: 5000 }
      );
      
      if (immediate) {
        this.navigateToLivestream(session.id);
      }
      
      this.isLoading = false;
    },
    error: (err) => {
      console.error('Erreur lors de la création de la session:', err);
      this.snackBar.open('Échec de la création du livestream', 'Fermer', { duration: 3000 });
      this.isLoading = false;
    }
  });
}

joinExistingSession(skill: SkillWithSessionStatus): void {
  // Trouver la compétence réelle pour obtenir le sessionId
  const realSkill = this.originalSkills.find(s => s.id === skill.id);
  if (realSkill && realSkill.sessionId) {
    this.navigateToLivestream(realSkill.sessionId);
  } else {
    this.snackBar.open('Session non disponible', 'Fermer', { duration: 3000 });
  }
}

navigateToLivestream(sessionId: number): void {
  this.router.navigate(['/producer/livestream', sessionId]);
}


  

  // MÉTHODE MISE À JOUR pour ouvrir le dialogue amélioré
  viewSkillRatings(skillId: number): void {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;
    
    // Ouvrir le dialogue amélioré avec tous les commentaires
    const dialogRef = this.dialog.open(SkillRatingsDialogComponent, {
      width: '700px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'skill-ratings-dialog',
      data: {
        skillId: skillId,
        skillName: skill.name,
        ratings: this.skillRatings[skillId]
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      // Optionnel: actions après fermeture du dialogue
      console.log('Dialogue des évaluations fermé');
    });
  }

  getSessionStatusColor(status?: string): string {
    switch (status) {
      case 'live': return 'warn';
      case 'scheduled': return 'accent';
      case 'completed': return 'primary';
      default: return '';
    }
  }

    getSessionStatusLabel(status?: string): string {
    switch (status) {
      case 'live': return 'En direct';
      case 'scheduled': return 'Programmé';
      case 'completed': return 'Terminé';
      default: return 'Aucune session';
    }
  }

   getRatingColor(rating: number): string {
    if (rating >= 4.5) return '#4CAF50';
    if (rating >= 3.5) return '#8BC34A';
    if (rating >= 2.5) return '#FFC107';
    if (rating >= 1.5) return '#FF9800';
    return '#F44336';
  }

  getRatingLabel(rating: number): string {
    if (rating >= 4.5) return 'Excellent';
    if (rating >= 3.5) return 'Très bon';
    if (rating >= 2.5) return 'Bon';
    if (rating >= 1.5) return 'Moyen';
    if (rating >= 1) return 'Faible';
    return 'Non noté';
  }

  getStarArray(rating: number): boolean[] {
    const stars: boolean[] = [];
    const fullStars = Math.floor(rating);
    
    for (let i = 0; i < 5; i++) {
      stars.push(i < fullStars);
    }
    
    return stars;
  }
  showAcceptedReceivers(skillId: number): void {
    const skill = this.skills.find(s => s.id === skillId);
    if (skill && skill.nbInscrits > 0) {
      this.dialog.open(AcceptedReceiversDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '80vh',
      panelClass: 'receivers-dialog',
      data: { 
        skillId: skillId, 
        skillName: skill.name  }
      });
    }
  }
}