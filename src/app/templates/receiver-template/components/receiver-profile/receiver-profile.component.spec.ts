import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiverProfileComponent } from './receiver-profile.component';

describe('ReceiverProfileComponent', () => {
  let component: ReceiverProfileComponent;
  let fixture: ComponentFixture<ReceiverProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiverProfileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiverProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
