import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingControlsComponent } from './recording-controls.component';

describe('RecordingControlsComponent', () => {
  let component: RecordingControlsComponent;
  let fixture: ComponentFixture<RecordingControlsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingControlsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RecordingControlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
