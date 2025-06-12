import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiverskillsComponent } from './receiverskills.component';

describe('ReceiverskillsComponent', () => {
  let component: ReceiverskillsComponent;
  let fixture: ComponentFixture<ReceiverskillsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiverskillsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiverskillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
