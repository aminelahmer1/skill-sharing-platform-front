import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcceptedReceiversDialogComponent } from './accepted-receivers-dialog.component';

describe('AcceptedReceiversDialogComponent', () => {
  let component: AcceptedReceiversDialogComponent;
  let fixture: ComponentFixture<AcceptedReceiversDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcceptedReceiversDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AcceptedReceiversDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
