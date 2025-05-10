import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy, NgZone } from '@angular/core';
import { UserService } from '../../../core/services/User/user.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, catchError, of, tap, takeUntil, Subject } from 'rxjs';
import { UserProfileResponse } from '../../../models/user/user';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';

type Coordinate = [number, number];

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    DatePipe,
    RouterModule
  ]
})
export class ProfileComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('map', { static: false }) mapElement!: ElementRef;
  profile$!: Observable<UserProfileResponse>;
  isLoading = false;
  error: string | null = null;
  
  private map!: Map;
  private destroy$ = new Subject<void>();
  private readonly DEFAULT_COORDS: Coordinate = [10.1815, 36.8065];
  private readonly DEFAULT_ZOOM = 6;
  private readonly ADDRESS_ZOOM = 14;
  private mapInitialized = false;

  private readonly MARKER_STYLE = new Style({
    image: new CircleStyle({
      radius: 8,
      fill: new Fill({ color: '#4285F4' }),
      stroke: new Stroke({
        color: '#FFFFFF',
        width: 2
      })
    }),
    text: new Text({
      text: '📍',
      scale: 1.5,
      offsetY: -20,
      fill: new Fill({ color: '#FF3D00' })
    })
  });

  constructor(
    private userService: UserService,
    private snackBar: MatSnackBar,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  ngAfterViewInit(): void {
    this.initializeMapWhenReady();
  }

  ngOnDestroy(): void {
    this.destroyMap();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeMapWhenReady(): void {
    const checkContainer = () => {
      if (this.mapElement?.nativeElement?.offsetWidth > 0 && !this.mapInitialized) {
        this.ngZone.run(() => {
          this.initMap();
          this.mapInitialized = true;
        });
      } else if (!this.mapInitialized) {
        setTimeout(checkContainer, 100);
      }
    };
    checkContainer();
  }

  private initMap(coords?: Coordinate): void {
    if (!this.mapElement?.nativeElement) {
      console.error('Map container not available');
      return;
    }

    this.destroyMap();

    this.map = new Map({
      target: this.mapElement.nativeElement,
      layers: [
        new TileLayer({
          source: new OSM()
        })
      ],
      view: new View({
        center: coords ? fromLonLat(coords) : fromLonLat(this.DEFAULT_COORDS),
        zoom: coords ? this.ADDRESS_ZOOM : this.DEFAULT_ZOOM
      })
    });

    if (coords) {
      this.addModernMarker(coords);
    }

    setTimeout(() => this.map?.updateSize(), 0);
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.setTarget(undefined);
      this.map.dispose();
      this.map = null as any;
    }
  }

  private addModernMarker(coords: Coordinate): void {
    const marker = new Feature({
      geometry: new Point(fromLonLat(coords)),
      name: 'Location'
    });

    marker.setStyle(this.MARKER_STYLE);

    const vectorLayer = new VectorLayer({
      source: new VectorSource({
        features: [marker]
      }),
      zIndex: 100
    });

    this.map.addLayer(vectorLayer);
  }

  private async geocodeAddress(address: string): Promise<Coordinate | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      return data?.[0] ? [parseFloat(data[0].lon), parseFloat(data[0].lat)] : null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  private async updateMapWithAddress(profile: UserProfileResponse): Promise<void> {
    if (!profile.address) {
      this.initMap();
      return;
    }

    const addressParts = [
      profile.address.city,
      profile.address.postalCode,
      profile.address.country
    ].filter(Boolean).join(', ');

    if (!addressParts) {
      this.initMap();
      return;
    }

    try {
      const coords = await this.geocodeAddress(addressParts);
      if (coords) {
        this.initMap(coords);
      } else {
        this.initMap();
        this.snackBar.open('Address not found, showing default location', 'OK', { duration: 3000 });
      }
    } catch {
      this.initMap();
    }
  }

  private loadProfile(): void {
    this.isLoading = true;
    this.error = null;
    
    this.profile$ = this.userService.getCurrentUserProfile().pipe(
      tap(async (profile) => {
        await this.updateMapWithAddress(profile);
      }),
      catchError(error => {
        console.error('Error loading profile:', error);
        this.error = 'Failed to load profile';
        this.snackBar.open(this.error, 'Close', { duration: 3000 });
        return of({} as UserProfileResponse);
      }),
      tap(() => {
        this.isLoading = false;
      }),
      takeUntil(this.destroy$)
    );
  }
}