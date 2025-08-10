import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyLivestreamsComponent } from './my-livestreams.component';

describe('MyLivestreamsComponent', () => {
  let component: MyLivestreamsComponent;
  let fixture: ComponentFixture<MyLivestreamsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyLivestreamsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MyLivestreamsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
