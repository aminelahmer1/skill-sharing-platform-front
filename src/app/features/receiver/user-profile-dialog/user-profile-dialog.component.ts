import { Component, Inject, AfterViewInit, ViewChild, ElementRef, OnDestroy, NgZone } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
import { Subject } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

type Coordinate = [number, number];

@Component({
  selector: 'app-user-profile-dialog',
  templateUrl: './user-profile-dialog.component.html',
  styleUrls: ['./user-profile-dialog.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    DatePipe,
  ]
})
export class UserProfileDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map', { static: false }) mapElement!: ElementRef;
  private map!: Map;
  private destroy$ = new Subject<void>();
  private readonly DEFAULT_COORDS: Coordinate = [10.1815, 36.8065]; // Coordonnées par défaut
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
    public dialogRef: MatDialogRef<UserProfileDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private ngZone: NgZone
  ) {
    console.log('Données dans le popup :', this.data);
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

  private async updateMapWithAddress(): Promise<void> {
    if (!this.data.address) {
      this.initMap();
      return;
    }

    const addressParts = [
      this.data.address.city,
      this.data.address.postalCode,
      this.data.address.country
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
      }
    } catch {
      this.initMap();
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}