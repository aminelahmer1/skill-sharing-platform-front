export interface KeycloakProfile {
    id: string;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    emailVerified: boolean;
    enabled: boolean;
    attributes?: {
      [key: string]: string[];
    };
  }