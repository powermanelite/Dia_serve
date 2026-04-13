import { useEffect, useRef, useState } from 'react';
import type { SweepingCalendarRequest } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

// Fix default marker icon paths broken by bundlers
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DEFAULT_ICON = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });

const LOCATION_ICON = L.divIcon({
  className: 'location-pin-icon',
  html: '<div class="location-pin-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

const DALY_CITY_CENTER: L.LatLngTuple = [37.6879, -122.4702];
const SF_CENTER: L.LatLngTuple = [37.7749, -122.4194];

type City = 'daly-city' | 'san-francisco';

// ── Daly City types ──────────────────────────────────────────────
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

// ── SF types ─────────────────────────────────────────────────────
interface SFProperties {
  corridor: string;
  limits: string;
  blockside: string;
  fullname: string;
  weekday: string;
  fromhour: string;
  tohour: string;
  week1: string; week2: string; week3: string; week4: string; week5: string;
}

interface SFFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: SFProperties;
}

interface SFData {
  type: 'FeatureCollection';
  features: SFFeature[];
}

// ── Shared utilities ─────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTodayDay(): string {
  return DAY_NAMES[new Date().getDay()];
}

// ── Daly City utilities ──────────────────────────────────────────
function isScheduledToday(entry: StreetEntry): boolean {
  const today = getTodayDay();
  const matchesDay = (side: ScheduleSide | null) => side?.day?.includes(today) ?? false;
  return matchesDay(entry.odd_side) || matchesDay(entry.even_side);
}

function formatSide(side: ScheduleSide | null, label: string): string {
  if (!side) return `${label}: No sweeping`;
  if (side.raw) return `${label}: ${side.raw}`;
  if (side.note) return `${label}: ${side.note}`;
  return `${label}: ${[side.day, side.time].filter(Boolean).join(' ')}`;
}

function matchStreetName(geocodedName: string, streets: StreetEntry[]): StreetEntry | null {
  const norm = (s: string) => s.toLowerCase()
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|way|place|pl|circle|cir)\b/g, '').trim();
  const normRoad = norm(geocodedName);
  for (const entry of streets) {
    if (norm(entry.street) === normRoad) return entry;
  }
  for (const entry of streets) {
    const en = norm(entry.street);
    if (normRoad.includes(en) || en.includes(normRoad)) return entry;
  }
  return null;
}

// ── SF utilities ─────────────────────────────────────────────────
const WEEKDAY_FULL: Record<string, string> = {
  Mon: 'Monday', Tues: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

function formatSFHour(h: string): string {
  const n = parseInt(h);
  if (n === 0) return '12:00 AM';
  if (n < 12) return `${n}:00 AM`;
  if (n === 12) return '12:00 PM';
  return `${n - 12}:00 PM`;
}

function isScheduledTodaySF(f: SFFeature): boolean {
  return WEEKDAY_FULL[f.properties.weekday] === getTodayDay();
}

function matchSFCorridors(road: string, features: SFFeature[]): SFFeature[] {
  const norm = (s: string) => s.toLowerCase()
    .replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|way|place|pl|circle|cir)\b/g, '').trim();
  const normRoad = norm(road);
  return features.filter(f => {
    const nc = norm(f.properties.corridor);
    return nc === normRoad || nc.includes(normRoad) || normRoad.includes(nc);
  });
}

// ── Component ────────────────────────────────────────────────────
interface MapPageProps {
  onAddToCalendar?: (request: SweepingCalendarRequest) => void;
}

