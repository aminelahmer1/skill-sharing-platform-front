import { Component, Input, Output, EventEmitter, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificationDropdownComponent } from '../../../features/shared/notification-dropdown/notification-dropdown.component';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Subscription } from 'rxjs';
import { QuickChatComponent } from "../../../features/messaging/quick-chat/quick-chat.component";
import { MessageNotificationBadgeComponent } from '../../../features/shared/message-notification-badge/message-notification-badge.component';
import { GlobalQuickChatComponent } from "../../../features/messaging/global-quick-chat/global-quick-chat.component";

@Component({
  selector: 'app-navbar-receiver',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationDropdownComponent, QuickChatComponent, MessageNotificationBadgeComponent, GlobalQuickChatComponent],
  templateUrl: './navbar-receiver.component.html',
  styleUrls: ['./navbar-receiver.component.css']
})
export class NavbarReceiverComponent implements OnInit, OnDestroy {
  @Input() userProfile: any;
  @Input() isMenuActive!: boolean;
  @Input() logoutButtonText = 'Déconnexion';
  @Output() logout = new EventEmitter<void>();
  @Output() menuToggled = new EventEmitter<void>();

  showNotificationDropdown = false;
  unreadCount = 0;
  private subscriptions = new Subscription();

  get userId(): string {
    return this.userProfile?.sub || '';
  }

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.notificationService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
        console.log('Navbar unread count updated:', count); // Debug
      })
    );
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notification-container') && 
        !target.closest('.notification-dropdown') && 
        this.showNotificationDropdown) {
      this.showNotificationDropdown = false;
    }
  }

  toggleNotificationDropdown(event: Event) {
    event.stopPropagation();
    this.showNotificationDropdown = !this.showNotificationDropdown;
  }

  handleLogout() {
    this.logout.emit();
  }

  toggleMenu() {
    this.menuToggled.emit();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}