
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { KeycloakService } from '../services/keycloak.service';
import { from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';


export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakService = inject(KeycloakService);
  const authRoutes = ['/api/v1/users', '/api/v1/skills', '/api/v1/exchanges','/api/v1/categories'];
  const uploadRoutes = ['/uploads', '/skill-uploads'];
  const needsAuth = authRoutes.some(route => req.url.includes(route)) 
                && !uploadRoutes.some(route => req.url.includes(route));
  if (!needsAuth) {
    return next(req);
  }

  return from(keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        return throwError(() => new Error('No token available'));
      }
      
      const authReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      
      return next(authReq);
    }),
    catchError(error => {
      console.error('Auth interceptor error:', error);
      return throwError(() => new Error('Authentication failed'));
    })
  );
};