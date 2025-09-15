import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { KeycloakService } from '../keycloak.service';

export interface RecordingStatus {
  isRecording: boolean;
  startTime?: Date;
  duration?: number;
  recordingId?: string;
  isClientRecording?: boolean;
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
  
  // Variables pour l'enregistrement client
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private currentStream: MediaStream | null = null;
  private currentSessionId: number | null = null;

  constructor(
    private http: HttpClient,
    private keycloakService: KeycloakService
  ) {}

  private async getHeaders(): Promise<HttpHeaders> {
    const token = await this.keycloakService.getToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // ========== ENREGISTREMENT CLIENT ==========

  private recordingInProgress = false;

async startClientRecording(sessionId: number, stream?: MediaStream): Promise<RecordingResponse> {
  if (this.recordingInProgress) {
    throw new Error('Recording start already in progress');
  }

  this.recordingInProgress = true;

  try {
    // Code existant de startClientRecording...
    
    const result = await this.performStartClientRecording(sessionId, stream);
    return result;
    
  } finally {
    this.recordingInProgress = false;
  }
}

private async performStartClientRecording(sessionId: number, stream?: MediaStream): Promise<RecordingResponse> {
  // Déplacer le code existant de startClientRecording ici
  try {
    // 1. Obtenir le stream si pas fourni
    let recordingStream = stream;
    if (!recordingStream) {
      recordingStream = await this.getMediaStream();
    }

    // 2. Configurer MediaRecorder
    const options: MediaRecorderOptions = {
      mimeType: this.getSupportedMimeType(),
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000
    };

    this.mediaRecorder = new MediaRecorder(recordingStream, options);
    this.currentStream = recordingStream;
    this.currentSessionId = sessionId;
    this.recordedChunks = [];

    // 3. Configurer les événements
    this.setupMediaRecorderEvents();

    // 4. Créer l'enregistrement côté serveur (métadonnées)
    const serverRecording = await this.createServerRecording(sessionId);

    // 5. Démarrer l'enregistrement
    this.mediaRecorder.start(1000);

    // 6. Démarrer le timer
    this.startRecordingTimer();
    
    // 7. Mettre à jour le statut
    this.recordingStatusSubject.next({
      isRecording: true,
      isClientRecording: true,
      startTime: new Date(),
      recordingId: serverRecording.recordingId
    });

    console.log('Client recording started successfully');
    return serverRecording;

  } catch (error) {
    console.error('Failed to start client recording:', error);
    this.cleanupClientRecording();
    throw error;
  }
}

 async stopClientRecording(): Promise<void> {
  // Vérifier AVANT de créer la Promise
  if (!this.mediaRecorder) {
    console.warn('No media recorder to stop');
    this.recordingStatusSubject.next({ isRecording: false });
    return;
  }

  if (!this.currentSessionId) {
    console.warn('No current session ID');
    this.recordingStatusSubject.next({ isRecording: false });
    return;
  }

  // Vérifier l'état du MediaRecorder
  if (this.mediaRecorder.state === 'inactive') {
    console.warn('MediaRecorder is already inactive');
    this.cleanupClientRecording();
    this.recordingStatusSubject.next({ isRecording: false });
    return;
  }

  return new Promise<void>((resolve, reject) => {
    // Double vérification dans la Promise
    if (!this.mediaRecorder) {
      console.warn('MediaRecorder disappeared during stop');
      this.cleanupClientRecording();
      this.recordingStatusSubject.next({ isRecording: false });
      resolve();
      return;
    }

    // Timeout de sécurité
    const timeoutId = setTimeout(() => {
      console.error('Stop recording timeout');
      this.cleanupClientRecording();
      this.recordingStatusSubject.next({ isRecording: false });
      resolve();
    }, 10000);

    this.mediaRecorder.onstop = async () => {
      clearTimeout(timeoutId);
      
      try {
        console.log('MediaRecorder stopped, processing recording...');
        
        if (this.recordedChunks.length === 0) {
          console.warn('No recorded chunks available');
          this.cleanupClientRecording();
          this.recordingStatusSubject.next({ isRecording: false });
          resolve();
          return;
        }
        
        const recordingBlob = new Blob(this.recordedChunks, { 
          type: this.getSupportedMimeType() 
        });

        console.log('Recording blob created:', {
          size: recordingBlob.size,
          type: recordingBlob.type
        });

        if (recordingBlob.size > 0) {
          await this.uploadRecording(recordingBlob);
        } else {
          console.warn('Recording blob is empty');
        }
        
        this.cleanupClientRecording();
        this.recordingStatusSubject.next({ isRecording: false });
        console.log('Client recording stopped and processed successfully');
        resolve();

      } catch (error) {
        console.error('Failed to process recording:', error);
        this.cleanupClientRecording();
        this.recordingStatusSubject.next({ isRecording: false });
        // Ne pas rejeter, juste résoudre pour éviter de bloquer
        resolve();
      }
    };

    this.mediaRecorder.onerror = () => {
      clearTimeout(timeoutId);
      console.error('MediaRecorder error during stop');
      this.cleanupClientRecording();
      this.recordingStatusSubject.next({ isRecording: false });
      resolve();
    };

    try {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
        console.log('MediaRecorder.stop() called');
      } else {
        console.log('MediaRecorder not in recording state:', this.mediaRecorder.state);
        clearTimeout(timeoutId);
        this.cleanupClientRecording();
        this.recordingStatusSubject.next({ isRecording: false });
        resolve();
      }

      // Arrêter les tracks du stream
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error calling MediaRecorder.stop():', error);
      this.cleanupClientRecording();
      this.recordingStatusSubject.next({ isRecording: false });
      resolve();
    }
  });
}
  // ========== MÉTHODES PRINCIPALES ==========

