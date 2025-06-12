// core/services/skill.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Skill, SkillRequest, Category } from '../../../models/skill/skill.model';
import { KeycloakService } from '../keycloak.service';

@Injectable({ providedIn: 'root' })
export class SkillService {
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/skills';

  getMySkills(): Observable<Skill[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Skill[]>(`${this.apiUrl}/my-skills`, { headers });
      }),
      catchError(error => {
        console.error('Error fetching skills:', error);
        return throwError(() => new Error('Failed to fetch skills'));
      })
    );
  }
  getAllSkills(): Observable<Skill[]> {
    return this.http.get<Skill[]>(`${this.apiUrl}`);
  }
  

  createSkill(skill: SkillRequest): Observable<Skill> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.post<Skill>(this.apiUrl, skill, { headers });
      }),
      catchError(error => {
        console.error('Error creating skill:', error);
        return throwError(() => new Error('Failed to create skill'));
      })
    );
  }

  updateSkill(id: number, skill: SkillRequest): Observable<Skill> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<Skill>(`${this.apiUrl}/${id}`, skill, { headers });
      }),
      catchError(error => {
        console.error('Error updating skill:', error);
        return throwError(() => new Error('Failed to update skill'));
      })
    );
  }

  deleteSkill(id: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.delete<void>(`${this.apiUrl}/${id}`, { headers });
      }),
      catchError(error => {
        console.error('Error deleting skill:', error);
        return throwError(() => new Error('Failed to delete skill'));
      })
    );
  }

createSkillWithPicture(skill: SkillRequest, file: File): Observable<Skill> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const formData = new FormData();
      formData.append('skill', JSON.stringify(skill));
      formData.append('file', file);

      const headers = { 
        Authorization: `Bearer ${token}`
      };

      return this.http.post<Skill>(`${this.apiUrl}/with-picture`, formData, { headers });
    }),
    catchError(error => {
      console.error('Error creating skill with picture:', error);
      return throwError(() => new Error('Failed to create skill with picture'));
    })
  );
}

updateSkillWithPicture(id: number, skill: SkillRequest, file: File): Observable<Skill> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const formData = new FormData();
      formData.append('skill', JSON.stringify(skill));
      formData.append('file', file);

      const headers = { 
        Authorization: `Bearer ${token}`
        // Ne pas mettre Content-Type, FormData le gère automatiquement
      };

      return this.http.patch<Skill>(`${this.apiUrl}/${id}/picture`, formData, { headers });
    }),
    catchError(error => {
      console.error('Error updating skill picture:', error);
      return throwError(() => new Error('Failed to update skill picture'));
    })
  );
}

removeSkillPicture(id: number): Observable<Skill> {
  return from(this.keycloakService.getToken()).pipe(
    switchMap(token => {
      const headers = { Authorization: `Bearer ${token}` };
      return this.http.delete<Skill>(`${this.apiUrl}/${id}/picture`, { headers });
    }),
    catchError(error => {
      console.error('Error removing skill picture:', error);
      return throwError(() => new Error('Failed to remove skill picture'));
    })
  );
}
}