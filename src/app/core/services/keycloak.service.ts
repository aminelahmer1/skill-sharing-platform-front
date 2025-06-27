import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';
import { BehaviorSubject } from 'rxjs';

interface KeycloakProfile extends Keycloak.KeycloakProfile {
  attributes?: {
    [key: string]: string[] | undefined;
  };
}

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private keycloak: Keycloak;
  private authStatus = new BehaviorSubject<boolean>(false);
  private userProfile = new BehaviorSubject<KeycloakProfile | null>(null);
  private roles = new BehaviorSubject<string[]>([]);

  authStatus$ = this.authStatus.asObservable();
  userProfile$ = this.userProfile.asObservable();
  roles$ = this.roles.asObservable();

  constructor() {
    this.keycloak = new Keycloak({
      url: 'http://localhost:9098',
      realm: 'skill-sharing',
      clientId: 'gateway-service',
    });
  }

  async init(): Promise<void> {
    try {
      const authenticated = await this.keycloak.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/assets/silent-check-sso.html',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      });
      console.log('KeycloakService: Initialized, authenticated=', authenticated);
      if (authenticated) {
        await this.loadUserProfile();
        this.updateRoles();
        this.authStatus.next(true);
      } else {
        this.authStatus.next(false);
      }
    } catch (error) {
      console.error('KeycloakService: Initialization failed', error);
      this.authStatus.next(false);
    }
  }

  async loadUserProfile(): Promise<void> {
    try {
      const profile = await this.keycloak.loadUserProfile();
      console.log('KeycloakService: Raw profile=', profile);
      this.userProfile.next(profile as KeycloakProfile);
    } catch (error) {
      console.error('KeycloakService: Failed to load user profile', error);
      throw error;
    }
  }

  updateRoles(): void {
    const profile = this.userProfile.getValue();
    const roles = profile?.attributes?.['role'] || [];
    console.log('KeycloakService: Updated roles=', roles);
    this.roles.next(roles);
  }

  getRoles(): string[] {
    const profile = this.userProfile.getValue();
    const roles = profile?.attributes?.['role'] || [];
    console.log('KeycloakService: getRoles=', roles);
    return roles;
  }

  async isAuthenticated(): Promise<boolean> {
    const authenticated = !!this.keycloak.token;
    console.log('KeycloakService: isAuthenticated=', authenticated);
    return authenticated;
  }

  async getUserProfile(): Promise<KeycloakProfile | null> {
    return this.userProfile.getValue();
  }

  async login(redirectUri?: string): Promise<void> {
    try {
      await this.keycloak.login({
        redirectUri: redirectUri || window.location.origin,
      });
    } catch (error) {
      console.error('KeycloakService: Login failed', error);
      throw error;
    }
  }

  async register(redirectUri?: string): Promise<void> {
    try {
      await this.keycloak.login({
        redirectUri: redirectUri || window.location.origin,
        action: 'register',
      });
    } catch (error) {
      console.error('KeycloakService: Register failed', error);
      throw error;
    }
  }

  async logout(redirectUri?: string): Promise<void> {
    try {
      await this.keycloak.logout({
        redirectUri: redirectUri || window.location.origin,
      });
      localStorage.clear();
      sessionStorage.clear();
      this.authStatus.next(false);
      this.userProfile.next(null);
      this.roles.next([]);
    } catch (error) {
      console.error('KeycloakService: Logout failed', error);
      throw error;
    }
  }

async getToken(): Promise<string> {
  try {
    const minValidity = 30; // Marge de 30 secondes avant expiration
    if (!this.keycloak.token || this.keycloak.isTokenExpired(minValidity)) {
      await this.refreshToken(minValidity);
    }
    if (!this.keycloak.token) {
      throw new Error('Aucun token valide disponible');
    }
    console.log('Token obtenu :', this.keycloak.token);
    return this.keycloak.token;
  } catch (error) {
    console.error('Échec de l\'obtention du token :', error);
    throw error;
  }
}

async refreshToken(minValidity: number = 30): Promise<boolean> {
  try {
    const refreshed = await this.keycloak.updateToken(minValidity);
    console.log('Tentative de rafraîchissement du token, succès :', refreshed);
    if (refreshed) {
      await this.loadUserProfile();
      this.updateRoles();
      console.log('Token rafraîchi avec succès');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Échec du rafraîchissement du token :', error);
    return false;
  }
}

  async getUserId(): Promise<string> {
  try {
    // Utiliser directement l'ID de Keycloak
    if (this.keycloak.tokenParsed?.sub) {
      return this.keycloak.tokenParsed.sub;
    }
    
    // Fallback si nécessaire
    const token = await this.getToken();
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub;
  } catch (error) {
    console.error('Failed to get user ID:', error);
    throw error;
  }
}

  async initWithToken(token: string): Promise<void> {
    try {
      await this.keycloak.init({
        token,
        refreshToken: '',
        onLoad: 'check-sso',
        checkLoginIframe: false
      });
      
      await this.loadUserProfile();
      this.updateRoles();
      this.authStatus.next(true);
    } catch (error) {
      console.error('Token initialization failed', error);
      throw error;
    }
  }
}