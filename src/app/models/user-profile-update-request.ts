import { AddressUpdateRequest } from "./address-update-request";

export class UserProfileUpdateRequest {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    pictureUrl?: string;
    address?: AddressUpdateRequest;
  }