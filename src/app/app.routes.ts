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
import { SkillsComponent } from './features/producer/skills/skills.component';
import { ReceiverskillsComponent } from './features/receiver/receiverskills/receiverskills.component';
import { ResendVerificationComponent } from './auth/resend-verification/resend-verification.component';
import { ProducerRequestsComponent } from './features/producer/producer-requests/producer-requests.component';
import {  AcceptedSkillsComponent} from './features/receiver/accepted-skills/accepted-skills.component';
import { LivestreamComponent } from './features/livestream/livestream.component';
import { MyLivestreamsComponent } from './features/producer/my-livestreams/my-livestreams/my-livestreams.component';
import { FinishedSkillsComponent } from './features/receiver/finished-skills/finished-skills.component';
import { ProducerCalendarComponent } from './features/producer/producer-calendar/producer-calendar.component';
import { ReceiverCalendarComponent } from './features/receiver/receiver-calendar/receiver-calendar.component';
import { MessengerComponent } from './features/messaging/messenger/messenger.component';

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
      { path: 'skills', component: SkillsComponent }, 
      { path: 'requests', component: ProducerRequestsComponent }, 
       { path: 'livestreams', component: MyLivestreamsComponent },
       { path: 'calendarP', component: ProducerCalendarComponent },
       { path: 'messenger', component: MessengerComponent },
      { path: 'livestream/:sessionId', component: LivestreamComponent },
      
      { path: '', redirectTo: '', pathMatch: 'full' }
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
      { path: 'skills', component: ReceiverskillsComponent },
      { path: 'accepted-skills', component: AcceptedSkillsComponent },
       { path: 'finished-skills', component: FinishedSkillsComponent },
       { path: 'calendarR', component: ReceiverCalendarComponent },
       { path: 'messenger', component: MessengerComponent },
      { path: '', redirectTo: '', pathMatch: 'full' },
      { path: 'livestream/:sessionId', component: LivestreamComponent },
    ],
  },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: 'resend-verification', component: ResendVerificationComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];