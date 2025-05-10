import { AddressUpdateRequest } from "./address-update-request";

export class UserResponse {
    id!: number;
    keycloakId!: string;
    username!: string;
    email!: string;
    firstName?: string;
    lastName?: string;
    address?: AddressUpdateRequest;
    pictureUrl?: string;
    phoneNumber?: string;
    roles!: string[];
    createdAt!: Date;
    updatedAt!: Date;
    isActive!: boolean;
  }