import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingsDialogComponent } from './recordings-dialog.component';

describe('RecordingsDialogComponent', () => {
  let component: RecordingsDialogComponent;
  let fixture: ComponentFixture<RecordingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingsDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RecordingsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
