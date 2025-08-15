import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarEventModalComponent } from './calendar-event-modal.component';

describe('CalendarEventModalComponent', () => {
  let component: CalendarEventModalComponent;
  let fixture: ComponentFixture<CalendarEventModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarEventModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CalendarEventModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
