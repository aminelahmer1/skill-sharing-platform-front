import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, switchMap, of, map, forkJoin } from 'rxjs';
import { MessagingService, Conversation, UserResponse, Participant  } from '../../../core/services/messaging/messaging.service';
import { KeycloakService } from '../../../core/services/keycloak.service';
import { trigger, transition, style, animate } from '@angular/animations';

interface ExtendedConversation extends Conversation {
  skillName?: string;
  skillDescription?: string;
}


interface ExtendedUserResponse extends UserResponse {
  pictureUrl?: string;
}

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  pictureUrl?: string;
  profileImageUrl?: string;
  avatar?: string;
  roles?: string[];
  city?: string;
  country?: string;
  phoneNumber?: string;
  createdAt?: string;
  bio?: string;
  name: string; 
  role: string; 
}


interface Skill {
  id: number;
  name: string;
  description?: string;
  category?: string;
  participantsCount?: number;
  producer?: User;
  receivers?: User[];
}

//  Interface pour les données de compétences enrichies
interface EnrichedSkillData {
  skillId: number;
  skillName: string;
  skillDescription?: string;
  skillProducer: UserResponse;
  receivers: UserResponse[];
  userRole: 'PRODUCER' | 'RECEIVER';
  stats: {
    totalReceivers: number;
    totalUsers: number;
    statusBreakdown: { [key: string]: number };
  };
}

//  Interface pour la réponse /my-skills/users
interface MySkillsUsersResponse {
  currentUser: UserResponse;
  userPrimaryRole: 'PRODUCER' | 'RECEIVER';
  skills: EnrichedSkillData[];
  globalStats: {
    totalSkills: number;
    totalUsers: number;
    totalProducers: number;
    totalReceivers: number;
    statusBreakdown: { [key: string]: number };
  };
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
  
  //  Données enrichies des compétences
  mySkillsData?: MySkillsUsersResponse;
  selectedSkillData?: EnrichedSkillData;
  skillParticipants: User[] = [];

  // État
  isCreating = false;
  error = '';
  isLoadingSkills = false;
  isSearching = false;
  currentUserRole?: string;
  availableUsers: User[] = [];
  
