export interface Notification {
    id: number;
    type: string;
    exchangeId?: number;
    userId: string;  // UUID de Keycloak
    message: string;
    createdAt: string;
    sent: boolean;
    read: boolean;
  }