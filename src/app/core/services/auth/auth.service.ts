import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = 'http://localhost:8822/api/v1/auth';
  private userSubject = new BehaviorSubject<any>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { username: email, password }).pipe(
      tap((response: any) => {
        localStorage.setItem('access_token', response.token);
        this.fetchUserProfile();
      })
    );
  }

 

  resendVerification(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-verification`, { email });
  }

  private fetchUserProfile(): void {
    this.http.get('http://localhost:8822/api/v1/users/me').subscribe({
      next: (user) => this.userSubject.next(user),
      error: (err) => console.error('Failed to fetch user profile', err)
    });
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getRoles(): string[] {
    const user = this.userSubject.value;
    return user?.roles || [];
  }
}