import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerRatingStatsComponent } from './producer-rating-stats.component';

describe('ProducerRatingStatsComponent', () => {
  let component: ProducerRatingStatsComponent;
  let fixture: ComponentFixture<ProducerRatingStatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerRatingStatsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerRatingStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
