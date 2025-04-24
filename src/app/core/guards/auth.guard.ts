import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { KeycloakService } from '../services/keycloak.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private keycloak: KeycloakService,
    private router: Router
  ) {}

  async canActivate(): Promise<boolean | UrlTree> {
    try {
      const isAuthenticated = await this.keycloak.isAuthenticated();
      console.log('AuthGuard: isAuthenticated=', isAuthenticated);
      if (!isAuthenticated) {
        console.log('AuthGuard: Not authenticated, redirecting to login');
        localStorage.setItem('returnUrl', this.router.url);
        await this.keycloak.login(window.location.origin);
        return this.router.parseUrl('/login');
      }
      return true;
    } catch (error) {
      console.error('AuthGuard: Error', error);
      return this.router.parseUrl('/login');
    }
  }
}