import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ExchangeService, ExchangeResponse } from '../../../core/services/Exchange/exchange.service';
import { UserService } from '../../../core/services/User/user.service';
import { LivestreamService } from '../../../core/services/LiveStream/livestream.service';
import { SkillResponse } from '../../../core/services/Exchange/exchange.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserProfileDialogComponent } from '../user-profile-dialog/user-profile-dialog.component';
import { CommonModule, SlicePipe, DatePipe, DecimalPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { LivestreamSession } from '../../../models/LivestreamSession/livestream-session';
import { RatingDisplayComponent } from '../../RatingDisplay/rating-display/rating-display.component';

// ⚡ OPTIMISATION - RxJS imports pour performance ultra-rapide
import { forkJoin, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

interface SkillWithExchange extends SkillResponse {
  exchangeStatus: string; // Required for finished skills
  exchangeId: number;     // Required for finished skills
  showFullDescription?: boolean;
  sessionData?: LivestreamSession;
  producerName?: string;
}

@Component({
  selector: 'app-finished-skills',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressBarModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatButtonModule,
    MatChipsModule,
    MatPaginatorModule,
    MatSelectModule,
    MatFormFieldModule,
    RatingDisplayComponent,
    SlicePipe,
    DatePipe,
    DecimalPipe
  ],
  templateUrl: './finished-skills.component.html',
  styleUrls: ['./finished-skills.component.css']
})
export class FinishedSkillsComponent implements OnInit {
  // 📊 Données principales
  allSkills: SkillWithExchange[] = []; // Toutes les compétences chargées
  skills: SkillWithExchange[] = [];    // Compétences affichées (page actuelle)
  sessions: { [skillId: number]: LivestreamSession } = {};
  producerNames: { [key: number]: string } = {};
  
  // 🎯 État de l'interface
  isLoading = true;
  error: string | null = null;
  
  // 📄 Configuration pagination
  currentPage = 0;
  pageSize = 6; // 6 compétences par page pour un affichage optimal
  pageSizeOptions = [3, 6, 9, 12, 18];
  totalItems = 0;

  constructor(
    private exchangeService: ExchangeService,
    private userService: UserService,
    private livestreamService: LivestreamService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFinishedSkillsUltraFast();
  }

  // ⚡ ULTRA FAST: Load all data as fast as possible with pagination
  loadFinishedSkillsUltraFast(): void {
    this.isLoading = true;
    this.error = null;
    
    const startTime = Date.now();

    // ⚡ SUPER OPTIMIZED: Get everything in one mega-parallel call
    const exchangesCall = this.exchangeService.getUserExchanges().pipe(
      map(exchanges => exchanges.filter(ex => ex.status === 'COMPLETED')), // Filter immediately
      catchError(() => of([]))
    );

    const skillsCall = this.exchangeService.getAcceptedSkills().pipe(
      catchError(() => of([]))
    );

    // Execute both calls simultaneously and process immediately
    forkJoin([exchangesCall, skillsCall]).subscribe({
      next: ([finishedExchanges, allSkills]) => {
        // Early exit if no finished exchanges
        if (finishedExchanges.length === 0) {
          this.allSkills = [];
          this.skills = [];
          this.totalItems = 0;
          this.isLoading = false;
          console.log('⚡ Aucune compétence terminée - affichage immédiat');
          return;
        }

        // Process everything in one mega-parallel operation
        this.processMegaParallel(finishedExchanges, allSkills, startTime);
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement';
        this.isLoading = false;
        console.error('Erreur:', err);
      }
    });
  }

  // ⚡ MEGA PARALLEL: Process everything at once with maximum efficiency
  private processMegaParallel(
    finishedExchanges: ExchangeResponse[],
    allSkills: SkillResponse[],
    startTime: number
  ): void {
    // Create exchange lookup map for O(1) access
    const exchangeMap = new Map(finishedExchanges.map(ex => [ex.skillId, ex]));
    
    // Filter and map skills in single pass with exchange data
    const relevantSkills: SkillWithExchange[] = allSkills
      .map(skill => {
        const exchange = exchangeMap.get(skill.id);
        return exchange ? {
          ...skill,
          exchangeStatus: exchange.status,
          exchangeId: exchange.id,
          showFullDescription: false
        } as SkillWithExchange : null;
      })
      .filter((skill): skill is SkillWithExchange => skill !== null);

    if (relevantSkills.length === 0) {
      this.allSkills = [];
      this.skills = [];
      this.totalItems = 0;
      this.isLoading = false;
      console.log('⚡ Aucune compétence correspondante - affichage immédiat');
      return;
    }

    // ⚡ PAGINATION OPTIMIZATION: Load only first page data initially
    this.allSkills = relevantSkills;
    this.totalItems = relevantSkills.length;
    
    // Get skills for first page
    const firstPageSkills = this.getPageSkills(0);
    
    // Load only data needed for first page
    this.loadPageDataOptimized(firstPageSkills, startTime);
  }

  // ⚡ OPTIMIZED PAGE DATA LOADING: Load only what's needed for current page
  private loadPageDataOptimized(pageSkills: SkillWithExchange[], startTime: number): void {
    // Get unique user IDs for current page only
    const userIds = [...new Set(pageSkills.map(skill => skill.userId))];
    
    // ⚡ OPTIMIZED BATCH: Load only current page data
    const optimizedCalls = [
      // Load only users needed for current page
      ...userIds.map(userId => 
        this.userService.getUserById(userId).pipe(
          catchError(() => of({ id: userId, firstName: 'Utilisateur', lastName: 'inconnu' })),
          map(user => ({ type: 'user', userId, data: user }))
        )
      ),
      // Load only sessions needed for current page
      ...pageSkills.map(skill =>
        this.livestreamService.getSessionBySkillId(skill.id).pipe(
          catchError(() => of(null)),
          map(session => ({ type: 'session', skillId: skill.id, data: session }))
        )
      )
    ];

    // Execute optimized calls for current page only
    forkJoin(optimizedCalls).subscribe({
      next: (results) => {
        this.applyPageResults(pageSkills, results, startTime);
      },
      error: () => {
        // Even if additional data fails, show skills immediately
        this.skills = pageSkills;
        this.isLoading = false;
        console.log('⚡ Affichage immédiat avec données de base');
      }
    });
  }

  // ⚡ INSTANT PAGE RESULTS: Apply results for current page
  private applyPageResults(pageSkills: SkillWithExchange[], results: any[], startTime: number): void {
    // Create ultra-fast lookup maps
    const userMap = new Map();
    const sessionMap = new Map();

    // Process results in single pass
    results.forEach(result => {
      if (result.type === 'user') {
        const fullName = `${result.data.firstName} ${result.data.lastName}`;
        userMap.set(result.userId, fullName);
        this.producerNames[result.userId] = fullName;
      } else if (result.type === 'session') {
        if (result.data && result.data.status === 'COMPLETED') {
          sessionMap.set(result.skillId, result.data);
        }
      }
    });

    // Apply all data to page skills in single loop
    pageSkills.forEach(skill => {
      skill.producerName = userMap.get(skill.userId) || 'Chargement...';
      const session = sessionMap.get(skill.id);
      if (session) {
        skill.sessionData = session;
        this.sessions[skill.id] = session;
      }
    });

    // Apply page results
    this.skills = pageSkills;
    this.isLoading = false;

    const totalTime = Date.now() - startTime;
    console.log(`⚡ MEGA OPTIMIZED avec PAGINATION: ${pageSkills.length}/${this.totalItems} compétences en ${totalTime}ms`);
    
    this.snackBar.open(
      `Page 1/${this.getTotalPages()}: ${pageSkills.length} compétences chargées en ${totalTime}ms`, 
      'Fermer', 
      { duration: 1500 }
    );
  }

  // 📄 PAGINATION METHODS

  /**
   * 🎯 Get skills for specific page
   */
  private getPageSkills(pageIndex: number): SkillWithExchange[] {
    const startIndex = pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.allSkills.slice(startIndex, endIndex);
  }

  /**
   * 📄 Handle page change event
   */
  onPageChange(event: any): void {
    const newPage = event.pageIndex;
    const newPageSize = event.pageSize;
    
    // Update pagination settings
    this.currentPage = newPage;
    if (newPageSize !== this.pageSize) {
      this.pageSize = newPageSize;
      this.currentPage = 0; // Reset to first page when page size changes
    }
    
    this.loadCurrentPage();
  }

  /**
   * ⚡ Load current page data efficiently
   */
  private loadCurrentPage(): void {
    const startTime = Date.now();
    const pageSkills = this.getPageSkills(this.currentPage);
    
    // Show page skills immediately, then load additional data
    this.skills = pageSkills;
    
    // Load additional data for new skills only (not already cached)
    const newSkills = pageSkills.filter(skill => !skill.producerName || skill.producerName === 'Chargement...');
    
    if (newSkills.length > 0) {
      this.loadPageDataOptimized(newSkills, startTime);
    } else {
      // All data already cached
      const totalTime = Date.now() - startTime;
      console.log(`⚡ Page ${this.currentPage + 1} chargée depuis le cache en ${totalTime}ms`);
    }
  }

  /**
   * 📊 Get total number of pages
   */
  getTotalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  /**
   * 📄 Get current page info for display
   */
  getCurrentPageInfo(): string {
    const startItem = this.currentPage * this.pageSize + 1;
    const endItem = Math.min((this.currentPage + 1) * this.pageSize, this.totalItems);
    return `${startItem}-${endItem} sur ${this.totalItems}`;
  }

  // 🚀 EXISTING METHODS (optimized)
  
  openProducerProfile(userId: number): void {
    // Use cached producer data if available
    if (this.producerNames[userId] && this.producerNames[userId] !== 'Chargement...') {
      this.userService.getUserById(userId).subscribe({
        next: (user) => this.dialog.open(UserProfileDialogComponent, { 
          width: '420px',
          maxWidth: '420px',
          panelClass: 'custom-dialog-container',
          data: user 
        }),
        error: (err) => {
          this.snackBar.open('Erreur lors du chargement du profil', 'Fermer', { duration: 3000 });
          console.error('Erreur récupération utilisateur :', err);
        }
      });
    } else {
      this.snackBar.open('Profil en cours de chargement...', 'Fermer', { duration: 2000 });
    }
  }

  getProducerName(userId: number): string {
    return this.producerNames[userId] || 'Chargement...';
  }

  onRatingUpdated(skill: SkillWithExchange): void {
    console.log(`✅ Rating mis à jour pour la compétence ${skill.name}`);
    
    this.snackBar.open('Évaluation enregistrée avec succès', 'Fermer', {
      duration: 2000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: ['success-snackbar']
    });
  }

  getStatusColor(status: string): string {
    return status === 'COMPLETED' ? 'primary' : '';
  }

  getStatusLabel(status: string): string {
    return status === 'COMPLETED' ? 'Terminé' : status;
  }

  toggleDescription(skill: SkillWithExchange): void {
    skill.showFullDescription = !skill.showFullDescription;
  }

  hasCompletedSession(skillId: number): boolean {
    return this.sessions[skillId]?.status === 'COMPLETED';
  }

  getTotalCompletedSkills(): number {
    return this.totalItems;
  }

  /**
   * 🎯 TrackBy function for ngFor optimization
   */
  trackBySkillId(index: number, skill: SkillWithExchange): number {
    return skill.id;
  }
}