  async startRecording(sessionId: number): Promise<RecordingResponse> {
    try {
      return await this.startClientRecording(sessionId);
    } catch (clientError) {
      console.warn('Client recording failed, falling back to server recording:', clientError);
      return await this.startServerRecording(sessionId);
    }
  }

 async stopRecording(sessionId: number): Promise<void> {
  try {
    const currentStatus = this.recordingStatusSubject.value;
    
    console.log('Stopping recording for session:', sessionId, 'Current status:', currentStatus);
    
    if (!currentStatus.isRecording) {
      console.warn('No active recording to stop');
      return;
    }
    
    if (currentStatus.isClientRecording) {
      console.log('Stopping client recording...');
      await this.stopClientRecording();
    } else {
      console.log('Stopping server recording...');
      await this.stopServerRecording(sessionId);
    }
    
    console.log('Recording stopped successfully');
  } catch (error) {
    console.error('Error in stopRecording:', error);
    // Forcer l'arrêt du statut d'enregistrement
    this.recordingStatusSubject.next({ isRecording: false });
    throw error;
  }
}


  // ========== MÉTHODES UTILITAIRES CLIENT ==========

  private async getMediaStream(): Promise<MediaStream> {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
          });
          const micTrack = micStream.getAudioTracks()[0];
          displayStream.addTrack(micTrack);
        } catch (micError) {
          console.warn('Could not access microphone:', micError);
        }
      }

      return displayStream;

    } catch (error) {
      console.warn('Screen sharing failed, trying camera + mic:', error);
      
      return await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    return 'video/webm';
  }

  private setupMediaRecorderEvents(): void {
  if (!this.mediaRecorder) return;

  this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      this.recordedChunks.push(event.data);
      console.log('Recording chunk received:', event.data.size, 'bytes, total chunks:', this.recordedChunks.length);
    } else {
      console.warn('Empty or null data chunk received');
    }
  };

  this.mediaRecorder.onstart = () => {
    console.log('MediaRecorder started successfully');
  };

  this.mediaRecorder.onerror = (event: any) => {
    console.error('MediaRecorder error:', event.error || event);
    
    // Nettoyer en cas d'erreur
    this.cleanupClientRecording();
    this.recordingStatusSubject.next({ isRecording: false });
  };

  this.mediaRecorder.onstop = () => {
    console.log('MediaRecorder stopped event received');
  };
}

  private async createServerRecording(sessionId: number): Promise<RecordingResponse> {
    const headers = await this.getHeaders();
    
    const request: RecordingRequest = {
      format: 'webm',
      quality: 'high',
      includeChat: true
    };

    return firstValueFrom(
      this.http.post<RecordingResponse>(
        `${this.API_URL}/${sessionId}/recording/start`,
        request,
        { headers }
      )
    );
  }

  private async uploadRecording(blob: Blob): Promise<void> {
  if (!this.currentSessionId) {
    throw new Error('No current session ID for upload');
  }

  try {
    const headers = await this.getHeaders();
    
    const formData = new FormData();
    const fileName = `recording_${this.currentSessionId}_${Date.now()}.webm`;
    formData.append('recording', blob, fileName);
    formData.append('sessionId', this.currentSessionId.toString());

    console.log('Uploading recording:', { fileName, size: blob.size });

    const response = await firstValueFrom(
      this.http.post(`${this.API_URL}/upload-recording`, formData, { 
        headers,
        // Ajouter des options pour éviter les timeouts
        reportProgress: true,
        observe: 'response'
      })
    );

    console.log('Upload response:', response.status, response.statusText);

    if (response.status !== 200) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

  } catch (error) {
    console.error('Upload recording failed:', error);
    
    // Analyser le type d'erreur
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error('Upload timeout - le fichier est peut-être trop volumineux');
      } else if (error.message.includes('network')) {
        throw new Error('Erreur réseau lors de l\'upload');
      }
    }
    
    throw new Error(`Échec de l'upload de l'enregistrement: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }
}

  private cleanupClientRecording(): void {
  console.log('Cleaning up client recording...');
  
  try {
    if (this.mediaRecorder) {
      // Supprimer les event listeners
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onerror = null;
      this.mediaRecorder.onstart = null;
      
      this.mediaRecorder = null;
    }

    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      this.currentStream = null;
    }

    this.recordedChunks = [];
    this.currentSessionId = null;
    
    console.log('Client recording cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}


  // ========== MÉTHODES SERVEUR (FALLBACK) ==========

  private async startServerRecording(sessionId: number): Promise<RecordingResponse> {
    const headers = await this.getHeaders();
    
    const request: RecordingRequest = {
      format: 'mp4',
      quality: 'high',
      includeChat: true
    };

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
      isClientRecording: false,
      startTime: new Date(response.startTime),
      recordingId: response.recordingId
    });

    return response;
  }

  private async stopServerRecording(sessionId: number): Promise<void> {
    const headers = await this.getHeaders();

    await firstValueFrom(
      this.http.post<void>(
        `${this.API_URL}/${sessionId}/recording/stop`,
        {},
        { headers }
      )
    );

    this.stopRecordingTimer();
    this.recordingStatusSubject.next({ isRecording: false });
  }

  // ========== API ENDPOINTS ==========

 

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

  // ========== UTILITAIRES ==========
private startRecordingTimer(): void {
  // 🔧 FIX: Nettoyer l'ancien timer avant d'en créer un nouveau
  this.stopRecordingTimer();
  
  const startTime = Date.now();
  
  this.recordingTimer = setInterval(() => {
    const currentStatus = this.recordingStatusSubject.value;
    if (currentStatus.isRecording) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      this.recordingStatusSubject.next({
        ...currentStatus,
        duration
      });
    } else {
      // 🔧 FIX: Arrêter le timer si l'enregistrement n'est plus actif
      this.stopRecordingTimer();
    }
  }, 1000);
  
  console.log('🟢 Recording timer started');
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

  // recording.service.ts - Ajouter ces méthodes

async cleanupRecording(sessionId: number): Promise<void> {
  const headers = await this.getHeaders();
  
  try {
    await firstValueFrom(
      this.http.post<void>(
        `${this.API_URL}/${sessionId}/recording/cleanup`,
        {},
        { headers }
      )
    );
    console.log('Recording cleanup successful');
  } catch (error) {
    console.error('Recording cleanup failed:', error);
  }
}

async checkAndCleanupOrphans(sessionId: number): Promise<void> {
  try {
    const headers = await this.getHeaders();
    
    // Vérifier le statut avec gestion du 204 No Content
    const response = await firstValueFrom(
      this.http.get<RecordingResponse>(
        `${this.API_URL}/${sessionId}/recording/status`,
        { headers, observe: 'response' }
      )
    );
    
    if (response.status === 204) {
      console.log('No active recordings found');
      return;
    }
    
    if (response.body && response.body.status === 'RECORDING') {
      const recordingAge = Date.now() - new Date(response.body.startTime).getTime();
      
      // Si l'enregistrement a plus de 30 minutes et est toujours "RECORDING"
      if (recordingAge > 30 * 60 * 1000) {
        console.log('Found stale recording, cleaning up...');
        await this.cleanupRecording(sessionId);
      } else {
        console.log(`Active recording found (${Math.floor(recordingAge / 60000)} minutes old)`);
        // Optionnel: demander à l'utilisateur s'il veut nettoyer
        if (recordingAge > 5 * 60 * 1000) { // Plus de 5 minutes
          console.warn('Recording might be stale, consider cleanup');
        }
      }
    }
  } catch (error: any) {
    if (error?.status === 204) {
      console.log('No orphan recordings found');
    } else {
      console.error('Error checking orphan recordings:', error);
    }
  }
}



async getRecordingStatus(sessionId: number): Promise<RecordingStatus | null> {
  try {
    const headers = await this.getHeaders();
    const response = await firstValueFrom(
      this.http.get<RecordingResponse>(
        `${this.API_URL}/${sessionId}/recording/status`,
        { headers }
      )
    );
    
    if (response) {
      return {
        isRecording: response.status === 'RECORDING',
        startTime: new Date(response.startTime),
        recordingId: response.recordingId,
        duration: response.duration
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}
  cleanup(): void {
    this.cleanupClientRecording();
    this.stopRecordingTimer();
    this.recordingStatusSubject.next({ isRecording: false });
  }

  // AJOUTER cette nouvelle méthode après la méthode existante emergencyStopRecording
async emergencyStopRecording(sessionId: number): Promise<void> {
  try {
    const data = JSON.stringify({ 
      sessionId: sessionId,
      emergency: true 
    });
    
    // Utiliser sendBeacon pour un envoi fiable même lors de la fermeture
    const blob = new Blob([data], { type: 'application/json' });
    const url = `${this.API_URL}/${sessionId}/recording/emergency-stop`;
    
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
      console.log('Emergency stop sent via beacon');
    } else {
      // Fallback avec fetch
      await fetch(url, {
        method: 'POST',
        body: data,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': await this.getHeaders().then(h => h.get('Authorization') || '')
        },
        keepalive: true
      });
    }
    
    // Mettre à jour le statut local immédiatement
    this.recordingStatusSubject.next({ isRecording: false });
  } catch (error) {
    console.error('Emergency stop failed:', error);
  }
}
}