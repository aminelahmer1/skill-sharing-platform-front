import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcceptedSkillsComponent } from './accepted-skills.component';

describe('AcceptedSkillsComponent', () => {
  let component: AcceptedSkillsComponent;
  let fixture: ComponentFixture<AcceptedSkillsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcceptedSkillsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AcceptedSkillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
