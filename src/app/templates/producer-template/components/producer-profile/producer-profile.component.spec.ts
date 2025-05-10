import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerProfileComponent } from './producer-profile.component';

describe('ProducerProfileComponent', () => {
  let component: ProducerProfileComponent;
  let fixture: ComponentFixture<ProducerProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerProfileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