  // Sujets pour la recherche avec debounce
  private searchSubject = new Subject<string>();
  private participantSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private messagingService: MessagingService,
    private keycloakService: KeycloakService
  ) {}

  ngOnInit() {
    this.setupSearch();
    this.loadUserInfo();
    this.loadAvailableUsers();
    this.loadMySkillsData(); //  Charger les données enrichies
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== INITIALISATION =====

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

      const roles = this.keycloakService.getRoles();
      this.currentUserRole = roles.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER';
      
      console.log('✅ Current user info for dialog:', {
        userId: this.currentUserId,
        role: this.currentUserRole
      });
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
    // Recherche d'utilisateurs pour conversation directe
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
      switchMap(query => {
        if (!query.trim()) {
          return of([]);
        }
        return this.searchUsersForDirectConversation(query);
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

    // Recherche de participants pour groupe
    this.participantSearchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
      switchMap(query => {
        if (!query.trim()) {
          return of([]);
        }
        return this.searchUsersForGroupConversation(query);
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

  //  Charger les données enrichies depuis /my-skills/users
  private loadMySkillsData() {
    this.isLoadingSkills = true;
    console.log('🔄 Loading enriched skills data from /my-skills/users');
    
    this.messagingService.getUserSkillsWithUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: MySkillsUsersResponse) => {
          this.mySkillsData = data;
          
          // Transformer les données pour le sélecteur de compétences
          this.availableSkills = data.skills.map(skill => ({
            id: skill.skillId,
            name: skill.skillName,
            description: skill.skillDescription,
            participantsCount: skill.stats.totalUsers,
            producer: this.mapUserResponseToUser(skill.skillProducer),
            receivers: skill.receivers.map(r => this.mapUserResponseToUser(r))
          }));
          
          console.log('✅ Enriched skills loaded:', {
            role: data.userPrimaryRole,
            skillsCount: data.skills.length,
            totalUsers: data.globalStats.totalUsers
          });
          
          this.isLoadingSkills = false;
        },
        error: (error: any) => {
          console.error('❌ Error loading enriched skills:', error);
          this.availableSkills = this.getFallbackSkills();
          this.isLoadingSkills = false;
        }
      });
  }

  // ===== CHARGEMENT DES DONNÉES =====

  private loadAvailableUsers() {
    console.log('🔄 Loading available users for role:', this.currentUserRole);
    
    this.messagingService.getAvailableUsersForConversation('direct')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.availableUsers = users.map(user => this.mapUserResponseToUser(user));
          console.log('✅ Available users loaded:', this.availableUsers.length);
        },
        error: (error) => {
          console.error('❌ Error loading available users:', error);
          this.availableUsers = this.getFallbackUsers();
        }
      });
  }

  // ===== HANDLERS DE SÉLECTION DE COMPÉTENCE =====

  //  Handler amélioré pour la sélection de compétence
  onSkillSelected() {
    if (!this.selectedSkillId || !this.mySkillsData) {
      this.skillParticipants = [];
      this.selectedSkillData = undefined;
      return;
    }

    // Trouver les données de la compétence sélectionnée
    const skillData = this.mySkillsData.skills.find(s => s.skillId === this.selectedSkillId);
    
    if (skillData) {
      this.selectedSkillData = skillData;
      
      // Préparer la liste des participants (producteur + receivers) en excluant l'utilisateur actuel
      const participants: User[] = [];
      
      // Ajouter le producteur si ce n'est pas l'utilisateur actuel
      if (skillData.skillProducer.id !== this.currentUserId) {
        participants.push(this.mapUserResponseToUser(skillData.skillProducer));
      }
      
      // Ajouter les receivers (exclure self)
      skillData.receivers
        .filter(receiver => receiver.id !== this.currentUserId)
        .forEach(receiver => {
          participants.push(this.mapUserResponseToUser(receiver));
        });
      
      this.skillParticipants = participants;
      
      console.log('📋 Skill selected:', {
        skillId: this.selectedSkillId,
        skillName: skillData.skillName,
        participantsCount: participants.length,
        userRole: skillData.userRole
      });
    }
    
    this.error = '';
  }

  // ===== RECHERCHE D'UTILISATEURS =====

  private searchUsersForDirectConversation(query: string) {
    // Recherche locale d'abord pour performance
    const localResults = this.availableUsers.filter(user => 
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    if (localResults.length > 0) {
      return of(localResults);
    }

    // Recherche via API si pas de résultats locaux
    return this.messagingService.getAvailableUsersForConversation('direct').pipe(
      map(users => users
        .filter(user => 
          user.firstName?.toLowerCase().includes(query.toLowerCase()) ||
          user.lastName?.toLowerCase().includes(query.toLowerCase()) ||
          user.username?.toLowerCase().includes(query.toLowerCase()) ||
          user.email?.toLowerCase().includes(query.toLowerCase())
        )
        .map(user => this.mapUserResponseToUser(user))
        .slice(0, 10)
      )
    );
  }

  private searchUsersForGroupConversation(query: string) {
    const localResults = this.availableUsers.filter(user => 
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    if (localResults.length > 0) {
      return of(localResults);
    }

    return this.messagingService.getAvailableUsersForConversation('group').pipe(
      map(users => users
        .filter(user => 
          user.firstName?.toLowerCase().includes(query.toLowerCase()) ||
          user.lastName?.toLowerCase().includes(query.toLowerCase()) ||
          user.username?.toLowerCase().includes(query.toLowerCase()) ||
          user.email?.toLowerCase().includes(query.toLowerCase())
        )
        .map(user => this.mapUserResponseToUser(user))
        .slice(0, 10)
      )
    );
  }

 

  // ===== HANDLERS DE RECHERCHE =====

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

  // ===== GESTIONNAIRE DE CHANGEMENT DE TYPE =====

  onConversationTypeChange() {
    this.resetForm();
    this.error = '';
    
    if (this.conversationType === 'direct' || this.conversationType === 'group') {
      this.loadAvailableUsers();
    } else if (this.conversationType === 'skill') {
      if (!this.mySkillsData) {
        this.loadMySkillsData();
      }
    }
  }

  // ===== VALIDATION =====

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

  // ===== CRÉATION DE CONVERSATIONS =====

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
  
  console.log('🚀 Creating skill conversation:', {
    skillId: this.selectedSkillId,
    currentUserId: this.currentUserId
  });
  
  try {
    const conversation = await this.messagingService
      .createSkillConversation(this.selectedSkillId)
      .toPromise();
    
    if (conversation) {
      console.log('✅ Skill conversation created successfully:', conversation);
      
      // ✅ S'assurer que l'événement est bien émis
      return conversation;
    }
    
    return undefined;
    
  } catch (error) {
    console.error('❌ Error creating skill conversation:', error);
    throw error;
  }
}

  private handleCreationError(error: any) {
    if (error.status === 400) {
      if (error.error?.message?.includes('yourself')) {
        this.error = 'Vous ne pouvez pas créer une conversation avec vous-même';
      } else if (error.error?.message?.includes('not connected')) {
        this.error = 'Vous n\'êtes pas connecté avec cet utilisateur';
      } else if (error.error?.message?.includes('not authorized')) {
        this.error = 'Vous n\'êtes pas autorisé à accéder à cette compétence';
      } else if (error.error?.message?.includes('cannot be added')) {
        this.error = 'Certains participants ne peuvent pas être ajoutés à ce groupe';
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

  // ===== MÉTHODES PUBLIQUES POUR LE TEMPLATE =====

  getCreateButtonText(): string {
    switch (this.conversationType) {
      case 'direct':
        return 'Créer la conversation';
      case 'group':
        return `Créer le groupe (${this.selectedParticipants.length + 1} membres)`;
      case 'skill':
        if (this.selectedSkillData) {
          return `Rejoindre la discussion (${this.selectedSkillData.stats.totalUsers} participants)`;
        }
        return 'Rejoindre la discussion';
      default:
        return 'Créer';
    }
  }

  getSelectedSkillName(): string {
    if (this.selectedSkillData) {
      return this.selectedSkillData.skillName;
    }
    const skill = this.availableSkills.find(s => s.id === this.selectedSkillId);
    return skill?.name || '';
  }

  getSelectedSkillDescription(): string {
    if (this.selectedSkillData) {
      return this.selectedSkillData.skillDescription || 'Discussion autour de cette compétence';
    }
    const skill = this.availableSkills.find(s => s.id === this.selectedSkillId);
    return skill?.description || 'Discussion autour de cette compétence';
  }

  //  Obtenir les informations détaillées de la compétence sélectionnée
  getSelectedSkillInfo(): string {
    if (!this.selectedSkillData) {
      return '';
    }
    
    const role = this.selectedSkillData.userRole;
    const stats = this.selectedSkillData.stats;
    
    if (role === 'PRODUCER') {
      return `${stats.totalReceivers} participant${stats.totalReceivers > 1 ? 's' : ''} inscrit${stats.totalReceivers > 1 ? 's' : ''}`;
    } else {
      return `Animée par ${this.selectedSkillData.skillProducer.firstName} ${this.selectedSkillData.skillProducer.lastName}`;
    }
  }

  //  Obtenir la liste formatée des participants
  getSkillParticipantsList(): string {
    if (!this.skillParticipants || this.skillParticipants.length === 0) {
      return 'Vous serez le premier participant';
    }
    
    const names = this.skillParticipants.slice(0, 3).map(p => p.name);
    if (this.skillParticipants.length > 3) {
      names.push(`et ${this.skillParticipants.length - 3} autre${this.skillParticipants.length - 3 > 1 ? 's' : ''}`);
    }
    
    return names.join(', ');
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
    this.selectedSkillData = undefined;
    this.skillParticipants = [];
    this.error = '';
  }

  close() {
    if (!this.isCreating) {
      this.cancelled.emit();
      this.resetForm();
    }
  }

  // ===== MÉTHODES UTILITAIRES =====

  getDefaultAvatar(name: string): string {
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
    const index = name.charCodeAt(0) % colors.length;
    const initial = name.charAt(0).toUpperCase();
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${colors[index]}"/><text x="50" y="50" font-size="40" text-anchor="middle" dy=".35em" fill="white">${initial}</text></svg>`;
  }

etUserRoleText(user: User): string {
  if (user.roles?.includes('PRODUCER')) return 'Producteur';
  if (user.roles?.includes('RECEIVER')) return 'Demandeur';
  return user.role || 'Utilisateur';
}

  getConversationTypeInfo(): { [key: string]: { title: string; description: string; availableUsers: number } } {
    return {
      direct: {
        title: 'Message direct',
        description: this.currentUserRole === 'PRODUCER' 
          ? 'Conversation privée avec vos abonnés'
          : 'Conversation privée avec les membres de votre communauté',
        availableUsers: this.availableUsers.length
      },
      group: {
        title: 'Groupe',
        description: this.currentUserRole === 'PRODUCER'
          ? 'Groupe avec plusieurs de vos abonnés'
          : 'Groupe avec plusieurs membres de votre communauté',
        availableUsers: this.availableUsers.length
      },
      skill: {
        title: 'Compétence',
        description: this.currentUserRole === 'PRODUCER'
          ? 'Discussion avec tous les participants de vos compétences'
          : 'Discussion avec tous les participants des compétences auxquelles vous êtes inscrit',
        availableUsers: this.availableSkills.length
      }
    };
  }

  isConversationTypeAvailable(type: 'direct' | 'group' | 'skill'): boolean {
    switch (type) {
      case 'direct':
      case 'group':
        return this.availableUsers.length > 0;
      case 'skill':
        return this.availableSkills.length > 0;
      default:
        return false;
    }
  }

  getHelpMessage(): string {
    if (!this.currentUserRole) {
      return 'Chargement...';
    }

    switch (this.conversationType) {
      case 'direct':
        return this.currentUserRole === 'PRODUCER'
          ? 'Vous pouvez créer des conversations directes avec vos abonnés.'
          : 'Vous pouvez créer des conversations directes avec les membres de votre communauté.';
      case 'group':
        return this.currentUserRole === 'PRODUCER'
          ? 'Créez un groupe avec plusieurs de vos abonnés pour des discussions collectives.'
          : 'Créez un groupe avec plusieurs membres de votre communauté.';
      case 'skill':
        return this.currentUserRole === 'PRODUCER'
          ? 'Rejoignez les discussions de vos compétences avec tous les participants.'
          : 'Rejoignez les discussions des compétences auxquelles vous êtes inscrit.';
      default:
        return '';
    }
  }

  hasFormData(): boolean {
    switch (this.conversationType) {
      case 'direct':
        return !!this.userSearch || !!this.selectedUserId;
      case 'group':
        return !!this.groupName || this.selectedParticipants.length > 0 || !!this.participantSearch;
      case 'skill':
        return !!this.selectedSkillId;
      default:
        return false;
    }
  }

  getFormStats(): { [key: string]: any } {
    return {
      conversationType: this.conversationType,
      userRole: this.currentUserRole,
      availableUsers: this.availableUsers.length,
      availableSkills: this.availableSkills.length,
      selectedParticipants: this.selectedParticipants.length,
      canCreate: this.canCreate(),
      isCreating: this.isCreating,
      hasError: !!this.error,
      enrichedData: !!this.mySkillsData
    };
  }

  // ===== FALLBACK DATA =====

  private getFallbackUsers(): User[] {
  return [
    { 
      id: 1, 
      username: 'alice.martin', 
      firstName: 'Alice', 
      lastName: 'Martin', 
      email: 'alice@example.com', 
      name: 'Alice Martin', 
      role: 'PRODUCER', 
      pictureUrl: '/assets/avatars/alice.jpg' 
    },
    { 
      id: 2, 
      username: 'bob.dupont', 
      firstName: 'Bob', 
      lastName: 'Dupont', 
      email: 'bob@example.com', 
      name: 'Bob Dupont', 
      role: 'RECEIVER', 
      pictureUrl: '/assets/avatars/bob.jpg' 
    },
    { 
      id: 3, 
      username: 'charlie.brown', 
      firstName: 'Charlie', 
      lastName: 'Brown', 
      email: 'charlie@example.com', 
      name: 'Charlie Brown', 
      role: 'PRODUCER', 
      pictureUrl: '/assets/avatars/charlie.jpg' 
    },
    { 
      id: 4, 
      username: 'diana.prince', 
      firstName: 'Diana', 
      lastName: 'Prince', 
      email: 'diana@example.com', 
      name: 'Diana Prince', 
      role: 'RECEIVER', 
      pictureUrl: '/assets/avatars/diana.jpg' 
    },
    { 
      id: 5, 
      username: 'eve.adams', 
      firstName: 'Eve', 
      lastName: 'Adams', 
      email: 'eve@example.com', 
      name: 'Eve Adams', 
      role: 'PRODUCER', 
      pictureUrl: '/assets/avatars/eve.jpg' 
    }
  ].filter(user => user.id !== this.currentUserId);
}


  private getFallbackSkills(): Skill[] {
    return [
      { id: 1, name: 'Angular Development', category: 'Frontend', participantsCount: 5 },
      { id: 2, name: 'Java Backend', category: 'Backend', participantsCount: 3 },
      { id: 3, name: 'UI/UX Design', category: 'Design', participantsCount: 7 },
      { id: 4, name: 'DevOps Practices', category: 'Infrastructure', participantsCount: 4 },
      { id: 5, name: 'Machine Learning Basics', category: 'AI', participantsCount: 6 }
    ];
  }
  getUserAvatar(user: User): string {
  return user.pictureUrl || user.profileImageUrl || user.avatar || this.generateDefaultAvatar(user.name || '');
}

private generateDefaultAvatar(name: string): string {
  if (!name || name.trim() === '') {
    return 'assets/default-avatar.png';
  }
  
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
  const colorIndex = Math.abs(name.charCodeAt(0)) % colors.length;
  const initial = name.charAt(0).toUpperCase();
  
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${colors[colorIndex]}"/><text x="50" y="50" font-size="35" text-anchor="middle" dy=".35em" fill="white" font-family="Arial">${initial}</text></svg>`;
}

// ✅ Correction pour mapper correctement les données
private mapUserResponseToUser(userResponse: any): User {
  const user = userResponse as any;
  
  return {
    id: user.id || user.userId,
    username: user.username || user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email,
    pictureUrl: this.extractPictureUrl(user),
    avatar: this.extractPictureUrl(user),
    roles: user.roles || [],
    city: user.city,
    country: user.country,
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt,
    bio: user.bio,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.name,
    role: user.roles?.includes('PRODUCER') ? 'PRODUCER' : 'RECEIVER'
  };
}

// Corriger extractPictureUrl() :
private extractPictureUrl(user: any): string {
  return user.pictureUrl || user.profileImageUrl || user.avatar || null;
}
}