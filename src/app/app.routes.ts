import { Routes } from '@angular/router';
import { MainTemplateComponent } from './templates/main-template/main-template/main-template.component';
import { ProducerTemplateComponent } from './templates/producer-template/producer-template/producer-template.component';
import { ReceiverTemplateComponent } from './templates/receiver-template/receiver-template/receiver-template.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { UnauthorizedComponent } from './auth/unauthorized/unauthorized.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', component: MainTemplateComponent },
  {
    path: 'producer',
    component: ProducerTemplateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['PRODUCER'] },
  },
  {
    path: 'receiver',
    component: ReceiverTemplateComponent,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['RECEIVER'] },
  },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];