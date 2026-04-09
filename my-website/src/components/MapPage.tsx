import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

// Fix default marker icon paths broken by bundlers
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DEFAULT_ICON = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });

const SF_CENTER: L.LatLngTuple = [37.7749, -122.4194];

const LANDMARKS: { position: L.LatLngTuple; name: string; description: string }[] = [
  { position: [37.7749, -122.4194], name: 'San Francisco', description: 'The City by the Bay' },
  { position: [37.8199, -122.4783], name: 'Golden Gate Bridge', description: 'Iconic suspension bridge spanning the Golden Gate strait' },
  { position: [37.8270, -122.4230], name: 'Alcatraz Island', description: 'Former federal penitentiary and national recreation area' },
  { position: [37.7955, -122.3937], name: 'Ferry Building', description: 'Historic marketplace on the Embarcadero waterfront' },
  { position: [37.7695, -122.4869], name: 'Golden Gate Park', description: '1,017 acres of urban parkland — larger than Central Park' },
];

function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: SF_CENTER,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    LANDMARKS.forEach(({ position, name, description }) => {
      L.marker(position, { icon: DEFAULT_ICON })
        .addTo(map)
        .bindPopup(
          `<div style="font-family:inherit;padding:4px 2px"><strong style="font-size:0.95rem">${name}</strong><br/><span style="color:#64748b;font-size:0.85rem">${description}</span></div>`,
          { maxWidth: 240 }
        );
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  function flyTo(position: L.LatLngTuple, zoom = 15) {
    mapInstanceRef.current?.flyTo(position, zoom, { duration: 1.2 });
  }

  return (
    <div className="map-page">
      <div className="map-page-inner">
        <div className="map-header">
          <h1 className="map-title">San Francisco, CA</h1>
          <p className="map-subtitle">Based in the Bay Area — explore some favourite spots.</p>
        </div>

        <div className="map-layout">
          <div className="map-container" ref={mapRef} />

          <div className="map-sidebar">
            <h3 className="sidebar-title">Landmarks</h3>
            <ul className="landmark-list">
              {LANDMARKS.map((lm) => (
                <li key={lm.name}>
                  <button
                    className="landmark-btn"
                    onClick={() => flyTo(lm.position)}
                  >
                    <span className="landmark-pin">
                      <PinIcon />
                    </span>
                    <span className="landmark-text">
                      <span className="landmark-name">{lm.name}</span>
                      <span className="landmark-desc">{lm.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

export default MapPage;
