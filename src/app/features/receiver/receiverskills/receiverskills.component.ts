// receiverskills.component.ts
import { Component, OnInit, ViewChild, ElementRef, OnDestroy, Inject } from '@angular/core';
import { SkillService } from '../../../core/services/Skill/skill.service';
import { UserService } from '../../../core/services/User/user.service';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { CategoryService } from '../../../core/services/category/category.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { Skill, Category } from '../../../models/skill/skill.model';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';

import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { firstValueFrom, Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';

interface SkillWithExchangeStatus extends Skill {
  exchangeStatus?: 'available' | 'pending' | 'accepted' | 'completed' | 'in_progress' | 'rejected';
  exchangeMessage?: string;
  isUserReserved?: boolean;
  rejectionReason?: string;
  searchMatchScore?: number;
}

interface SearchSuggestion {
  type: 'skill' | 'category' | 'producer';
  title: string;
  typeLabel: string;
  value: any;
}

interface PriceRange {
  min: number | null;
  max: number | null;
}

// Interface pour les données de confirmation - AJOUTÉE
interface ConfirmationData {
  title: string;
  skillName: string;
  producerName: string;
  price: number;
  date: string;
  time: string;
  confirmText?: string;
  cancelText?: string;
}

@Component({
  selector: 'app-reservation-confirmation',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirmation-dialog">
      <div class="dialog-header">
        <mat-icon class="dialog-icon">book_online</mat-icon>
        <h2 class="dialog-title">{{ data.title }}</h2>
      </div>
      
      <div class="dialog-content">
        <div class="skill-info">
          <h3>{{ data.skillName }}</h3>
          <div class="skill-details">
            <div class="detail-item">
              <mat-icon>person</mat-icon>
              <span>{{ data.producerName }}</span>
            </div>
            <div class="detail-item">
              <mat-icon>monetization_on</mat-icon>
              <span>{{ data.price }} TND</span>
            </div>
            <div class="detail-item">
              <mat-icon>schedule</mat-icon>
              <span>{{ data.date }} à {{ data.time }}</span>
            </div>
          </div>
        </div>
        
        <p class="confirmation-message">
          Confirmez-vous votre réservation ? Vous recevrez une notification une fois que le producteur aura validé votre demande.
        </p>
      </div>
      
      <div class="dialog-actions">
        <button mat-button 
                (click)="onCancel()" 
                class="cancel-btn">
          {{ data.cancelText || 'Annuler' }}
        </button>
        <button mat-raised-button 
                color="primary" 
                (click)="onConfirm()" 
                class="confirm-btn">
          <mat-icon>book_online</mat-icon>
          {{ data.confirmText || 'Réserver' }}
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
      color: #1976d2;
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
      color: #333;
    }
    
    .dialog-content {
      margin-bottom: 24px;
    }
    
    .skill-info {
      background: #f8f9ff;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    
    .skill-info h3 {
      margin: 0 0 12px 0;
      color: #1976d2;
      font-size: 1.1rem;
      font-weight: 600;
      text-align: center;
    }
    
    .skill-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
      font-size: 0.9rem;
    }
    
    .detail-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #1976d2;
    }
    
    .confirmation-message {
      color: #666;
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
      color: #666;
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
export class ReservationConfirmationComponent {
  constructor(
    public dialogRef: MatDialogRef<ReservationConfirmationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

@Component({
  selector: 'app-receiverskills',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatSnackBarModule,
    MatChipsModule,
    MatSelectModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './receiverskills.component.html',
  styleUrls: ['./receiverskills.component.css']
})
export class ReceiverskillsComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef;

  // Data
  skills: SkillWithExchangeStatus[] = [];
  filteredSkills: SkillWithExchangeStatus[] = [];
  paginatedSkills: SkillWithExchangeStatus[] = [];
  exchanges: ExchangeResponse[] = [];
  categories: Category[] = [];
  producerNames: { [key: number]: string } = {};
  receiverId: number | null = null;
  livestreamSessions: { [skillId: number]: any } = {};

  // Search & Filter
  searchQuery: string = '';
  searchSuggestions: SearchSuggestion[] = [];
  showSuggestions: boolean = false;
  showFilters: boolean = false;
  selectedCategory: number | null = null;
  priceRange: PriceRange = { min: null, max: null };
  selectedDateRange: string = '';
  selectedAvailability: string = '';
  selectedStatus: string = '';
  sortBy: string = 'dateAsc';
  activeFiltersCount: number = 0;

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 12;
  totalPages: number = 1;

  // UI State
  isLoading: boolean = true;
  error: string | null = null;

  // RxJS
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // Math for template
  Math = Math;

  constructor(
    private skillService: SkillService,
    private userService: UserService,
    private exchangeService: ExchangeService,
    private categoryService: CategoryService,
    private keycloakService: KeycloakService,
    private livestreamService: LivestreamService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}
async ngOnInit(): Promise<void> {

  this.setupSearchDebounce();
    await this.initializeComponent();
    this.isLoading = true;
    try {
      // Fetch receiver's ID
      const userProfile = await this.keycloakService.getUserProfile();
      if (!userProfile || !userProfile.id) {
        throw new Error('Profil utilisateur non disponible');
      }
      const keycloakId = userProfile.id;
      const user = await firstValueFrom(this.userService.getUserByKeycloakId(keycloakId));
      this.receiverId = user.id;

      // Load exchanges first to get user's reservation status
      await this.loadExchanges();
      
      // Then load skills and map with exchange status
      await this.loadSkills();
      
      // Check livestream sessions
      await this.checkLivestreamSessions();
    } catch (error: any) {
      this.error = 'Erreur lors de l\'initialisation';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur lors de l\'initialisation :', error);
    } finally {
      this.isLoading = false;
    }
  }
 
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  private async initializeComponent(): Promise<void> {
    this.isLoading = true;
    try {
      // Get user ID
      const userProfile = await this.keycloakService.getUserProfile();
      if (!userProfile || !userProfile.id) {
        throw new Error('Profil utilisateur non disponible');
      }
      const keycloakId = userProfile.id;
      const user = await firstValueFrom(this.userService.getUserByKeycloakId(keycloakId));
      this.receiverId = user.id;

      // Load data in parallel
      await Promise.all([
        this.loadCategories(),
        this.loadExchanges(),
        this.loadSkills()
      ]);

      // Check livestream sessions
      await this.checkLivestreamSessions();

      // Apply initial filters
      this.applyFilters();
    } catch (error: any) {
      this.error = 'Erreur lors de l\'initialisation';
      this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
      console.error('Erreur lors de l\'initialisation :', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      this.categories = await firstValueFrom(this.categoryService.getAllCategories());
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
      this.categories = [];
    }
  }

private async loadSkills(): Promise<void> {
  try {
    const rawSkills = await firstValueFrom(this.skillService.getAllSkills());
    console.log('Raw skills loaded:', rawSkills.length);
    
    // NOUVEAU: Filtrer d'abord par date (exclure les dates dépassées)
    const currentDateTime = new Date();
    const futureSkills = rawSkills.filter(skill => {
      const streamingDateTime = this.createStreamingDateTime(skill.streamingDate, skill.streamingTime);
      return streamingDateTime > currentDateTime;
    });
    console.log('Future skills after date filter:', futureSkills.length);
    
    // Filtrer les compétences pour exclure celles déjà présentes dans accepted-skills
    const availableSkills = futureSkills.filter(skill => {
      const userExchange = this.exchanges.find(ex => ex.skillId === skill.id && ex.receiverId === this.receiverId);
      
      if (userExchange) {
        // Exclure les compétences avec ces statuts (elles sont dans accepted-skills)
        const excludedStatuses = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
        const shouldExclude = excludedStatuses.includes(userExchange.status);
        
        if (shouldExclude) {
          console.log(`Excluding skill ${skill.name} with status ${userExchange.status}`);
        }
        
        return !shouldExclude;
      }
      
      // Inclure toutes les compétences sans échange (disponibles pour réservation)
      return true;
    });
    
    console.log('Available skills after exchange filter:', availableSkills.length);
    
    // Mapper les compétences avec leur statut d'échange
    this.skills = this.mapSkillsWithExchangeStatus(availableSkills);
    console.log('Final skills array:', this.skills.length);
    
    // Log skills with their statuses for debugging
    this.skills.forEach(skill => {
      console.log(`Skill: ${skill.name}, Status: ${skill.exchangeStatus}`);
    });
    
    // Appliquer les filtres après avoir chargé les compétences
    this.applyFilters();
    
    this.loadProducerNames();
  } catch (error: any) {
    this.error = 'Erreur lors du chargement des compétences';
    this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
    console.error('Erreur chargement compétences :', error);
    throw error;
  }
}

 private mapSkillsWithExchangeStatus(rawSkills: Skill[]): SkillWithExchangeStatus[] {
  return rawSkills.map(skill => {
    const userExchange = this.exchanges.find(
      ex => ex.skillId === skill.id && ex.receiverId === this.receiverId
    );

    const category = this.categories.find(c => c.id === skill.categoryId);

    const skillWithStatus: SkillWithExchangeStatus = {
      ...skill,
      categoryName: category?.name || 'Catégorie inconnue',
      exchangeStatus: 'available',
      isUserReserved: false,
      searchMatchScore: 0
    };

    if (userExchange) {
      switch (userExchange.status) {
        case 'PENDING':
          skillWithStatus.exchangeStatus = 'pending';
          skillWithStatus.exchangeMessage = 'Demande en attente de validation';
          skillWithStatus.isUserReserved = true;
          break;
        case 'ACCEPTED':
          skillWithStatus.exchangeStatus = 'accepted';
          skillWithStatus.exchangeMessage = 'Réservation confirmée';
          skillWithStatus.isUserReserved = true;
          break;
        case 'IN_PROGRESS':
          skillWithStatus.exchangeStatus = 'in_progress';
          skillWithStatus.exchangeMessage = 'Formation en cours';
          skillWithStatus.isUserReserved = true;
          break;
        case 'COMPLETED':
          skillWithStatus.exchangeStatus = 'completed';
          skillWithStatus.exchangeMessage = 'Formation terminée';
          skillWithStatus.isUserReserved = true;
          break;
        case 'REJECTED':
  skillWithStatus.exchangeStatus = 'rejected';
  skillWithStatus.exchangeMessage = 'Demande rejetée';
  skillWithStatus.rejectionReason = userExchange.rejectionReason;
  skillWithStatus.isUserReserved = true; // L'utilisateur peut refaire une demande
  break;
        default:
          skillWithStatus.exchangeStatus = 'available';
          skillWithStatus.isUserReserved = false;
      }
    }

    return skillWithStatus;
  });
}


  private async loadExchanges(): Promise<void> {
    try {
      this.exchanges = await firstValueFrom(this.exchangeService.getUserExchanges());
    } catch (error: any) {
      console.warn('Erreur lors du chargement des échanges:', error);
      this.exchanges = [];
    }
  }

   private async checkLivestreamSessions(): Promise<void> {
    try {
      // Only for accepted skills
      const acceptedSkills = this.skills.filter(skill => 
        skill.exchangeStatus === 'accepted' || skill.exchangeStatus === 'in_progress'
      );

      for (const skill of acceptedSkills) {
        try {
          const session = await firstValueFrom(
            this.livestreamService.getSessionBySkillId(skill.id)
          );
          
          if (session && (session.status === 'LIVE' || session.status === 'SCHEDULED')) {
            this.livestreamSessions[skill.id] = session;
          }
        } catch (error) {
          console.warn(`Erreur vérification session pour compétence ${skill.id}`, error);
        }
      }
    } catch (error) {
      console.error('Erreur vérification sessions:', error);
    }
  }


  private loadProducerNames(): void {
    this.skills.forEach(skill => {
      if (!this.producerNames[skill.userId]) {
        this.userService.getUserById(skill.userId).subscribe({
          next: (user) => {
            this.producerNames[skill.userId] = `${user.firstName} ${user.lastName}`;
          },
          error: () => {
            this.producerNames[skill.userId] = 'Utilisateur inconnu';
          }
        });
      }
    });
  }

  // Search & Filter Methods
  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  private performSearch(query: string): void {
    if (!query) {
      this.showSuggestions = false;
      this.applyFilters();
      return;
    }

    // Generate suggestions
    this.generateSearchSuggestions(query);
    
    // Apply search filter
    this.applyFilters();
  }

  private generateSearchSuggestions(query: string): void {
    const lowerQuery = query.toLowerCase();
    this.searchSuggestions = [];

    // Search in skills
    const matchingSkills = this.skills
      .filter(skill => 
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 3)
      .map(skill => ({
        type: 'skill' as const,
        title: skill.name,
        typeLabel: 'Compétence',
        value: skill
      }));

    // Search in categories
    const matchingCategories = this.categories
      .filter(cat => cat.name.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(cat => ({
        type: 'category' as const,
        title: cat.name,
        typeLabel: 'Catégorie',
        value: cat
      }));

    // Search in producers
    const matchingProducers = Object.entries(this.producerNames)
      .filter(([_, name]) => name.toLowerCase().includes(lowerQuery))
      .slice(0, 2)
      .map(([id, name]) => ({
        type: 'producer' as const,
        title: name,
        typeLabel: 'Producteur',
        value: { id: parseInt(id), name }
      }));

    this.searchSuggestions = [
      ...matchingSkills,
      ...matchingCategories,
      ...matchingProducers
    ];

    this.showSuggestions = this.searchSuggestions.length > 0;
  }

selectSuggestion(suggestion: SearchSuggestion): void {
  this.showSuggestions = false;
  
  switch (suggestion.type) {
    case 'skill':
      this.searchQuery = suggestion.title;
      break;
    case 'category':
      // CORRECTION: Assurer la cohérence avec le type utilisé dans les filtres
      this.selectedCategory = suggestion.value.id; // Garder comme number
      this.searchQuery = '';
      break;
    case 'producer':
      this.searchQuery = suggestion.title;
      break;
  }
  
  this.applyFilters();
}
  clearSearch(): void {
    this.searchQuery = '';
    this.showSuggestions = false;
    this.applyFilters();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

 applyFilters(): void {
  let filtered = [...this.skills];

  // Text search with scoring
  if (this.searchQuery) {
    const query = this.searchQuery.toLowerCase();
    filtered = filtered.map(skill => {
      let score = 0;
      
      // Check skill name (highest weight)
      if (skill.name.toLowerCase().includes(query)) {
        score += skill.name.toLowerCase() === query ? 3 : 2;
      }
      
      // Check description
      if (skill.description.toLowerCase().includes(query)) {
        score += 1;
      }
      
      // Check category name
      if (skill.categoryName?.toLowerCase().includes(query)) {
        score += 1.5;
      }
      
      // Check producer name
      const producerName = this.producerNames[skill.userId]?.toLowerCase() || '';
      if (producerName.includes(query)) {
        score += 1.5;
      }
      
      return { ...skill, searchMatchScore: score / 3 }; // Normalize score
    }).filter(skill => skill.searchMatchScore > 0);
  }

  // Category filter
  if (this.selectedCategory !== null) {
    filtered = filtered.filter(skill => 
      skill.categoryId === this.selectedCategory
    );
  }

  // Price filter
  if (this.priceRange.min !== null) {
    filtered = filtered.filter(skill => 
      skill.price >= this.priceRange.min!
    );
  }
  if (this.priceRange.max !== null) {
    filtered = filtered.filter(skill => 
      skill.price <= this.priceRange.max!
    );
  }

  // Date filter
  if (this.selectedDateRange) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    filtered = filtered.filter(skill => {
      const skillDate = new Date(skill.streamingDate);
      
      switch (this.selectedDateRange) {
        case 'today':
          return skillDate.toDateString() === today.toDateString();
        case 'week':
          const weekEnd = new Date(today);
          weekEnd.setDate(weekEnd.getDate() + 7);
          return skillDate >= today && skillDate <= weekEnd;
        case 'month':
          const monthEnd = new Date(today);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          return skillDate >= today && skillDate <= monthEnd;
        default:
          return true;
      }
    });
  }
  if (this.selectedCategory !== null  && this.selectedCategory !== undefined) {
    const categoryId = typeof this.selectedCategory === 'string' ? 
      parseInt(this.selectedCategory) : this.selectedCategory;
    
    filtered = filtered.filter(skill => 
      skill.categoryId === categoryId
    );
  }

  // Availability filter
  if (this.selectedAvailability) {
    filtered = filtered.filter(skill => {
      const remainingSeats = skill.availableQuantity - skill.nbInscrits;
      const percentageFull = skill.nbInscrits / skill.availableQuantity;
      
      switch (this.selectedAvailability) {
        case 'available':
          return remainingSeats > 0;
        case 'lastSeats':
          return remainingSeats > 0 && percentageFull >= 0.7;
        case 'full':
          return remainingSeats === 0;
        default:
          return true;
      }
    });
  }

  // Status filter - REMOVED DUPLICATE AND FIXED
  if (this.selectedStatus) {
    filtered = filtered.filter(skill => {
      switch (this.selectedStatus) {
        case 'notReserved':
          return skill.exchangeStatus === 'available' && !skill.isUserReserved;
        case 'pending':
          return skill.exchangeStatus === 'pending';
        case 'rejected':
          return skill.exchangeStatus === 'rejected';
        default:
          return true;
      }
    });
  }

  // Apply sorting
  this.filteredSkills = this.sortSkills(filtered);
  
  // Update pagination
  this.totalPages = Math.ceil(this.filteredSkills.length / this.itemsPerPage);
  this.currentPage = 1;
  this.updatePagination();
  
  // Update active filters count
  this.updateActiveFiltersCount();
}

  private sortSkills(skills: SkillWithExchangeStatus[]): SkillWithExchangeStatus[] {
    const sorted = [...skills];
    
    switch (this.sortBy) {
      case 'dateAsc':
        return sorted.sort((a, b) => 
          new Date(a.streamingDate).getTime() - new Date(b.streamingDate).getTime()
        );
      case 'dateDesc':
        return sorted.sort((a, b) => 
          new Date(b.streamingDate).getTime() - new Date(a.streamingDate).getTime()
        );
      case 'priceAsc':
        return sorted.sort((a, b) => a.price - b.price);
      case 'priceDesc':
        return sorted.sort((a, b) => b.price - a.price);
      case 'availabilityAsc':
        return sorted.sort((a, b) => 
          (a.availableQuantity - a.nbInscrits) - (b.availableQuantity - b.nbInscrits)
        );
      case 'availabilityDesc':
        return sorted.sort((a, b) => 
          (b.availableQuantity - b.nbInscrits) - (a.availableQuantity - a.nbInscrits)
        );
      case 'nameAsc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'nameDesc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        // If search query exists, sort by search relevance
        if (this.searchQuery && sorted.some(s => s.searchMatchScore)) {
          return sorted.sort((a, b) => 
            (b.searchMatchScore || 0) - (a.searchMatchScore || 0)
          );
        }
        return sorted;
    }
  }

  applySort(): void {
    this.applyFilters();
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = null;
    this.priceRange = { min: null, max: null };
    this.selectedDateRange = '';
    this.selectedAvailability = '';
    this.selectedStatus = '';
    this.sortBy = 'dateAsc';
    this.showSuggestions = false;
    this.applyFilters();
  }

  private updateActiveFiltersCount(): void {
    let count = 0;
    if (this.searchQuery) count++;
    if (this.selectedCategory) count++;
    if (this.priceRange.min !== null || this.priceRange.max !== null) count++;
    if (this.selectedDateRange) count++;
    if (this.selectedAvailability) count++;
    if (this.selectedStatus) count++;
    this.activeFiltersCount = count;
  }

  // Pagination Methods
  updatePagination(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedSkills = this.filteredSkills.slice(startIndex, endIndex);
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.updatePagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  onItemsPerPageChange(): void {
    this.totalPages = Math.ceil(this.filteredSkills.length / this.itemsPerPage);
    this.currentPage = 1;
    this.updatePagination();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    
    if (this.totalPages <= maxPages) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (this.currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push(this.totalPages);
      } else if (this.currentPage >= this.totalPages - 2) {
        pages.push(1);
        for (let i = this.totalPages - 3; i <= this.totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push(this.currentPage - 1);
        pages.push(this.currentPage);
        pages.push(this.currentPage + 1);
        pages.push(this.totalPages);
      }
    }
    
    return pages;
  }

  // Helper Methods
  getCategoryName(categoryId: number | null): string {
  if (categoryId === null) return '';
  const category = this.categories.find(c => c.id === categoryId);
  return category?.name || 'Catégorie inconnue';
}

  getDateRangeLabel(range: string): string {
    switch (range) {
      case 'today': return "Aujourd'hui";
      case 'week': return 'Cette semaine';
      case 'month': return 'Ce mois';
      case 'custom': return 'Personnalisé';
      default: return '';
    }
  }

  getAvailabilityLabel(availability: string): string {
    switch (availability) {
      case 'available': return 'Places disponibles';
      case 'lastSeats': return 'Dernières places';
      case 'full': return 'Complet';
      default: return '';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'pending': return 'En attente';
      case 'accepted': return 'Accepté';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      case 'rejected': return 'Rejeté';
      case 'notReserved': return 'Non réservé';
      case 'available': return 'Disponible';
      default: return '';
    }
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  // Existing methods from original component
  openProducerProfile(userId: number): void {
    this.userService.getUserById(userId).subscribe({
      next: (user) => {
        this.dialog.open(UserProfileDialogComponent, {
          width: '420px',
          maxWidth: '420px',
          panelClass: 'custom-dialog-container',
          data: user
        });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors du chargement du profil', 'Fermer', { duration: 3000 });
        console.error('Erreur récupération utilisateur :', err);
      }
    });
  }

  reserveSkill(skill: SkillWithExchangeStatus): void {
    const dialogRef = this.dialog.open(ReservationConfirmationComponent, {
      width: '450px',
      disableClose: true,
      panelClass: 'reservation-confirmation-dialog',
      data: {
        title: 'Confirmer la réservation',
        skillName: skill.name,
        producerName: this.getProducerName(skill.userId),
        price: skill.price,
        date: skill.streamingDate,
        time: skill.streamingTime,
        confirmText: 'Réserver maintenant',
        cancelText: 'Annuler'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.performReservation(skill);
      }
    });
  }

  


  private async performReservation(skill: SkillWithExchangeStatus): Promise<void> {
    if (!this.receiverId) {
      this.snackBar.open('Erreur: ID utilisateur non disponible', 'Fermer', { duration: 3000 });
      return;
    }

    if (skill.nbInscrits >= skill.availableQuantity) {
      this.snackBar.open('Cette compétence n\'a plus de places disponibles', 'Fermer', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    try {
      const request = {
        producerId: skill.userId,
        receiverId: this.receiverId,
        skillId: skill.id
      };

      const response = await firstValueFrom(this.exchangeService.createExchange(request));
      this.exchanges.push(response);
      
      // Update skill status locally
      skill.exchangeStatus = 'pending';
      skill.exchangeMessage = 'Demande en attente de validation';
      skill.isUserReserved = true;
      
      this.snackBar.open('Demande de réservation envoyée avec succès', 'Fermer', { duration: 3000 });
      
      // Reload skills to update inscription count
      await this.loadSkills();
    } catch (error: any) {
      const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'envoi de la demande';
      this.snackBar.open(errorMessage, 'Fermer', { duration: 3000 });
      console.error('Erreur de réservation :', error);
    } finally {
      this.isLoading = false;
    }
  }


  getStatusColor(status?: string): string {
    switch (status) {
      case 'pending': return 'accent';
      case 'accepted': return 'primary';
      case 'in_progress': return 'primary';
      case 'completed': return 'primary';
      case 'rejected': return 'warn';
      case 'available': return '';
      default: return '';
    }
  }

canReserve(skill: SkillWithExchangeStatus): boolean {
  // L'utilisateur ne peut réserver que si:
  // 1. La compétence n'a pas de statut bloquant (pending, accepted, in_progress, completed, rejected)
  // 2. Il y a encore des places disponibles
  
  const hasBlockingStatus = ['pending', 'accepted', 'in_progress', 'completed', 'rejected'].includes(skill.exchangeStatus || '');
  
  return !hasBlockingStatus && 
         skill.nbInscrits < skill.availableQuantity;
}

showExchangeMessage(skill: SkillWithExchangeStatus): boolean {
  // Afficher le message pour tous les statuts sauf 'available' ET 'rejected'
  return !!(skill.exchangeMessage && 
           skill.exchangeStatus && 
           skill.exchangeStatus !== 'available' &&
           skill.exchangeStatus !== 'rejected');
}

  hasLivestreamSession(skill: SkillWithExchangeStatus): boolean {
    return !!this.livestreamSessions[skill.id];
  }

/**
 * Crée un objet Date en combinant la date et l'heure de streaming
 * @param streamingDate - Date au format string (ex: "2024-12-25")
 * @param streamingTime - Heure au format string (ex: "14:30:00" ou "14:30")
 * @returns Date - Objet Date combiné
 */
private createStreamingDateTime(streamingDate: string, streamingTime: string): Date {
  // Créer la date de base
  const date = new Date(streamingDate);
  
  // Parser l'heure (format attendu: "HH:mm:ss" ou "HH:mm")
  const timeParts = streamingTime.split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;
  const seconds = parseInt(timeParts[2], 10) || 0;
  
  // Définir l'heure sur la date
  date.setHours(hours, minutes, seconds, 0);
  
  return date;
}
/**
 * Vérifie si une compétence a une date/heure de streaming future
 * @param skill - La compétence à vérifier
 * @returns boolean - true si la date est future, false sinon
 */
private isSkillStreamingDateFuture(skill: Skill): boolean {
  const currentDateTime = new Date();
  const streamingDateTime = this.createStreamingDateTime(skill.streamingDate, skill.streamingTime);
  return streamingDateTime > currentDateTime;
}
}