export interface User {
  id: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  pictureUrl?: string;
  phoneNumber?: string;
}

export interface KeycloakProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  enabled: boolean;
}

export interface Address {
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}