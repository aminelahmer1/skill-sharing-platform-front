import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { KeycloakService } from '../keycloak.service';

export interface RecordingStatus {
  isRecording: boolean;
  startTime?: Date;
  duration?: number;
  recordingId?: string;
}

export interface RecordingResponse {
  recordingId: string;
  sessionId: number;
  status: string;
  startTime: Date;
  endTime?: Date;
  downloadUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RecordingService {
  private readonly API_URL = 'http://localhost:8822/api/v1/livestream';
  private recordingStatusSubject = new BehaviorSubject<RecordingStatus>({ isRecording: false });
  public recordingStatus$ = this.recordingStatusSubject.asObservable();
  
  private recordingTimer?: any;

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

   async startRecording(sessionId: number): Promise<Observable<RecordingResponse>> {
    const token = await this.keycloakService.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    
    const request = {
      format: 'mp4',
      quality: 'high',
      includeChat: true
    };

    return new Observable(observer => {
      this.http.post<RecordingResponse>(
        `${this.API_URL}/${sessionId}/recording/start`,
        request,
        { headers }
      ).subscribe({
        next: (response) => {
          this.startRecordingTimer();
          this.recordingStatusSubject.next({
            isRecording: true,
            startTime: new Date(response.startTime),
            recordingId: response.recordingId
          });
          observer.next(response);
          observer.complete();
        },
        error: (error) => {
          observer.error(error);
        }
      });
    });
  }

   async stopRecording(sessionId: number): Promise<Observable<void>> {
    const token = await this.keycloakService.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    return new Observable(observer => {
      this.http.post<void>(
        `${this.API_URL}/${sessionId}/recording/stop`,
        {},
        { headers }
      ).subscribe({
        next: () => {
          this.stopRecordingTimer();
          this.recordingStatusSubject.next({ isRecording: false });
          observer.next();
          observer.complete();
        },
        error: (error) => {
          observer.error(error);
        }
      });
    });
  }

   async getRecordingStatus(sessionId: number): Promise<Observable<RecordingResponse>> {
    const token = await this.keycloakService.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    return this.http.get<RecordingResponse>(
      `${this.API_URL}/${sessionId}/recording/status`,
      { headers }
    );
  }

   async downloadRecording(sessionId: number): Promise<Observable<Blob>> {
    const token = await this.keycloakService.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    return this.http.get(
      `${this.API_URL}/recordings/${sessionId}`,
      { 
        headers,
        responseType: 'blob'
      }
    );
  }

  private startRecordingTimer(): void {
    const startTime = Date.now();
    
    this.recordingTimer = setInterval(() => {
      const currentStatus = this.recordingStatusSubject.value;
      if (currentStatus.isRecording) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        this.recordingStatusSubject.next({
          ...currentStatus,
          duration
        });
      }
    }, 1000);
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = undefined;
    }
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  cleanup(): void {
    this.stopRecordingTimer();
    this.recordingStatusSubject.next({ isRecording: false });
  }
}