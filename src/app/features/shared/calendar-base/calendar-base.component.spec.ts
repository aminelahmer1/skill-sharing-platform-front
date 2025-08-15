import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarBaseComponent } from './calendar-base.component';

describe('CalendarBaseComponent', () => {
  let component: CalendarBaseComponent;
  let fixture: ComponentFixture<CalendarBaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarBaseComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CalendarBaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
