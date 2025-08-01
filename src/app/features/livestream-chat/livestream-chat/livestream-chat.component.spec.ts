import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LivestreamChatComponent } from './livestream-chat.component';

describe('LivestreamChatComponent', () => {
  let component: LivestreamChatComponent;
  let fixture: ComponentFixture<LivestreamChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LivestreamChatComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(LivestreamChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
