import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiverCalendarComponent } from './receiver-calendar.component';

describe('ReceiverCalendarComponent', () => {
  let component: ReceiverCalendarComponent;
  let fixture: ComponentFixture<ReceiverCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiverCalendarComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiverCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
