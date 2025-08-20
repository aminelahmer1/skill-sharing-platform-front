import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MessageNotificationBadgeComponent } from './message-notification-badge.component';

describe('MessageNotificationBadgeComponent', () => {
  let component: MessageNotificationBadgeComponent;
  let fixture: ComponentFixture<MessageNotificationBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MessageNotificationBadgeComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MessageNotificationBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
