import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, of, throwError, concat } from 'rxjs';
import { catchError, switchMap, reduce } from 'rxjs/operators';
import { KeycloakService } from '../keycloak.service';
import { UserProfileResponse, UserResponse, UserProfileUpdate } from '../../../models/user/user';
import { AddressUpdateRequest } from '../../../models/address-update-request';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/users';

  /**
   * 🔹 Récupérer un token valide avant chaque requête
   */
  private getValidToken(): Observable<string> {
    return from(this.keycloakService.refreshToken()).pipe(
      // Une fois le rafraîchissement effectué, récupère le token
      switchMap(() => from(this.keycloakService.getToken())),
      catchError(error => throwError(() => new Error('Échec de récupération du token')))
    );
  }
  
  
  getCurrentUserProfile(): Observable<UserProfileResponse> {
    return this.getValidToken().pipe(
      switchMap(token => {
        console.log('Token envoyé à /me :', token); // Vérifie le token
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.get<UserProfileResponse>(`${this.apiUrl}/me`, { headers });
      }),
      catchError(error => this.handleError('Erreur de récupération du profil', error))
    );
  }
  

  /**
   * 🔹 Mise à jour du profil utilisateur
   */
  updateProfile(updateData: UserProfileUpdate, keycloakId: string): Observable<UserResponse> {
    return this.getValidToken().pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        });
        
        // Correction de l'URL - utilisez le keycloakId dans le path
        return this.http.patch<UserResponse>(
          `${this.apiUrl}/${keycloakId}/profile`, 
          updateData, 
          { headers }
        );
      }),
      catchError(error => {
        console.error('Update profile error:', error);
        return throwError(() => new Error('Failed to update profile'));
      })
    );
  }
  /**
   * 🔹 Mise à jour de l'adresse utilisateur
   */
  updateAddress(updateData: AddressUpdateRequest): Observable<void> {
    return this.getValidToken().pipe(
      switchMap(token => {
        const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
        return this.http.patch<void>(`${this.apiUrl}/me/address`, updateData, { headers });
      }),
      catchError(error => this.handleError('Erreur de mise à jour de l\'adresse', error))
    );
  }

  /**
   * 🔹 Upload de la photo de profil (sans Content-Type explicite)
   */
 // In your UserService
// user.service.ts
// user.service.ts
uploadProfilePicture(file: File, keycloakId: string): Observable<UserResponse> {
  const formData = new FormData();
  formData.append('file', file);

  return this.getValidToken().pipe(
    switchMap(token => {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type - let browser set it with boundary
      });
      
      return this.http.patch<UserResponse>(
        `${this.apiUrl}/${keycloakId}/picture`,
        formData,
        { headers }
      );
    }),
    catchError(error => this.handleError('Upload failed', error))
  );
}
  /**
   * 🔹 Exécuter des mises à jour séquentielles
   */
  executeSequentialUpdates(updates: Observable<any>[]): Observable<any> {
    return concat(...updates).pipe(
      reduce((_, val) => val),
      catchError(error => {
        console.error('🔴 Erreur dans executeSequentialUpdates:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * 🔹 Gestion des erreurs HTTP
   */
  private handleError(message: string, error: any): Observable<never> {
    console.error(`🔴 ${message}:`, error);
    return throwError(() => new Error(message));
  }
}
