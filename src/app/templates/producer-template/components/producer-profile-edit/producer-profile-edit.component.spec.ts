import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerProfileEditComponent } from './producer-profile-edit.component';

describe('ProducerProfileEditComponent', () => {
  let component: ProducerProfileEditComponent;
  let fixture: ComponentFixture<ProducerProfileEditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerProfileEditComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerProfileEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
