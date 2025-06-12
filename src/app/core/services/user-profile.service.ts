import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root' // Automatically provides the service at the root level
})
export class UserProfileService {
  private userProfile = new BehaviorSubject<any>(null); // Holds the user profile
  userProfile$ = this.userProfile.asObservable(); // Observable for subscribers

  setUserProfile(profile: any) {
    this.userProfile.next(profile); // Update the profile
  }

  getUserProfile() {
    return this.userProfile.getValue(); // Return the current profile
  }
}