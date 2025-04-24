import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainTemplateComponent } from './main-template.component';

describe('MainTemplateComponent', () => {
  let component: MainTemplateComponent;
  let fixture: ComponentFixture<MainTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainTemplateComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MainTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
