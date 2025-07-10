// src/app/models/livestream-session.ts
export interface LivestreamSession {
skillName: any;
  id: number;
  skillId: number;
  producerId: number;
  receiverIds: number[];
  roomName: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED';
  startTime: string;
  endTime?: string;
  producerToken: string;
  recordingPath?: string;
}