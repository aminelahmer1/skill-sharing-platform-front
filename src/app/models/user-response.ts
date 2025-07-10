export interface UserResponse {
  id: number;
  keycloakId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  city: string;   // Ajouté
  country: string; // Ajouté
  postalCode?: string;
  roles: string[];
  createdAt: string;
  updatedAt?: string;
  pictureUrl?: string;
  bio?: string;
  phoneNumber?: string;
}