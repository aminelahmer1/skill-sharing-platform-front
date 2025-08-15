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
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatTooltipModule,
    DatePipe,
    RouterModule
  ]
})
export class ProfileComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('map', { static: false }) mapElement!: ElementRef;
  
  // Propriétés principales
  profile$!: Observable<UserProfileResponse>;
  isLoading = false;
  error: string | null = null;
  
  // Propriétés privées pour la carte
  private map!: Map;
  private destroy$ = new Subject<void>();
  private readonly DEFAULT_COORDS: Coordinate = [10.1815, 36.8065]; // Tunis
  private readonly DEFAULT_ZOOM = 6;
  private readonly ADDRESS_ZOOM = 14;
  private mapInitialized = false;

  // Style moderne pour le marqueur - couleur receiver
  private readonly MARKER_STYLE = new Style({
    image: new CircleStyle({
      radius: 10,
      fill: new Fill({ color: '#74b9ff' }), // Couleur receiver
      stroke: new Stroke({
        color: '#FFFFFF',
        width: 3
      })
    }),
    text: new Text({
      text: '📍',
      scale: 1.8,
      offsetY: -25,
      fill: new Fill({ color: '#fd79a8' })
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

  // Méthodes publiques utilisées dans le template
  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'assets/images/default-profile.png';
    }
  }

  getFormattedAddress(profile: UserProfileResponse): string {
    if (!profile.address) return '';
    
    const parts = [
      profile.address.city,
      profile.address.postalCode,
      profile.address.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }

  // Afficher une valeur avec indicateur si vide
  getDisplayValue(value: string | null | undefined): string {
    if (!value || value.trim() === '') {
      return '- Non renseigné -';
    }
    return value;
  }

  // Afficher l'adresse avec indicateur si vide
  getDisplayAddress(profile: UserProfileResponse): string {
    const formatted = this.getFormattedAddress(profile);
    if (!formatted || formatted.trim() === '') {
      return '- Aucune adresse renseignée -';
    }
    return formatted;
  }

  // Vérifier si il y a des données d'adresse valides
  hasAddressData(profile: UserProfileResponse): boolean {
    if (!profile.address) return false;
    
    const city = profile.address.city?.trim();
    const country = profile.address.country?.trim();
    const postalCode = profile.address.postalCode?.trim();
    
    return !!(city || country || postalCode);
  }

  // Méthode pour calculer la durée d'adhésion
  getMemberDuration(createdAt: string | Date): string {
    if (!createdAt) return 'Nouveau membre';
    
    // Gérer les deux types : string et Date
    const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    
    // Vérifier si la date est valide
    if (isNaN(created.getTime())) return 'Date invalide';
    
    const now = new Date();
    const diffInMonths = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
    
    if (diffInMonths < 1) {
      return 'Nouveau membre';
    } else if (diffInMonths < 12) {
      return `${diffInMonths} mois`;
    } else {
      const years = Math.floor(diffInMonths / 12);
      const remainingMonths = diffInMonths % 12;
      if (remainingMonths === 0) {
        return `${years} an${years > 1 ? 's' : ''}`;
      } else {
        return `${years} an${years > 1 ? 's' : ''} et ${remainingMonths} mois`;
      }
    }
  }

  // Méthodes pour les contrôles de carte
  centerMap(): void {
    if (this.map) {
      const view = this.map.getView();
      view.animate({
        center: fromLonLat(this.DEFAULT_COORDS),
        zoom: this.ADDRESS_ZOOM,
        duration: 1000
      });
    }
  }

  // Méthodes privées pour la gestion de la carte
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
      const services = [
        () => this.tryNominatim(address),
        () => this.getDefaultCoordinatesForTunisia(address)
      ];

      for (const service of services) {
        try {
          const coords = await service();
          if (coords) return coords;
        } catch (error) {
          console.warn('Geocoding service failed, trying next...', error);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error('All geocoding services failed:', error);
      return null;
    }
  }

  private async tryNominatim(address: string): Promise<Coordinate | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=tn`,
        { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'SkillSharingPlatform/1.0'
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error('Nominatim request failed');
      
      const data = await response.json();
      return data?.[0] ? [parseFloat(data[0].lon), parseFloat(data[0].lat)] : null;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private getDefaultCoordinatesForTunisia(address: string): Coordinate | null {
    const tunisianCities: { [key: string]: Coordinate } = {
      'tunis': [10.1815, 36.8065],
      'sfax': [10.7631, 34.7404],
      'sousse': [10.6411, 35.8256],
      'kairouan': [10.1018, 35.6781],
      'bizerte': [9.8747, 37.2747],
      'gabes': [10.0982, 33.8815],
      'ariana': [10.1956, 36.8625],
      'gafsa': [8.7842, 34.4250],
      'monastir': [10.8261, 35.7774],
      'ben arous': [10.2181, 36.7549],
      'kasserine': [8.8366, 35.1676],
      'medenine': [10.5055, 33.3547],
      'nabeul': [10.7374, 36.4556],
      'tataouine': [10.4473, 32.9297],
      'beja': [9.1843, 36.7256],
      'jendouba': [8.7800, 36.5011],
      'mahdia': [11.0446, 35.5047],
      'sidi bouzid': [9.4889, 35.0381],
      'siliana': [9.3705, 36.0837],
      'zaghouan': [10.1425, 36.4022],
      'kef': [8.7049, 36.1741],
      'tozeur': [8.1348, 33.9197],
      'kebili': [8.9693, 33.7048],
      'chebba': [10.9530, 35.2370]
    };

    const searchAddress = address.toLowerCase();
    
    for (const [city, coords] of Object.entries(tunisianCities)) {
      if (searchAddress.includes(city)) {
        console.log(`🗺️ Coordonnées trouvées pour ${city}:`, coords);
        return coords;
      }
    }

    console.log('🗺️ Utilisation des coordonnées par défaut (Tunis)');
    return tunisianCities['tunis'];
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
        this.snackBar.open('Adresse non trouvée, affichage de la localisation par défaut', 'OK', { duration: 3000 });
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
        this.error = 'Échec du chargement du profil';
        this.snackBar.open(this.error, 'Fermer', { duration: 3000 });
        return of({} as UserProfileResponse);
      }),
      tap(() => {
        this.isLoading = false;
      }),
      takeUntil(this.destroy$)
    );
  }
}