// new-conversation-dialog.component.ts - VERSION FINALE COMPLÈTE
import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil, debounceTime, switchMap, of } from 'rxjs';
import { MessagingService, Conversation } from '../../../core/services/messaging/messaging.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { trigger, transition, style, animate } from '@angular/animations';

interface User {
  id: number;
  name: string;
  role: string;
  avatar?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}

interface Skill {
  id: number;
  name: string;
  description?: string;
  category?: string;
}

@Component({
  selector: 'app-new-conversation-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-conversation-dialog.component.html',
  styleUrls: ['./new-conversation-dialog.component.css'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('300ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px) scale(0.95)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(30px) scale(0.95)' }))
      ])
    ]),
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class NewConversationDialogComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Input() currentUserId?: number;
  @Output() conversationCreated = new EventEmitter<Conversation>();
  @Output() cancelled = new EventEmitter<void>();

  // Configuration API
  private readonly apiUrl = 'http://localhost:8822/api/v1';

  // Type de conversation
  conversationType: 'direct' | 'group' | 'skill' = 'direct';

  // Pour conversation directe
  userSearch = '';
  searchResults: User[] = [];
  selectedUserId?: number;
  directUserId?: number;

  // Pour conversation de groupe
  groupName = '';
  participantSearch = '';
  participantSearchResults: User[] = [];
  selectedParticipants: User[] = [];

  // Pour conversation de compétence
  selectedSkillId?: number;
  availableSkills: Skill[] = [];

  // État
  isCreating = false;
  error = '';
  isLoadingSkills = false;
  isSearching = false;
  
  // Sujets pour la recherche avec debounce
  private searchSubject = new Subject<string>();
  private participantSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private messagingService: MessagingService,
    private keycloakService: KeycloakService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.setupSearch();
    this.loadUserInfo();
    this.loadAvailableSkills();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ === INITIALISATION ===

  private async loadUserInfo() {
    try {
      if (!this.currentUserId) {
        const profile = await this.keycloakService.getUserProfile();
        if (profile?.id) {
          this.currentUserId = !isNaN(Number(profile.id)) 
            ? parseInt(profile.id) 
            : this.generateNumericIdFromUUID(profile.id);
        }
      }
      console.log('✅ Current user ID for dialog:', this.currentUserId);
    } catch (error) {
      console.error('❌ Error loading user info:', error);
    }
  }

  private generateNumericIdFromUUID(uuid: string): number {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      const char = uuid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 999999 + 1;
  }

  private setupSearch() {
    // ✅ Recherche d'utilisateurs pour conversation directe
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
      switchMap(query => {
        if (!query.trim()) {
          return of([]);
        }
        return this.searchUsersApi(query);
      })
    ).subscribe({
      next: (users) => {
        this.searchResults = users;
        this.isSearching = false;
      },
      error: (error) => {
        console.error('❌ Error searching users:', error);
        this.searchResults = [];
        this.isSearching = false;
      }
    });

    // ✅ Recherche de participants pour groupe
    this.participantSearchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
      switchMap(query => {
        if (!query.trim()) {
          return of([]);
        }
        return this.searchUsersApi(query);
      })
    ).subscribe({
      next: (users) => {
        this.participantSearchResults = users.filter(user => 
          !this.selectedParticipants.find(p => p.id === user.id)
        );
        this.isSearching = false;
      },
      error: (error) => {
        console.error('❌ Error searching participants:', error);
        this.participantSearchResults = [];
        this.isSearching = false;
      }
    });
  }

  // ✅ === CHARGEMENT DES DONNÉES ===

  private async loadAvailableSkills() {
    this.isLoadingSkills = true;
    try {
      const token = await this.keycloakService.getToken();
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      this.http.get<any>(`${this.apiUrl}/skills`, { headers })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (Array.isArray(response)) {
              this.availableSkills = response;
            } else if (response.content && Array.isArray(response.content)) {
              this.availableSkills = response.content;
            } else {
              this.availableSkills = [];
            }
            
            console.log('✅ Skills loaded:', this.availableSkills.length);
            this.isLoadingSkills = false;
          },
          error: (error) => {
            console.error('❌ Error loading skills:', error);
            this.availableSkills = [
              { id: 1, name: 'Angular Development', category: 'Frontend' },
              { id: 2, name: 'Java Backend', category: 'Backend' },
              { id: 3, name: 'UI/UX Design', category: 'Design' },
              { id: 4, name: 'DevOps', category: 'Infrastructure' },
              { id: 5, name: 'Project Management', category: 'Management' }
            ];
            this.isLoadingSkills = false;
          }
        });
    } catch (error) {
      console.error('❌ Error in loadAvailableSkills:', error);
      this.isLoadingSkills = false;
    }
  }

  // ✅ === RECHERCHE D'UTILISATEURS ===

  private searchUsersApi(query: string) {
    return new Promise<User[]>((resolve) => {
      this.keycloakService.getToken().then(token => {
        const headers = new HttpHeaders({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        });

        this.http.get<any>(`${this.apiUrl}/users/search`, {
          headers,
          params: { q: query, limit: '10' }
        }).pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            let users: User[] = [];
            
            if (Array.isArray(response)) {
              users = response;
            } else if (response.content && Array.isArray(response.content)) {
              users = response.content;
            }
            
            const mappedUsers = users
              .filter(user => user.id !== this.currentUserId)
              .map(user => ({
                id: user.id,
                name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                role: user.role || 'USER',
                avatar: user.avatar || user.profilePicture,
                email: user.email
              }));
            
            resolve(mappedUsers);
          },
          error: (error) => {
            console.warn('⚠️ API search failed, using fallback:', error);
            const fallbackUsers: User[] = [
              { id: 1, name: 'Alice Martin', role: 'PRODUCER', avatar: '/assets/avatars/alice.jpg' },
              { id: 2, name: 'Bob Dupont', role: 'RECEIVER', avatar: '/assets/avatars/bob.jpg' },
              { id: 3, name: 'Charlie Brown', role: 'PRODUCER', avatar: '/assets/avatars/charlie.jpg' },
              { id: 4, name: 'Diana Prince', role: 'RECEIVER', avatar: '/assets/avatars/diana.jpg' },
              { id: 5, name: 'Eve Adams', role: 'PRODUCER', avatar: '/assets/avatars/eve.jpg' }
            ].filter(user => 
              user.name.toLowerCase().includes(query.toLowerCase()) && 
              user.id !== this.currentUserId
            );
            
            resolve(fallbackUsers);
          }
        });
      }).catch(error => {
        console.error('❌ Token error:', error);
        resolve([]);
      });
    });
  }

  // ✅ === HANDLERS DE RECHERCHE ===

  searchUsers() {
    if (this.userSearch.trim()) {
      this.isSearching = true;
      this.searchSubject.next(this.userSearch);
    } else {
      this.searchResults = [];
    }
  }

  selectUser(user: User) {
    this.selectedUserId = user.id;
    this.directUserId = user.id;
    this.userSearch = user.name;
    this.searchResults = [];
    this.error = '';
  }

  searchParticipants() {
    if (this.participantSearch.trim()) {
      this.isSearching = true;
      this.participantSearchSubject.next(this.participantSearch);
    } else {
      this.participantSearchResults = [];
    }
  }

  addParticipant(user: User) {
    if (!this.selectedParticipants.find(p => p.id === user.id)) {
      this.selectedParticipants.push(user);
      this.participantSearch = '';
      this.participantSearchResults = [];
      this.error = '';
    }
  }

  removeParticipant(participant: User) {
    this.selectedParticipants = this.selectedParticipants.filter(p => p.id !== participant.id);
  }

  // ✅ === VALIDATION ===

  canCreate(): boolean {
    switch (this.conversationType) {
      case 'direct':
        return !!this.directUserId && this.directUserId !== this.currentUserId;
      case 'group':
        return !!this.groupName.trim() && this.selectedParticipants.length > 0;
      case 'skill':
        return !!this.selectedSkillId;
      default:
        return false;
    }
  }

  // ✅ === CRÉATION DE CONVERSATIONS ===

  async createConversation() {
    if (!this.canCreate() || this.isCreating) {
      return;
    }

    this.isCreating = true;
    this.error = '';

    try {
      let conversation: Conversation | undefined;

      switch (this.conversationType) {
        case 'direct':
          conversation = await this.createDirectConversation();
          break;
        case 'group':
          conversation = await this.createGroupConversation();
          break;
        case 'skill':
          conversation = await this.createSkillConversation();
          break;
      }

      if (conversation) {
        console.log('✅ Conversation created successfully:', conversation);
        this.conversationCreated.emit(conversation);
        this.resetForm();
      }
    } catch (error: any) {
      console.error('❌ Error creating conversation:', error);
      this.handleCreationError(error);
    } finally {
      this.isCreating = false;
    }
  }

  private async createDirectConversation(): Promise<Conversation | undefined> {
    if (!this.directUserId) {
      throw new Error('Aucun utilisateur sélectionné');
    }
    return this.messagingService.createDirectConversation(this.directUserId).toPromise();
  }

  private async createGroupConversation(): Promise<Conversation | undefined> {
    if (!this.groupName.trim()) {
      throw new Error('Nom de groupe requis');
    }
    if (this.selectedParticipants.length === 0) {
      throw new Error('Au moins un participant requis');
    }
    const participantIds = this.selectedParticipants.map(p => p.id);
    return this.messagingService.createGroupConversation(this.groupName.trim(), participantIds).toPromise();
  }

  private async createSkillConversation(): Promise<Conversation | undefined> {
    if (!this.selectedSkillId) {
      throw new Error('Aucune compétence sélectionnée');
    }
    return this.messagingService.createSkillConversation(this.selectedSkillId).toPromise();
  }

  private handleCreationError(error: any) {
    if (error.status === 400) {
      if (error.error?.message?.includes('yourself')) {
        this.error = 'Vous ne pouvez pas créer une conversation avec vous-même';
      } else if (error.error?.message?.includes('already exists')) {
        this.error = 'Une conversation existe déjà avec cet utilisateur';
      } else {
        this.error = 'Données invalides';
      }
    } else if (error.status === 403) {
      this.error = 'Vous n\'êtes pas autorisé à créer cette conversation';
    } else if (error.status === 404) {
      this.error = 'Utilisateur ou compétence introuvable';
    } else {
      this.error = error.message || 'Erreur lors de la création de la conversation';
    }
  }

  // ✅ === MÉTHODES PUBLIQUES POUR LE TEMPLATE ===

  getCreateButtonText(): string {
    switch (this.conversationType) {
      case 'direct':
        return 'Créer la conversation';
      case 'group':
        return `Créer le groupe (${this.selectedParticipants.length + 1} membres)`;
      case 'skill':
        return 'Rejoindre la discussion';
      default:
        return 'Créer';
    }
  }

  getSelectedSkillName(): string {
    const skill = this.availableSkills.find(s => s.id === this.selectedSkillId);
    return skill?.name || '';
  }

  resetForm() {
    this.userSearch = '';
    this.searchResults = [];
    this.selectedUserId = undefined;
    this.directUserId = undefined;
    this.groupName = '';
    this.participantSearch = '';
    this.participantSearchResults = [];
    this.selectedParticipants = [];
    this.selectedSkillId = undefined;
    this.error = '';
  }

  close() {
    if (!this.isCreating) {
      this.cancelled.emit();
      this.resetForm();
    }
  }

  onConversationTypeChange() {
    this.resetForm();
    this.error = '';
  }

  getDefaultAvatar(name: string): string {
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
    const index = name.charCodeAt(0) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${colors[index]}"/><text x="50" y="50" font-size="40" text-anchor="middle" dy=".35em" fill="white">${initial}</text></svg>`;
  }

  getUserRoleText(role: string): string {
    switch (role.toUpperCase()) {
      case 'PRODUCER':
        return 'Producteur';
      case 'RECEIVER':
        return 'Demandeur';
      default:
        return 'Utilisateur';
    }
  }
}