// src/app/auth/resend-verification/resend-verification.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-resend-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resend-verification.component.html',
  styleUrls: ['./resend-verification.component.css'],
})
export class ResendVerificationComponent implements OnInit {
  email = '';
  error: string | null = null;
  success: string | null = null;
  loading = false;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    const state = history.state;
    if (state?.email) {
      this.email = state.email;
    }
  }

  async onResend(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.success = null;

    try {
      const response = await this.http
        .post(
          'http://localhost:8822/api/v1/users/resend-verification',
          {},
          { params: { email: this.email } }
        )
        .toPromise();
      this.success = 'Email de vérification renvoyé avec succès.';
    } catch (error: any) {
      this.error = error.error?.message || 'Erreur lors du renvoi.';
    } finally {
      this.loading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}