function MapPage({ onAddToCalendar }: MapPageProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const droppedPinRef = useRef<L.Marker | null>(null);
  const lookupAndPinRef = useRef<((lat: number, lng: number, icon: L.Icon | L.DivIcon) => void) | null>(null);

  const [city, setCity] = useState<City>('daly-city');
  const [data, setData] = useState<SweepingData | null>(null);
  const [sfData, setSFData] = useState<SFData | null>(null);
  const [search, setSearch] = useState('');
  const [filterToday, setFilterToday] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<StreetEntry | null>(null);
  const [selectedSFCorridors, setSelectedSFCorridors] = useState<SFFeature[]>([]);
  const [pinStatus, setPinStatus] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  function recenterToLocation() {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setIsLocating(false);
        mapInstanceRef.current?.setView([lat, lng], 15);
        lookupAndPinRef.current?.(lat, lng, LOCATION_ICON);
      },
      () => setIsLocating(false),
      { timeout: 8000 }
    );
  }

  function switchCity(next: City) {
    setCity(next);
    setSearch('');
    setSelectedStreet(null);
    setSelectedSFCorridors([]);
    setPinStatus(null);
  }

  // Fetch Daly City data
  useEffect(() => {
    fetch('./StreetSweeping_DalyCity.json')
      .then((r) => r.json())
      .then((d: SweepingData) => setData(d))
      .catch((err) => console.error('Failed to load Daly City data:', err));
  }, []);

  // Fetch SF data
  useEffect(() => {
    fetch('./Street_Sweeping_Schedule_SF_20260413.geojson')
      .then((r) => r.json())
      .then((d: SFData) => setSFData(d))
      .catch((err) => console.error('Failed to load SF data:', err));
  }, []);

  // Init / reinit map when city or data changes
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      droppedPinRef.current = null;
    }

    const center = city === 'san-francisco' ? SF_CENTER : DALY_CITY_CENTER;
    const map = L.map(mapRef.current, { center, zoom: 13, zoomControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Daly City default marker
    if (city === 'daly-city') {
      L.marker(DALY_CITY_CENTER, { icon: DEFAULT_ICON })
        .addTo(map)
        .bindPopup('<strong>Daly City</strong><br/>Street Sweeping Schedule Area');
    }

    // SF GeoJSON lines
    if (city === 'san-francisco' && sfData) {
      L.geoJSON(sfData as unknown as Parameters<typeof L.geoJSON>[0], {
        style: (feature) => {
          const f = feature as unknown as SFFeature;
          const today = isScheduledTodaySF(f);
          return { color: today ? '#F59E0B' : '#6366F1', weight: today ? 4 : 2.5, opacity: 0.7 };
        },
        onEachFeature: (feature, layer) => {
          const f = feature as unknown as SFFeature;
          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            const corridorFeatures = sfData.features.filter(feat => feat.properties.corridor === f.properties.corridor);
            setSelectedSFCorridors(corridorFeatures);
            setSearch(f.properties.corridor);
            setPinStatus(null);
          });
        },
      }).addTo(map);
    }

    mapInstanceRef.current = map;

    // Shared pin-drop + reverse-geocode logic
    async function lookupAndPin(lat: number, lng: number, icon: L.Icon | L.DivIcon) {
      if (droppedPinRef.current) {
        droppedPinRef.current.remove();
        droppedPinRef.current = null;
      }
      const pin = L.marker([lat, lng], { icon }).addTo(map);
      pin.bindPopup('<em>Looking up street...</em>').openPopup();
      droppedPinRef.current = pin;
      setPinStatus('loading');

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          { headers: { 'User-Agent': 'DalyCity-StreetSweeping-App' } }
        );
        const geo = await res.json();
        const road = geo?.address?.road;

        if (!road) {
          pin.setPopupContent('<strong>No street found</strong><br/>Try clicking closer to a road.');
          setPinStatus('not-found');
          return;
        }

        if (city === 'san-francisco') {
          const matches = sfData ? matchSFCorridors(road, sfData.features) : [];
          if (matches.length > 0) {
            const corridor = matches[0].properties.corridor;
            const unique = [...new Map(matches.map(f =>
              [`${f.properties.blockside}-${f.properties.fullname}-${f.properties.fromhour}`, f]
            )).values()];
            const isToday = matches.some(isScheduledTodaySF);
            const rows = unique.slice(0, 4).map(f =>
              `<div style="margin-bottom:3px"><strong>${f.properties.blockside}:</strong> ${f.properties.fullname} ${formatSFHour(f.properties.fromhour)}–${formatSFHour(f.properties.tohour)}</div>`
            ).join('');
            pin.setPopupContent(`
              <div style="min-width:200px">
                <strong>${corridor}</strong>
                <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
                <div style="font-size:0.85em">${rows}</div>
                ${isToday ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
              </div>`);
            setSelectedSFCorridors(matches);
            setSearch(corridor);
            setPinStatus('found');
          } else {
            pin.setPopupContent(`<div><strong>${road}</strong><br/><span style="font-size:0.85em;color:#666">No sweeping data for this street in SF schedule.</span></div>`);
            setPinStatus('no-match');
          }
        } else {
          const match = data ? matchStreetName(road, data.streets) : null;
          if (match) {
            pin.setPopupContent(`
              <div style="min-width:200px">
                <strong>${match.street}</strong>
                ${match.location ? `<br/><em style="font-size:0.85em;color:#666">${match.location}</em>` : ''}
                <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
                <div style="font-size:0.85em">
                  <strong>Odd Side:</strong> ${match.odd_side ? (match.odd_side.day || match.odd_side.raw || 'N/A') + (match.odd_side.time ? ' ' + match.odd_side.time : '') : 'No sweeping'}<br/>
                  <strong>Even Side:</strong> ${match.even_side ? (match.even_side.day || match.even_side.raw || 'N/A') + (match.even_side.time ? ' ' + match.even_side.time : '') : 'No sweeping'}
                </div>
                ${isScheduledToday(match) ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
              </div>`);
            setSelectedStreet(match);
            setSearch(match.street);
            setPinStatus('found');
          } else {
            pin.setPopupContent(`<div><strong>${road}</strong><br/><span style="font-size:0.85em;color:#666">No sweeping data for this street in Daly City schedule.</span></div>`);
            setPinStatus('no-match');
          }
        }
      } catch {
        pin.setPopupContent('<strong>Lookup failed</strong><br/>Check your internet connection.');
        setPinStatus('error');
      }
    }

    lookupAndPinRef.current = lookupAndPin;

    map.on('click', (e: L.LeafletMouseEvent) => {
      lookupAndPin(e.latlng.lat, e.latlng.lng, DEFAULT_ICON);
    });

    // Auto-drop pin on user location once data is ready
    const activeData = city === 'san-francisco' ? sfData : data;
    if (activeData && navigator.geolocation) {
      setPinStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          map.setView([lat, lng], 15);
          lookupAndPin(lat, lng, LOCATION_ICON);
        },
        () => setPinStatus(null),
        { timeout: 8000 }
      );
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, data, sfData]);

  // ── Derived list data ──────────────────────────────────────────

  const filteredStreets = data
    ? data.streets.filter((e) =>
        e.street.toLowerCase().includes(search.toLowerCase()) &&
        (!filterToday || isScheduledToday(e))
      )
    : [];

  const sfFilteredCorridors = sfData
    ? (() => {
        const map = new Map<string, SFFeature[]>();
        sfData.features.forEach((f) => {
          if (!map.has(f.properties.corridor)) map.set(f.properties.corridor, []);
          map.get(f.properties.corridor)!.push(f);
        });
        return [...map.entries()]
          .filter(([corridor, features]) =>
            corridor.toLowerCase().includes(search.toLowerCase()) &&
            (!filterToday || features.some(isScheduledTodaySF))
          )
          .map(([corridor, features]) => ({ corridor, features }));
      })()
    : [];

  const todayStr = getTodayDay();
  const selectedSFCorridor = selectedSFCorridors.length > 0 ? selectedSFCorridors[0].properties.corridor : null;
  const sfSchedules = [...new Map(
    selectedSFCorridors.map(f => [`${f.properties.blockside}-${f.properties.fullname}-${f.properties.fromhour}`, f])
  ).values()];
  const sfIsToday = selectedSFCorridors.some(isScheduledTodaySF);

  return (
    <div className="map-page">
      <div className="map-page-inner">
        <div className="map-header">
          <h1 className="map-title">
            {city === 'san-francisco' ? 'San Francisco' : 'Daly City'} Street Sweeping
          </h1>

          {/* City selector */}
          <div className="city-toggle">
            <button
              className={`city-toggle-btn${city === 'daly-city' ? ' city-toggle-btn--active' : ''}`}
              onClick={() => switchCity('daly-city')}
            >
              Daly City
            </button>
            <button
              className={`city-toggle-btn${city === 'san-francisco' ? ' city-toggle-btn--active' : ''}`}
              onClick={() => switchCity('san-francisco')}
            >
              San Francisco
            </button>
          </div>

          <p className="map-subtitle">
            Search for your street or click the map to drop a pin.
            Data sourced from{' '}
            {city === 'san-francisco' ? (
              <a href="https://data.sfgov.org/City-Infrastructure/Street-Sweeping-Schedule/yhqp-dzhd" target="_blank" rel="noopener noreferrer" className="map-link">
                SF Open Data
              </a>
            ) : (
              <a href="https://www.dalycity.org/460/Street-Sweeping-Schedule" target="_blank" rel="noopener noreferrer" className="map-link">
                dalycity.org
              </a>
            )}.
          </p>
        </div>

        <div className="map-layout">
          <div className="map-wrapper">
            <div className="map-container" ref={mapRef} />
            <button
              className={`map-recenter-btn${isLocating ? ' map-recenter-btn--locating' : ''}`}
              onClick={recenterToLocation}
              title="Recenter on my location"
              aria-label="Recenter on my location"
            >
              <LocateIcon />
            </button>
          </div>

          <div className="map-sidebar">
            {/* Pin status */}
            {pinStatus && (
              <div className={`pin-status pin-status--${pinStatus}`}>
                {pinStatus === 'locating' && 'Detecting your location...'}
                {pinStatus === 'loading' && 'Looking up street...'}
                {pinStatus === 'found' && 'Street found! Sweeping info shown below.'}
                {pinStatus === 'no-match' && 'Street not in sweeping schedule.'}
                {pinStatus === 'not-found' && 'No street detected. Try clicking closer to a road.'}
                {pinStatus === 'error' && 'Lookup failed. Check your connection.'}
                <button className="pin-status-close" onClick={() => setPinStatus(null)}>&times;</button>
              </div>
            )}

            {/* Search + filter */}
            <div className="sweep-controls">
              <input
                className="sweep-search"
                type="text"
                placeholder="Search street name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedStreet(null);
                  setSelectedSFCorridors([]);
                }}
              />
              <label className="sweep-toggle">
                <input
                  type="checkbox"
                  checked={filterToday}
                  onChange={(e) => {
                    setFilterToday(e.target.checked);
                    setSelectedStreet(null);
                    setSelectedSFCorridors([]);
                  }}
                />
                <span>Today ({todayStr})</span>
              </label>
            </div>

            {/* Daly City detail panel */}
            {city === 'daly-city' && selectedStreet && (
              <div className="sweep-detail">
                <div className="sweep-detail-header">
                  <h4 className="sweep-detail-name">{selectedStreet.street}</h4>
                  <button className="sweep-detail-close" onClick={() => setSelectedStreet(null)}>&times;</button>
                </div>
                {selectedStreet.location && <p className="sweep-detail-loc">{selectedStreet.location}</p>}
                <div className="sweep-detail-sides">
                  <div className="sweep-side">
                    <span className="sweep-side-label">Odd Side</span>
                    {selectedStreet.odd_side ? (
                      <>
                        <span className="sweep-side-day">{selectedStreet.odd_side.day || selectedStreet.odd_side.raw}</span>
                        {selectedStreet.odd_side.time && <span className="sweep-side-time">{selectedStreet.odd_side.time}</span>}
                      </>
                    ) : <span className="sweep-side-none">No sweeping</span>}
                  </div>
                  <div className="sweep-side">
                    <span className="sweep-side-label">Even Side</span>
                    {selectedStreet.even_side ? (
                      <>
                        <span className="sweep-side-day">{selectedStreet.even_side.day || selectedStreet.even_side.raw}</span>
                        {selectedStreet.even_side.time && <span className="sweep-side-time">{selectedStreet.even_side.time}</span>}
                      </>
                    ) : <span className="sweep-side-none">No sweeping</span>}
                  </div>
                </div>
                {isScheduledToday(selectedStreet) && <div className="sweep-today-badge">Sweeping today!</div>}
                {onAddToCalendar && (
                  <button
                    className="sweep-add-cal-btn"
                    onClick={() => onAddToCalendar({
                      street: selectedStreet.street,
                      oddSide: selectedStreet.odd_side,
                      evenSide: selectedStreet.even_side,
                    })}
                  >
                    Add to Calendar
                  </button>
                )}
              </div>
            )}

            {/* SF detail panel */}
            {city === 'san-francisco' && selectedSFCorridor && (
              <div className="sweep-detail">
                <div className="sweep-detail-header">
                  <h4 className="sweep-detail-name">{selectedSFCorridor}</h4>
                  <button className="sweep-detail-close" onClick={() => setSelectedSFCorridors([])}>&times;</button>
                </div>
                <div className="sf-schedules">
                  {sfSchedules.map((f, i) => (
                    <div key={i} className="sf-schedule-row">
                      <span className="sf-schedule-side">{f.properties.blockside}</span>
                      <div className="sf-schedule-info">
                        <span className="sweep-side-day">{f.properties.fullname}</span>
                        <span className="sweep-side-time">
                          {formatSFHour(f.properties.fromhour)} – {formatSFHour(f.properties.tohour)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {sfIsToday && <div className="sweep-today-badge">Sweeping today!</div>}
              </div>
            )}

            {/* Street list */}
            <div className="sweep-list">
              {city === 'daly-city' ? (
                !data ? (
                  <p className="sweep-loading">Loading schedule data...</p>
                ) : filteredStreets.length === 0 ? (
                  <p className="sweep-empty">No streets found{search ? ` for "${search}"` : ''}.</p>
                ) : (
                  <>
                    {filteredStreets.slice(0, 50).map((entry, i) => (
                      <button
                        key={`${entry.street}-${i}`}
                        className={`sweep-item${selectedStreet === entry ? ' sweep-item--active' : ''}${isScheduledToday(entry) ? ' sweep-item--today' : ''}`}
                        onClick={() => setSelectedStreet(entry)}
                      >
                        <span className="sweep-item-name">{entry.street}</span>
                        <span className="sweep-item-preview">{formatSide(entry.odd_side, 'Odd')}</span>
                        {entry.location && <span className="sweep-item-loc">{entry.location}</span>}
                      </button>
                    ))}
                    {filteredStreets.length > 50 && (
                      <p className="sweep-more">Showing 50 of {filteredStreets.length} results. Refine your search.</p>
                    )}
                  </>
                )
              ) : (
                !sfData ? (
                  <p className="sweep-loading">Loading SF schedule data...</p>
                ) : sfFilteredCorridors.length === 0 ? (
                  <p className="sweep-empty">No streets found{search ? ` for "${search}"` : ''}.</p>
                ) : (
                  <>
                    {sfFilteredCorridors.slice(0, 50).map(({ corridor, features }) => (
                      <button
                        key={corridor}
                        className={`sweep-item${selectedSFCorridor === corridor ? ' sweep-item--active' : ''}${features.some(isScheduledTodaySF) ? ' sweep-item--today' : ''}`}
                        onClick={() => setSelectedSFCorridors(features)}
                      >
                        <span className="sweep-item-name">{corridor}</span>
                        <span className="sweep-item-preview">
                          {features[0].properties.fullname} · {formatSFHour(features[0].properties.fromhour)}–{formatSFHour(features[0].properties.tohour)}
                        </span>
                      </button>
                    ))}
                    {sfFilteredCorridors.length > 50 && (
                      <p className="sweep-more">Showing 50 of {sfFilteredCorridors.length} results. Refine your search.</p>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export default MapPage;
