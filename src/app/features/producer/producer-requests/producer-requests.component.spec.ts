import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerRequestsComponent } from './producer-requests.component';

describe('ProducerRequestsComponent', () => {
  let component: ProducerRequestsComponent;
  let fixture: ComponentFixture<ProducerRequestsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerRequestsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
