import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiverTemplateComponent } from './receiver-template.component';

describe('ReceiverTemplateComponent', () => {
  let component: ReceiverTemplateComponent;
  let fixture: ComponentFixture<ReceiverTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiverTemplateComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiverTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
