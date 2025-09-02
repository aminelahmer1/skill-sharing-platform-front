import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoPlayerDialogComponent } from './video-player-dialog.component';

describe('VideoPlayerDialogComponent', () => {
  let component: VideoPlayerDialogComponent;
  let fixture: ComponentFixture<VideoPlayerDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPlayerDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(VideoPlayerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
