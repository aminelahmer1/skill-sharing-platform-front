// 1. Créer le service : src/app/core/services/shared-camera.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SharedCameraService {
  private sharedVideoStream: MediaStream | null = null;
  private sharedAudioStream: MediaStream | null = null;
  private sessionCount = 0;
  private streamReady$ = new BehaviorSubject<boolean>(false);
  private readonly STORAGE_KEY = 'shared_camera_streams';

  constructor() {
    console.log('🎥 SharedCameraService initialized');
    this.tryRecoverExistingStreams();
  }

  // Tenter de récupérer les streams existants depuis d'autres onglets
  private async tryRecoverExistingStreams(): Promise<void> {
    try {
      // Vérifier si d'autres onglets ont déjà des streams actifs
      const existingData = this.getStorageData();
      if (existingData.hasActiveStreams) {
        console.log('🔄 Detecting existing streams from other tabs...');
        
        // Attendre un peu puis essayer de se connecter aux streams existants
        setTimeout(() => {
          this.attemptStreamRecovery();
        }, 1000);
      }
    } catch (error) {
      console.log('No existing streams to recover');
    }
  }

  private async attemptStreamRecovery(): Promise<void> {
    try {
      // Essayer d'obtenir le stream avec des contraintes minimales
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1, height: 1 },
        audio: false
      });
      
      // Si on arrive ici, on peut créer un stream
      testStream.getTracks().forEach(track => track.stop());
      console.log('🔧 Camera available for new stream');
      
    } catch (error) {
      console.log('📹 Camera busy - will use fallback mode');
    }
  }

  // Obtenir ou créer le stream vidéo partagé
  async getSharedVideoStream(): Promise<MediaStream | null> {
    if (this.sharedVideoStream && this.isStreamActive(this.sharedVideoStream)) {
      console.log('📹 Returning existing shared video stream');
      return this.cloneVideoStream(this.sharedVideoStream);
    }

    // Essayer plusieurs stratégies
    return this.createVideoStreamWithFallback();
  }

  private async createVideoStreamWithFallback(): Promise<MediaStream | null> {
    const strategies = [
      // Stratégie 1: Qualité normale
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      },
      // Stratégie 2: Qualité réduite
      {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 }
        }
      },
      // Stratégie 3: Qualité minimale
      {
        video: {
          width: { max: 320 },
          height: { max: 240 },
          frameRate: { max: 10 }
        }
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`📹 Trying video strategy ${i + 1}...`);
        
        this.sharedVideoStream = await navigator.mediaDevices.getUserMedia(strategies[i]);
        
        console.log(`✅ Shared video stream created with strategy ${i + 1}`);
        this.streamReady$.next(true);
        this.updateStorageData({ hasActiveStreams: true });
        
        return this.cloneVideoStream(this.sharedVideoStream);
        
      } catch (error) {
        console.warn(`❌ Video strategy ${i + 1} failed:`, error);
        
        if (i === strategies.length - 1) {
          console.error('❌ All video strategies failed');
          return null;
        }
      }
    }

    return null;
  }

  // Obtenir ou créer le stream audio partagé
  async getSharedAudioStream(): Promise<MediaStream | null> {
    if (this.sharedAudioStream && this.isStreamActive(this.sharedAudioStream)) {
      console.log('🎤 Returning existing shared audio stream');
      return this.cloneAudioStream(this.sharedAudioStream);
    }

    return this.createAudioStreamWithFallback();
  }

  private async createAudioStreamWithFallback(): Promise<MediaStream | null> {
    const strategies = [
      // Stratégie 1: Audio haute qualité
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      },
      // Stratégie 2: Audio standard
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      },
      // Stratégie 3: Audio basique
      {
        audio: true
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`🎤 Trying audio strategy ${i + 1}...`);
        
        this.sharedAudioStream = await navigator.mediaDevices.getUserMedia(strategies[i]);
        
        console.log(`✅ Shared audio stream created with strategy ${i + 1}`);
        return this.cloneAudioStream(this.sharedAudioStream);
        
      } catch (error) {
        console.warn(`❌ Audio strategy ${i + 1} failed:`, error);
        
        if (i === strategies.length - 1) {
          console.error('❌ All audio strategies failed');
          return null;
        }
      }
    }

    return null;
  }

  // Vérifier si un stream est actif
  private isStreamActive(stream: MediaStream): boolean {
    return stream.getTracks().some(track => track.readyState === 'live');
  }

  // Gestion du localStorage pour coordonner entre onglets
  private getStorageData(): any {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : { hasActiveStreams: false };
    } catch {
      return { hasActiveStreams: false };
    }
  }

  private updateStorageData(data: any): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Could not update storage:', error);
    }
  }

  // Cloner le stream vidéo pour éviter les conflits
  private cloneVideoStream(stream: MediaStream): MediaStream {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return stream;

    // Créer un nouveau stream avec le même track
    const clonedTrack = videoTrack.clone();
    return new MediaStream([clonedTrack]);
  }

  // Cloner le stream audio pour éviter les conflits
  private cloneAudioStream(stream: MediaStream): MediaStream {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return stream;

    // Créer un nouveau stream avec le même track
    const clonedTrack = audioTrack.clone();
    return new MediaStream([clonedTrack]);
  }

  // Incrémenter le compteur de sessions
  incrementSessionCount(): void {
    this.sessionCount++;
    console.log(`📊 Session count: ${this.sessionCount}`);
    this.updateStorageData({ hasActiveStreams: true, sessionCount: this.sessionCount });
  }

  // Décrémenter le compteur de sessions
  decrementSessionCount(): void {
    this.sessionCount = Math.max(0, this.sessionCount - 1);
    console.log(`📊 Session count: ${this.sessionCount}`);

    // Si plus aucune session, nettoyer
    if (this.sessionCount === 0) {
      this.cleanup();
      this.updateStorageData({ hasActiveStreams: false, sessionCount: 0 });
    } else {
      this.updateStorageData({ hasActiveStreams: true, sessionCount: this.sessionCount });
    }
  }

  // Vérifier si les streams sont disponibles
  isVideoAvailable(): boolean {
    return this.sharedVideoStream !== null && this.isStreamActive(this.sharedVideoStream);
  }

  isAudioAvailable(): boolean {
    return this.sharedAudioStream !== null && this.isStreamActive(this.sharedAudioStream);
  }

  // Observable pour savoir quand le stream est prêt
  get streamReady() {
    return this.streamReady$.asObservable();
  }

  // Nettoyer les ressources
  private cleanup(): void {
    console.log('🧹 Cleaning up shared camera resources...');

    if (this.sharedVideoStream) {
      this.sharedVideoStream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Video track stopped');
      });
      this.sharedVideoStream = null;
    }

    if (this.sharedAudioStream) {
      this.sharedAudioStream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Audio track stopped');
      });
      this.sharedAudioStream = null;
    }

    this.streamReady$.next(false);
    console.log('✅ Shared camera cleanup completed');
  }

  // Force cleanup (pour debug)
  forceCleanup(): void {
    this.sessionCount = 0;
    this.cleanup();
    this.updateStorageData({ hasActiveStreams: false, sessionCount: 0 });
  }

  // Méthode pour forcer la création d'un nouveau stream (si l'ancien est cassé)
  async forceRecreateStreams(): Promise<void> {
    console.log('🔄 Force recreating streams...');
    
    // Nettoyer les anciens streams
    if (this.sharedVideoStream) {
      this.sharedVideoStream.getTracks().forEach(track => track.stop());
      this.sharedVideoStream = null;
    }
    
    if (this.sharedAudioStream) {
      this.sharedAudioStream.getTracks().forEach(track => track.stop());
      this.sharedAudioStream = null;
    }

    // Recréer les streams
    await Promise.all([
      this.getSharedVideoStream(),
      this.getSharedAudioStream()
    ]);
  }
}
