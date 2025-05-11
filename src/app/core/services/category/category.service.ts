// core/services/category.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Category } from '../../../models/skill/skill.model';
import { KeycloakService } from '../keycloak.service';


@Injectable({ providedIn: 'root' })
export class CategoryService {
  [x: string]: any;
  private http = inject(HttpClient);
  private keycloakService = inject(KeycloakService);
  private apiUrl = 'http://localhost:8822/api/v1/categories';

  getAllCategories(): Observable<Category[]> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Category[]>(`${this.apiUrl}/all`, { headers });
      }),
      catchError(error => {
        console.error('Error fetching categories:', error);
        return throwError(() => new Error('Failed to fetch categories'));
      })
    );
  }

  getCategoryById(id: number): Observable<Category> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.get<Category>(`${this.apiUrl}/${id}`, { headers });
      }),
      catchError(error => {
        console.error('Error fetching category:', error);
        return throwError(() => new Error('Failed to fetch category'));
      })
    );
  }

  createCategory(category: Category): Observable<Category> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.post<Category>(this.apiUrl, category, { headers });
      }),
      catchError(error => {
        console.error('Error creating category:', error);
        return throwError(() => new Error('Failed to create category'));
      })
    );
  }

  updateCategory(id: number, category: Category): Observable<Category> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.put<Category>(`${this.apiUrl}/${id}`, category, { headers });
      }),
      catchError(error => {
        console.error('Error updating category:', error);
        return throwError(() => new Error('Failed to update category'));
      })
    );
  }

  deleteCategory(id: number): Observable<void> {
    return from(this.keycloakService.getToken()).pipe(
      switchMap(token => {
        const headers = { Authorization: `Bearer ${token}` };
        return this.http.delete<void>(`${this.apiUrl}/${id}`, { headers });
      }),
      catchError(error => {
        console.error('Error deleting category:', error);
        return throwError(() => new Error('Failed to delete category'));
      })
    );
  }
}