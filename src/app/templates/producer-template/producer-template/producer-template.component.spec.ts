import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProducerTemplateComponent } from './producer-template.component';

describe('ProducerTemplateComponent', () => {
  let component: ProducerTemplateComponent;
  let fixture: ComponentFixture<ProducerTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProducerTemplateComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProducerTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
