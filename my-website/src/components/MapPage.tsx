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

function matchStreetName(geocodedName: string, streets: StreetEntry[]): StreetEntry | null {
  const normalized = geocodedName.toLowerCase().replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|way|place|pl|circle|cir)\b/g, '').trim();

  // Try exact match first
  for (const entry of streets) {
    const entryNorm = entry.street.toLowerCase().replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|way|place|pl|circle|cir)\b/g, '').trim();
    if (entryNorm === normalized) return entry;
  }

  // Try partial match (geocoded name contains or is contained in entry)
  for (const entry of streets) {
    const entryNorm = entry.street.toLowerCase().replace(/\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|way|place|pl|circle|cir)\b/g, '').trim();
    if (normalized.includes(entryNorm) || entryNorm.includes(normalized)) return entry;
  }

  return null;
}

interface MapPageProps {
  onAddToCalendar?: (request: SweepingCalendarRequest) => void;
}

function MapPage({ onAddToCalendar }: MapPageProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const droppedPinRef = useRef<L.Marker | null>(null);
  const [data, setData] = useState<SweepingData | null>(null);
  const [search, setSearch] = useState('');
  const [filterToday, setFilterToday] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<StreetEntry | null>(null);
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  // Fetch street sweeping data
  useEffect(() => {
    fetch('/Dia_serve/StreetSweeping_DalyCity.json')
      .then((r) => r.json())
      .then((d: SweepingData) => setData(d))
      .catch((err) => console.error('Failed to load street sweeping data:', err));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current) return;

    // Tear down existing map when data changes so click handler gets fresh closure
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      droppedPinRef.current = null;
    }

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

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      // Remove previous dropped pin
      if (droppedPinRef.current) {
        droppedPinRef.current.remove();
        droppedPinRef.current = null;
      }

      // Place a new pin
      const pin = L.marker([lat, lng], { icon: DEFAULT_ICON }).addTo(map);
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

        // Match against sweeping data
        const match = data ? matchStreetName(road, data.streets) : null;

        if (match) {
          const popup = `
            <div style="min-width:200px">
              <strong>${match.street}</strong>
              ${match.location ? `<br/><em style="font-size:0.85em;color:#666">${match.location}</em>` : ''}
              <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
              <div style="font-size:0.85em">
                <strong>Odd Side:</strong> ${match.odd_side ? (match.odd_side.day || match.odd_side.raw || 'N/A') + (match.odd_side.time ? ' ' + match.odd_side.time : '') : 'No sweeping'}<br/>
                <strong>Even Side:</strong> ${match.even_side ? (match.even_side.day || match.even_side.raw || 'N/A') + (match.even_side.time ? ' ' + match.even_side.time : '') : 'No sweeping'}
              </div>
              ${isScheduledToday(match) ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
            </div>
          `;
          pin.setPopupContent(popup);
          setSelectedStreet(match);
          setSearch(match.street);
          setPinStatus('found');
        } else {
          pin.setPopupContent(
            `<div><strong>${road}</strong><br/><span style="font-size:0.85em;color:#666">No sweeping data found for this street.<br/>It may not be in the Daly City schedule.</span></div>`
          );
          setPinStatus('no-match');
        }
      } catch {
        pin.setPopupContent('<strong>Lookup failed</strong><br/>Check your internet connection.');
        setPinStatus('error');
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
            Search for your street or click the map to drop a pin.
            Data sourced from{' '}
            <a href="https://www.dalycity.org/460/Street-Sweeping-Schedule" target="_blank" rel="noopener noreferrer" className="map-link">
              dalycity.org
            </a>.
          </p>
        </div>

        <div className="map-layout">
          <div className="map-container" ref={mapRef} />

          <div className="map-sidebar">
            {/* Pin status */}
            {pinStatus && (
              <div className={`pin-status pin-status--${pinStatus}`}>
                {pinStatus === 'loading' && 'Looking up street...'}
                {pinStatus === 'found' && 'Street found! Sweeping info shown below.'}
                {pinStatus === 'no-match' && 'Street not in Daly City sweeping schedule.'}
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
