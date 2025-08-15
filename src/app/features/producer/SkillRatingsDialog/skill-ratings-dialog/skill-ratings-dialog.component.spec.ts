import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkillRatingsDialogComponent } from './skill-ratings-dialog.component';

describe('SkillRatingsDialogComponent', () => {
  let component: SkillRatingsDialogComponent;
  let fixture: ComponentFixture<SkillRatingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillRatingsDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SkillRatingsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
