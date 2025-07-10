import { Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { LivestreamService } from '../../core/services/LiveStream/livestream.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';

import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Track } from 'livekit-client';

@Component({
  selector: 'app-livestream',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './livestream.component.html',
  styleUrls: ['./livestream.component.css']
})
export class LivestreamComponent implements OnInit, OnDestroy {
 @ViewChild('videoContainer', { static: true }) videoContainer!: ElementRef;
  
  sessionId: number;
  sessionToken!: string;
  roomName!: string;
  sessionStatus: string | null = null;
  isRecording = false;
  participants: RemoteParticipant[] = [];

  constructor(
    private router: Router,
    private livestreamService: LivestreamService,
    private snackBar: MatSnackBar
  ) {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras.state as { sessionToken: string, roomName: string };
    const urlParts = this.router.url.split('/');
    const sessionIdStr = urlParts[urlParts.length - 1];
    this.sessionId = parseInt(sessionIdStr, 10);
    
    if (!state || !state.sessionToken || !state.roomName) {
      console.error('Missing navigation data', { state });
      this.snackBar.open('Missing session data', 'Close', { duration: 3000 });
      this.router.navigate(['/producer/skills']);
      return;
    }
    this.sessionToken = state.sessionToken;
    this.roomName = state.roomName;
  }

  async ngOnInit(): Promise<void> {
    if (isNaN(this.sessionId)) {
      this.handleInvalidSession();
      return;
    }
    
    await this.loadSessionDetails();
    await this.setupLiveKitConnection();
  }

  async ngOnDestroy(): Promise<void> {
    await this.cleanup();
  }

  private handleInvalidSession(): void {
    console.warn('Invalid session ID', { sessionId: this.sessionId });
    this.snackBar.open('Invalid session ID', 'Close', { duration: 3000 });
    this.router.navigate(['/producer/skills']);
  }

  private async loadSessionDetails(): Promise<void> {
    try {
      const session = await this.livestreamService.getSession(this.sessionId).toPromise();
      this.sessionStatus = session?.status || null;
      
      if (session?.status !== 'LIVE' && session?.status !== 'SCHEDULED') {
        this.handleInactiveSession(session?.status);
      }
    } catch (error) {
      this.handleSessionError(error);
    }
  }

  private handleInactiveSession(status: string | undefined): void {
    console.warn(`Session ${this.sessionId} is not active (status: ${status})`);
    this.snackBar.open('Session is not live or scheduled', 'Close', { duration: 3000 });
    this.router.navigate(['/producer/skills']);
  }

  private handleSessionError(error: any): void {
    console.error('Error fetching session details:', error);
    this.snackBar.open('Error fetching session details', 'Close', { duration: 3000 });
    this.router.navigate(['/producer/skills']);
  }

  private async setupLiveKitConnection(): Promise<void> {
    try {
      const room = await this.livestreamService.connectToRoom(
        this.roomName,
        this.sessionToken,
        {
          // Correct room options for LiveKit
          adaptiveStream: true,
          dynacast: true,
          // Remove the invalid 'audio' and 'video' properties from room options
          // These should be handled with track publications instead
        }
      );

      // Handle participant events
      room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this));
      room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this));
      room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this));
      room.on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed.bind(this));

      // Check if local participant can publish (equivalent to isHost)
      if (room.localParticipant.permissions?.canPublish) {
        await this.livestreamService.startRecording(this.roomName);
        this.isRecording = true;
        
        // Enable audio and video for host
        await room.localParticipant.enableCameraAndMicrophone();
      }
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      this.snackBar.open('Failed to connect to livestream', 'Close', { duration: 3000 });
    }
  }

  private handleParticipantConnected(participant: RemoteParticipant): void {
    console.log('Participant connected:', participant.identity);
    this.participants = [...this.participants, participant];
  }

  private handleParticipantDisconnected(participant: RemoteParticipant): void {
    console.log('Participant disconnected:', participant.identity);
    this.participants = this.participants.filter(p => p.sid !== participant.sid);
  }

  private handleTrackSubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
      // Attach the track to the DOM
      const element = track.attach();
      this.videoContainer.nativeElement.appendChild(element);
    }
  }

  private handleTrackUnsubscribed(
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    track.detach().forEach(element => element.remove());
  }

  async endSession(): Promise<void> {
    if (this.sessionStatus !== 'LIVE') {
      this.snackBar.open('Session is not live', 'Close', { duration: 3000 });
      return;
    }

    try {
      // Stop recording if we're the host
      if (this.isRecording) {
        await this.livestreamService.stopRecording(this.roomName);
      }

      await this.livestreamService.endSession(this.sessionId).toPromise();
      this.snackBar.open('Session ended', 'Close', { duration: 3000 });
      this.router.navigate(['/producer/skills']);
    } catch (error) {
      console.error('Error ending session:', error);
      this.snackBar.open('Error ending session', 'Close', { duration: 3000 });
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await this.livestreamService.disconnectFromRoom();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}