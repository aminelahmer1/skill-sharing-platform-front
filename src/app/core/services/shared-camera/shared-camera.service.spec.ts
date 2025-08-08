import { TestBed } from '@angular/core/testing';

import { SharedCameraService } from './shared-camera.service';

describe('SharedCameraService', () => {
  let service: SharedCameraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SharedCameraService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
