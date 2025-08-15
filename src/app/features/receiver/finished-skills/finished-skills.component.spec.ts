import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FinishedSkillsComponent } from './finished-skills.component';

describe('FinishedSkillsComponent', () => {
  let component: FinishedSkillsComponent;
  let fixture: ComponentFixture<FinishedSkillsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinishedSkillsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(FinishedSkillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
