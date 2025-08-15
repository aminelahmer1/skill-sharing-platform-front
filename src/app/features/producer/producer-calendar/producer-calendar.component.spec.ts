import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerCalendarComponent } from './producer-calendar.component';

describe('ProducerCalendarComponent', () => {
  let component: ProducerCalendarComponent;
  let fixture: ComponentFixture<ProducerCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerCalendarComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
