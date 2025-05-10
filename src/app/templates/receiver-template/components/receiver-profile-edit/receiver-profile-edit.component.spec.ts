import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiverProfileEditComponent } from './receiver-profile-edit.component';

describe('ReceiverProfileEditComponent', () => {
  let component: ReceiverProfileEditComponent;
  let fixture: ComponentFixture<ReceiverProfileEditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiverProfileEditComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiverProfileEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
