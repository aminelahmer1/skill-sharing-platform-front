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
  bio?: string;
  phoneNumber?: string;
}
export interface Address {
  city?: string;
  country?: string;
  postalCode?: string;
}

export interface UserProfile {
  id: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  address?: Address;
  pictureUrl?: string;
  phoneNumber?: string;
  bio?: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileUpdate {
  username?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  pictureUrl?: string;
  bio?: string;
  address?: Address;
}

export interface UserResponse {
  id: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  city?: string; 
  country?: string;
  postalCode?: string;
  pictureUrl?: string;
  phoneNumber?: string;
  bio?: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface UserProfileResponse {
  id: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  address?: Address;
  pictureUrl?: string;
  bio?: string;
  phoneNumber?: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}