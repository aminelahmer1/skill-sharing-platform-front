import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, UrlTree } from '@angular/router';
import { KeycloakService } from '../services/keycloak.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(
    private keycloak: KeycloakService,
    private router: Router
  ) {}

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    try {
      const requiredRoles = route.data['roles'] as string[];
      const userRoles = this.keycloak.getRoles();
      console.log('RoleGuard: requiredRoles=', requiredRoles, 'userRoles=', userRoles);
      if (!requiredRoles?.length) return true;

      const hasRequiredRole = userRoles.some((role) => requiredRoles.includes(role));
      if (!hasRequiredRole) {
        console.warn('RoleGuard: Access denied, redirecting to unauthorized');
        return this.router.parseUrl('/unauthorized');
      }
      return true;
    } catch (error) {
      console.error('RoleGuard: Error', error);
      return this.router.parseUrl('/login');
    }
  }
}