import { Routes } from '@angular/router';
import { MainTemplateComponent } from './templates/main-template/main-template/main-template.component';
import { ProducerTemplateComponent } from './templates/producer-template/producer-template/producer-template.component';
import { ReceiverTemplateComponent } from './templates/receiver-template/receiver-template/receiver-template.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { UnauthorizedComponent } from './auth/unauthorized/unauthorized.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { ProducerProfileComponent } from './features/producer/profile/profile.component';
import { ProducerProfileEditComponent } from './features/producer/profile-edit/profile-edit.component';
import { ProfileComponent } from './features/receiver/profile/profile.component';
import { ProfileEditComponent } from './features/receiver/profile-edit/profile-edit.component';

export const routes: Routes = [
  { path: '', component: MainTemplateComponent },
  {
    path: 'producer',
    component: ProducerTemplateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['PRODUCER'] },
    children: [
      { path: 'profile', component: ProducerProfileComponent },
      { path: 'profile-edit', component: ProducerProfileEditComponent },
      { path: '', redirectTo: '', pathMatch: 'full' },
    ],
  },
  {
    path: 'receiver',
    component: ReceiverTemplateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['RECEIVER'] },
    children: [
      { path: 'profile', component: ProfileComponent },
      { path: 'profile-edit', component: ProfileEditComponent },
      { path: '', redirectTo: '', pathMatch: 'full' },
    ],
  },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];