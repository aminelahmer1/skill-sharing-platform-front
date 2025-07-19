// src/app/models/LivestreamSession/livestream-session.ts
export interface LivestreamSession {
  id: number;
  skillId: number;
  skillName: string;
  producerId: number;
  producerName?: string;
  receiverIds: number[];
  roomName: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string;
  scheduledStartTime?: string;
  duration?: number;
  maxParticipants?: number;
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  recordingPath?: string;
  recordingUrl?: string;
  isRecordingEnabled: boolean;
  isPublic: boolean;
  accessCode?: string;
  metadata?: {
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  
  // Statistiques du stream
  statistics?: {
    totalViewers: number;
    peakViewers: number;
    totalWatchTime: number;
    averageWatchTime: number;
    chatMessages: number;
    reactions: number;
  };
  
  // Configuration du stream
  streamConfig?: {
    maxBitrate: number;
    resolution: {
      width: number;
      height: number;
    };
    frameRate: number;
    allowScreenShare: boolean;
    allowRecording: boolean;
    allowChat: boolean;
    autoRecord: boolean;
    qualityLevels: ('360p' | '480p' | '720p' | '1080p')[];
  };
  
  // Tokens d'accès
  producerToken: string;
  viewerToken?: string;
  
  // Participants actuels
  currentParticipants?: {
    id: number;
    name: string;
    role: 'producer' | 'viewer';
    joinedAt: string;
    isActive: boolean;
    hasVideo: boolean;
    hasAudio: boolean;
    isScreenSharing: boolean;
  }[];
}