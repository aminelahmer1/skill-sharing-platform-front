export interface Notification {
  id: number;
  type: string;
  exchangeId?: number;
  userId: string;
  message: string;
  createdAt: string;
  sent: boolean;
  read: boolean;
  rejectionReason?: string;
}