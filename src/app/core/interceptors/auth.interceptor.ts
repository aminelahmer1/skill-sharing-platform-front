import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { KeycloakService } from '../services/keycloak.service';
import { from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakService = inject(KeycloakService);
  console.log('Intercepting request to:', req.url); 
  const authRoutes = ['/api/v1/users', '/api/v1/skills', '/api/v1/exchanges', '/api/v1/categories','/api/v1/notifications','/api/v1/livestream','/api/v1/messages'];
  const uploadRoutes = ['/Uploads', '/skill-Uploads','/message-uploads'];
  const needsAuth = authRoutes.some(route => req.url.includes(route)) 
    && !uploadRoutes.some(route => req.url.includes(route));

  if (!needsAuth) {
    return next(req);
  }

  return from(keycloakService.getToken()).pipe(
    switchMap(token => {
      if (!token) {
        console.warn('No token available for request:', req.url);
        return throwError(() => new Error('No token available'));
      }
      const authReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      return next(authReq);
    }),
    catchError(error => {
      if (error.status === 401) {
        console.log('401 Unauthorized, attempting to refresh token...');
        return from(keycloakService.refreshToken(30)).pipe(
          switchMap(refreshed => {
            if (refreshed) {
              console.log('Token refreshed successfully: true');
              return from(keycloakService.getToken()).pipe(
                switchMap(newToken => {
                  if (newToken) {
                    const authReq = req.clone({
                      setHeaders: { Authorization: `Bearer ${newToken}` }
                    });
                    return next(authReq);
                  }
                  console.error('No token available after refresh');
                  return throwError(() => new Error('Authentication failed: No token after refresh'));
                })
              );
            }
            console.log('Token refreshed successfully: false');
            return throwError(() => new Error('Authentication failed: Token refresh failed'));
          }),
          catchError(refreshError => {
            console.error('Token refresh error:', refreshError);
            return throwError(() => new Error('Authentication failed: Token refresh error'));
          })
        );
      }
      // Pass non-401 errors to the service
      console.error('Auth interceptor error:', {
        status: error.status,
        url: req.url,
        error: error.error
      });
      return throwError(() => error);
    })
  );
};