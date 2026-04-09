import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

// Fix default marker icon paths broken by bundlers
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DEFAULT_ICON = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });

const DALY_CITY_CENTER: L.LatLngTuple = [37.6879, -122.4702];

interface ScheduleSide {
  day?: string;
  time?: string;
  side?: string;
  raw?: string;
  note?: string;
}

interface StreetEntry {
  street: string;
  odd_side: ScheduleSide | null;
  even_side: ScheduleSide | null;
  location: string | null;
}

interface SweepingData {
  source: string;
  scraped_at: string;
  total_streets: number;
  streets: StreetEntry[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTodayDay(): string {
  return DAY_NAMES[new Date().getDay()];
}

function isScheduledToday(entry: StreetEntry): boolean {
  const today = getTodayDay();
  const matchesDay = (side: ScheduleSide | null) => {
    if (!side?.day) return false;
    return side.day.includes(today);
  };
  return matchesDay(entry.odd_side) || matchesDay(entry.even_side);
}

function formatSide(side: ScheduleSide | null, label: string): string {
  if (!side) return `${label}: No sweeping`;
  if (side.raw) return `${label}: ${side.raw}`;
  if (side.note) return `${label}: ${side.note}`;
  const parts = [side.day, side.time].filter(Boolean).join(' ');
  return `${label}: ${parts}`;
}

function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [data, setData] = useState<SweepingData | null>(null);
  const [search, setSearch] = useState('');
  const [filterToday, setFilterToday] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<StreetEntry | null>(null);

  // Fetch street sweeping data
  useEffect(() => {
    fetch('/street_sweeping.json')
      .then((r) => r.json())
      .then((d: SweepingData) => setData(d))
      .catch((err) => console.error('Failed to load street sweeping data:', err));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: DALY_CITY_CENTER,
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.marker(DALY_CITY_CENTER, { icon: DEFAULT_ICON })
      .addTo(map)
      .bindPopup('<strong>Daly City</strong><br/>Street Sweeping Schedule Area');

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const filteredStreets = data
    ? data.streets.filter((entry) => {
        const matchesSearch = entry.street.toLowerCase().includes(search.toLowerCase());
        const matchesToday = filterToday ? isScheduledToday(entry) : true;
        return matchesSearch && matchesToday;
      })
    : [];

  const todayStr = getTodayDay();

  return (
    <div className="map-page">
      <div className="map-page-inner">
        <div className="map-header">
          <h1 className="map-title">Daly City Street Sweeping</h1>
          <p className="map-subtitle">
            Search for your street to find the sweeping schedule.
            Data sourced from{' '}
            <a href="https://www.dalycity.org/460/Street-Sweeping-Schedule" target="_blank" rel="noopener noreferrer" className="map-link">
              dalycity.org
            </a>.
          </p>
        </div>

        <div className="map-layout">
          <div className="map-container" ref={mapRef} />

          <div className="map-sidebar">
            {/* Search + filter */}
            <div className="sweep-controls">
              <input
                className="sweep-search"
                type="text"
                placeholder="Search street name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedStreet(null); }}
              />
              <label className="sweep-toggle">
                <input
                  type="checkbox"
                  checked={filterToday}
                  onChange={(e) => { setFilterToday(e.target.checked); setSelectedStreet(null); }}
                />
                <span>Today ({todayStr})</span>
              </label>
            </div>

            {/* Selected street detail */}
            {selectedStreet && (
              <div className="sweep-detail">
                <div className="sweep-detail-header">
                  <h4 className="sweep-detail-name">{selectedStreet.street}</h4>
                  <button className="sweep-detail-close" onClick={() => setSelectedStreet(null)}>&times;</button>
                </div>
                {selectedStreet.location && (
                  <p className="sweep-detail-loc">{selectedStreet.location}</p>
                )}
                <div className="sweep-detail-sides">
                  <div className="sweep-side">
                    <span className="sweep-side-label">Odd Side</span>
                    {selectedStreet.odd_side ? (
                      <>
                        <span className="sweep-side-day">{selectedStreet.odd_side.day || selectedStreet.odd_side.raw}</span>
                        {selectedStreet.odd_side.time && <span className="sweep-side-time">{selectedStreet.odd_side.time}</span>}
                      </>
                    ) : (
                      <span className="sweep-side-none">No sweeping</span>
                    )}
                  </div>
                  <div className="sweep-side">
                    <span className="sweep-side-label">Even Side</span>
                    {selectedStreet.even_side ? (
                      <>
                        <span className="sweep-side-day">{selectedStreet.even_side.day || selectedStreet.even_side.raw}</span>
                        {selectedStreet.even_side.time && <span className="sweep-side-time">{selectedStreet.even_side.time}</span>}
                      </>
                    ) : (
                      <span className="sweep-side-none">No sweeping</span>
                    )}
                  </div>
                </div>
                {isScheduledToday(selectedStreet) && (
                  <div className="sweep-today-badge">Sweeping today!</div>
                )}
              </div>
            )}

            {/* Street list */}
            <div className="sweep-list">
              {!data ? (
                <p className="sweep-loading">Loading schedule data...</p>
              ) : filteredStreets.length === 0 ? (
                <p className="sweep-empty">No streets found{search ? ` for "${search}"` : ''}.</p>
              ) : (
                filteredStreets.slice(0, 50).map((entry, i) => (
                  <button
                    key={`${entry.street}-${i}`}
                    className={`sweep-item${selectedStreet === entry ? ' sweep-item--active' : ''}${isScheduledToday(entry) ? ' sweep-item--today' : ''}`}
                    onClick={() => setSelectedStreet(entry)}
                  >
                    <span className="sweep-item-name">{entry.street}</span>
                    <span className="sweep-item-preview">
                      {formatSide(entry.odd_side, 'Odd')}
                    </span>
                    {entry.location && (
                      <span className="sweep-item-loc">{entry.location}</span>
                    )}
                  </button>
                ))
              )}
              {filteredStreets.length > 50 && (
                <p className="sweep-more">
                  Showing 50 of {filteredStreets.length} results. Refine your search.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapPage;
