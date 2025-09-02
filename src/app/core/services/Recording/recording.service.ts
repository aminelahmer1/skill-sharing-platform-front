import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
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
  fileName: string;
  skillName: string;
  recordingNumber: number;
  status: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  fileSize?: number;
  downloadUrl?: string;
}

export interface RecordingRequest {
  format: string;
  quality: string;
  includeChat: boolean;
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

  private async getHeaders(): Promise<HttpHeaders> {
    const token = await this.keycloakService.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  async startRecording(sessionId: number): Promise<RecordingResponse> {
    const headers = await this.getHeaders();
    
    const request: RecordingRequest = {
      format: 'mp4',
      quality: 'high',
      includeChat: true
    };

    try {
      const response = await firstValueFrom(
        this.http.post<RecordingResponse>(
          `${this.API_URL}/${sessionId}/recording/start`,
          request,
          { headers }
        )
      );

      this.startRecordingTimer();
      this.recordingStatusSubject.next({
        isRecording: true,
        startTime: new Date(response.startTime),
        recordingId: response.recordingId
      });

      return response;
    } catch (error) {
      throw error;
    }
  }

  async stopRecording(sessionId: number): Promise<void> {
    const headers = await this.getHeaders();

    try {
      await firstValueFrom(
        this.http.post<void>(
          `${this.API_URL}/${sessionId}/recording/stop`,
          {},
          { headers }
        )
      );

      this.stopRecordingTimer();
      this.recordingStatusSubject.next({ isRecording: false });
    } catch (error) {
      throw error;
    }
  }

  async getRecordingStatus(sessionId: number): Promise<RecordingResponse> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.get<RecordingResponse>(
        `${this.API_URL}/${sessionId}/recording/status`,
        { headers }
      )
    );
  }

  async getSessionRecordings(sessionId: number): Promise<RecordingResponse[]> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.get<RecordingResponse[]>(
        `${this.API_URL}/${sessionId}/recordings`,
        { headers }
      )
    );
  }

  async getUserRecordings(): Promise<RecordingResponse[]> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.get<RecordingResponse[]>(
        `${this.API_URL}/recordings/user`,
        { headers }
      )
    );
  }

  async getRecordingById(recordingId: number): Promise<RecordingResponse> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.get<RecordingResponse>(
        `${this.API_URL}/recordings/${recordingId}`,
        { headers }
      )
    );
  }

  async downloadRecording(recordingId: number): Promise<Blob> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.get(
        `${this.API_URL}/recordings/download/${recordingId}`,
        { 
          headers,
          responseType: 'blob'
        }
      )
    );
  }

  async deleteRecording(recordingId: number): Promise<void> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.delete<void>(
        `${this.API_URL}/recordings/${recordingId}`,
        { headers }
      )
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