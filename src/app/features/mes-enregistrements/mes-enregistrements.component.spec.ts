import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MesEnregistrementsComponent } from './mes-enregistrements.component';

describe('MesEnregistrementsComponent', () => {
  let component: MesEnregistrementsComponent;
  let fixture: ComponentFixture<MesEnregistrementsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MesEnregistrementsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MesEnregistrementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
