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


// ── Normalized data types ─────────────────────────────────────────
interface NormalizedEntry {
  city: 'Daly City' | 'San Francisco';
  street_name: string;
  block_limits: string | null;
  block_side: string | null;
  weekdays: string[];
  week_pattern: number[];
  start_hour: number | null;
  end_hour: number | null;
  observes_holidays: boolean;
  geometry: number[][] | null;
  source_id: string | null;
}

interface NormalizedData {
  schema_version: string;
  generated_at: string;
  total_entries: number;
  entries: NormalizedEntry[];
}

// ── Shared utilities ─────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTodayDay(): string {
  return DAY_NAMES[new Date().getDay()];
}

/** Format a 24-hour float (e.g. 8.5 = 8:30) as a 12-hour AM/PM string. */
function formatHour(n: number): string {
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  const pad = (x: number) => String(x).padStart(2, '0');
  if (h === 0)  return `12:${pad(m)} AM`;
  if (h < 12)  return `${h}:${pad(m)} AM`;
  if (h === 12) return `12:${pad(m)} PM`;
  return `${h - 12}:${pad(m)} PM`;
}

function formatTimeRange(start: number | null, end: number | null): string {
  if (start === null) return '';
  if (end === null) return formatHour(start);
  return `${formatHour(start)} – ${formatHour(end)}`;
}

/** Reconstruct a human-readable schedule description from weekdays + week_pattern. */
function formatScheduleDescription(weekdays: string[], week_pattern: number[]): string {
  const dayStr = weekdays.join(', ');
  if (week_pattern.length === 0 || week_pattern.length === 5) return dayStr;
  const ordinals: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  return `${dayStr} (${week_pattern.map(w => ordinals[w]).join(', ')})`;
}

// ── DC utilities ─────────────────────────────────────────────────
function normStreet(s: string): string {
  return s.toLowerCase()
    .replace(/\b(street|avenue|boulevard|drive|road|court|place|circle|way)\b/g, '')
    .replace(/\b(blvd|ave|dr|rd|ct|pl|cir)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function matchStreetName(geocodedName: string, streetMap: Map<string, NormalizedEntry[]>): string | null {
  const normRoad = normStreet(geocodedName);
  if (!normRoad) return null;
  for (const [name] of streetMap) {
    if (normStreet(name) === normRoad) return name;
  }
  for (const [name] of streetMap) {
    const en = normStreet(name);
    if (en && en.length >= 3 && normRoad.length >= 3 && (normRoad.includes(en) || en.includes(normRoad))) return name;
  }
  return null;
}

// ── SF utilities ─────────────────────────────────────────────────
/** Minimum distance from point (px,py) to segment (ax,ay)→(bx,by) in coordinate units. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Find the SF entry whose LineString geometry is closest to [lat, lng].
 * Returns null if nothing is within ~300 m (0.003 degrees).
 */
function findClosestSFEntry(lat: number, lng: number, entries: NormalizedEntry[]): NormalizedEntry | null {
  const MAX_DIST = 0.003;
  let minDist = Infinity;
  let closest: NormalizedEntry | null = null;
  for (const e of entries) {
    if (!e.geometry) continue;
    const coords = e.geometry;
    for (let i = 0; i < coords.length - 1; i++) {
      const d = distToSegment(lng, lat, coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
      if (d < minDist) { minDist = d; closest = e; }
    }
  }
  return minDist <= MAX_DIST ? closest : null;
}

/** Returns a meaningful side label; falls back to "Side N" when block_side is null. */
function sideLabel(blockSide: string | null, idx: number): string {
  return blockSide ?? `Side ${idx + 1}`;
}

// ── Component ────────────────────────────────────────────────────
interface MapPageProps {
  onAddToCalendar?: (request: SweepingCalendarRequest) => void;
  pinRequest?: string | null;
  onPinHandled?: () => void;
}

function MapPage({ onAddToCalendar, pinRequest, onPinHandled }: MapPageProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const droppedPinRef = useRef<L.Marker | null>(null);
  const lookupAndPinRef = useRef<((lat: number, lng: number, icon: L.Icon | L.DivIcon) => void) | null>(null);

  // showDC / showSF control which cities appear in the sidebar list only
  const [showDC, setShowDC] = useState(true);
  const [showSF, setShowSF] = useState(true);

  // Single normalized data source — split into DC map and SF entries on load
  const [normalizedData, setNormalizedData] = useState<NormalizedData | null>(null);
  const [dcStreetMap, setDCStreetMap] = useState<Map<string, NormalizedEntry[]>>(new Map());
  const [sfEntries, setSFEntries] = useState<NormalizedEntry[]>([]);
  const [sfCorridorMap, setSFCorridorMap] = useState<Map<string, NormalizedEntry[]>>(new Map());

  const [search, setSearch] = useState('');
  const [filterToday, setFilterToday] = useState(false);
  const [selectedDCStreetName, setSelectedDCStreetName] = useState<string | null>(null);
  const [selectedSFCorridorName, setSelectedSFCorridorName] = useState<string | null>(null);
  // Non-null when a pin was dropped: holds the entries for that specific limit block only
  const [pinnedSFLimitEntries, setPinnedSFLimitEntries] = useState<NormalizedEntry[] | null>(null);
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

  function handleDCCheckbox(checked: boolean) {
    setShowDC(checked);
    setSelectedDCStreetName(null);
    setSearch('');
    setPinStatus(null);
  }

  function handleSFCheckbox(checked: boolean) {
    setShowSF(checked);
    setSelectedSFCorridorName(null);
    setPinnedSFLimitEntries(null);
    setSearch('');
    setPinStatus(null);
  }

  // Fetch the single normalized dataset
  useEffect(() => {
    fetch('./StreetSweeping_Normalized.json')
      .then((r) => r.json())
      .then((d: NormalizedData) => {
        setNormalizedData(d);

        const dcMap = new Map<string, NormalizedEntry[]>();
        const sfArr: NormalizedEntry[] = [];
        const sfCorMap = new Map<string, NormalizedEntry[]>();

        for (const e of d.entries) {
          if (e.city === 'Daly City') {
            if (!dcMap.has(e.street_name)) dcMap.set(e.street_name, []);
            dcMap.get(e.street_name)!.push(e);
          } else {
            sfArr.push(e);
            if (!sfCorMap.has(e.street_name)) sfCorMap.set(e.street_name, []);
            sfCorMap.get(e.street_name)!.push(e);
          }
        }

        setDCStreetMap(dcMap);
        setSFEntries(sfArr);
        setSFCorridorMap(sfCorMap);
      })
      .catch((err) => console.error('Failed to load street sweeping data:', err));
  }, []);

  // Init / reinit map when mapCity or data changes
  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      droppedPinRef.current = null;
    }

    const map = L.map(mapRef.current, { center: DALY_CITY_CENTER, zoom: 12, zoomControl: true, closePopupOnClick: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // ── Pin-drop logic ────────────────────────────────────────────
    async function lookupAndPin(lat: number, lng: number, icon: L.Icon | L.DivIcon) {
      if (droppedPinRef.current) {
        droppedPinRef.current.remove();
        droppedPinRef.current = null;
      }
      const pin = L.marker([lat, lng], { icon }).addTo(map);
      droppedPinRef.current = pin;

      // Reverse-geocode first so we know which city the pin is in,
      // then route to the correct dataset.
      pin.bindPopup('<em>Looking up street...</em>').openPopup();
      setPinStatus('loading');

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo = await res.json();
        const road: string | undefined = geo?.address?.road;
        const nominatimCity: string = (
          geo?.address?.city ?? geo?.address?.town ?? geo?.address?.municipality ?? ''
        ).toLowerCase();

        // ── San Francisco → geometry-based match ──
        if (nominatimCity.includes('san francisco')) {
          const closest = sfEntries.length ? findClosestSFEntry(lat, lng, sfEntries) : null;
          if (closest) {
            const corridor = closest.street_name;
            const limits = closest.block_limits;
            const limitEntries = sfEntries.filter(
              e => e.street_name === corridor && e.block_limits === limits
            );
            const unique = [...new Map(limitEntries.map(e =>
              [`${e.block_side}-${e.weekdays.join(',')}-${e.start_hour}`, e]
            )).values()];
            const isToday = limitEntries.some(e => e.weekdays.includes(getTodayDay()));
            const rows = unique.map((e, i) =>
              `<div style="margin-bottom:3px"><strong>${sideLabel(e.block_side, i)}:</strong> ${formatScheduleDescription(e.weekdays, e.week_pattern)} ${formatTimeRange(e.start_hour, e.end_hour)}</div>`
            ).join('');
            pin.setPopupContent(`
              <div style="min-width:200px">
                <strong>${corridor}</strong>
                <br/><em style="font-size:0.8em;color:#666">${limits}</em>
                <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
                <div style="font-size:0.85em">${rows}</div>
                ${isToday ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
              </div>`);
            pin.openPopup();
            setSelectedSFCorridorName(corridor);
            setPinnedSFLimitEntries(unique);
            setSelectedDCStreetName(null);
            setSearch(corridor);
            setPinStatus('found');
          } else {
            pin.setPopupContent('<strong>No sweeping data</strong><br/><span style="font-size:0.85em;color:#666">No street found near this point.</span>');
            pin.openPopup();
            setPinStatus('no-match');
          }
          return;
        }

        // ── Daly City (or any other area) → street-name match ──
        if (!road) {
          pin.setPopupContent('<strong>No sweeping data</strong><br/><span style="font-size:0.85em;color:#666">No street found near this point.</span>');
          pin.openPopup();
          setPinStatus('no-match');
          return;
        }

        const matchName = dcStreetMap.size ? matchStreetName(road, dcStreetMap) : null;
        if (matchName) {
          const entries = dcStreetMap.get(matchName)!;
          const blockLimits = entries[0]?.block_limits;
          const isToday = entries.some(e => e.weekdays.includes(getTodayDay()));
          const sideRows = entries.map((e, i) =>
            `<div style="margin-bottom:2px"><strong>${sideLabel(e.block_side, i)}:</strong> ${e.weekdays.join(', ')}${e.start_hour !== null ? ' ' + formatTimeRange(e.start_hour, e.end_hour) : ''}</div>`
          ).join('');
          pin.setPopupContent(`
            <div style="min-width:200px">
              <strong>${matchName}</strong>
              ${blockLimits ? `<br/><em style="font-size:0.85em;color:#666">${blockLimits}</em>` : ''}
              <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
              <div style="font-size:0.85em">${sideRows}</div>
              ${isToday ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
            </div>`);
          pin.openPopup();
          setSelectedDCStreetName(matchName);
          setSelectedSFCorridorName(null);
          setSearch(matchName);
          setPinStatus('found');
        } else {
          pin.setPopupContent('<strong>No sweeping data</strong><br/><span style="font-size:0.85em;color:#666">This street is not in the sweeping schedule.</span>');
          pin.openPopup();
          setSelectedDCStreetName(null);
          setSearch('');
          setPinStatus('no-match');
        }
      } catch {
        pin.setPopupContent('<strong>Lookup failed</strong><br/>Check your internet connection.');
        pin.openPopup();
        setPinStatus('error');
      }
    }

    lookupAndPinRef.current = lookupAndPin;

    mapInstanceRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      lookupAndPin(e.latlng.lat, e.latlng.lng, DEFAULT_ICON);
    });

    // Auto-drop pin on user location — skip if a calendar pin request is pending
    if (sfEntries.length > 0 && navigator.geolocation && !pinRequest) {
      setPinStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          map.setView([lat, lng], 15, { animate: false });
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
  }, [dcStreetMap, sfEntries]);

  // ── Auto-pin when navigating from calendar ────────────────────────
  useEffect(() => {
    if (!pinRequest || !mapInstanceRef.current) return;

    // "Corridor Name (block limits)" → split corridor from optional limit
    const parenMatch = pinRequest.match(/^(.+?)\s*\((.+)\)$/);
    const corridorName = parenMatch ? parenMatch[1].trim() : pinRequest.trim();
    const limitHint   = parenMatch ? parenMatch[2].trim() : null;

    // SF path first — corridor names from calendar are exact SF keys
    if (sfCorridorMap.size && sfCorridorMap.has(corridorName)) {
      const allEntries = sfCorridorMap.get(corridorName)!;
      setSelectedSFCorridorName(corridorName);
      setSelectedDCStreetName(null);

      if (limitHint) {
        const limitEntries = allEntries.filter(e => e.block_limits === limitHint);
        if (limitEntries.length > 0) {
          const unique = [...new Map(limitEntries.map(e =>
            [`${e.block_side}-${e.weekdays.join(',')}-${e.start_hour}`, e]
          )).values()];
          setPinnedSFLimitEntries(unique);
          pinCorridorOnMap(limitEntries);
          onPinHandled?.();
          return;
        }
      }

      // No specific limit — show the full corridor
      setPinnedSFLimitEntries(null);
      pinCorridorOnMap(allEntries);
      onPinHandled?.();
      return;
    }

    // DC path — use exact match first, fuzzy only as fallback
    if (dcStreetMap.size) {
      const dcMatch = dcStreetMap.has(corridorName)
        ? corridorName
        : matchStreetName(corridorName, dcStreetMap);
      if (dcMatch) {
        const entries = dcStreetMap.get(dcMatch)!;
        setSelectedDCStreetName(dcMatch);
        setSelectedSFCorridorName(null);
        setPinnedSFLimitEntries(null);
        pinStreetOnMap(dcMatch, entries);
        onPinHandled?.();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinRequest, dcStreetMap, sfCorridorMap]);

  // ── Forward-geocode a DC street and drop a pin on it ─────────────
  async function pinStreetOnMap(streetName: string, entries: NormalizedEntry[]) {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?street=${encodeURIComponent(streetName)}&city=Daly+City&state=CA&country=US&format=json&limit=1`
      );
      if (!res.ok) return;
      const results = await res.json();
      if (!Array.isArray(results) || !results.length) return;

      const lat = parseFloat(results[0].lat);
      const lng = parseFloat(results[0].lon);
      if (isNaN(lat) || isNaN(lng)) return;

      if (droppedPinRef.current) {
        droppedPinRef.current.remove();
        droppedPinRef.current = null;
      }

      const pin = L.marker([lat, lng], { icon: DEFAULT_ICON }).addTo(map);
      droppedPinRef.current = pin;
      map.setView([lat, lng], 16, { animate: false });

      const blockLimits = entries[0]?.block_limits;
      const isToday = entries.some(e => e.weekdays.includes(getTodayDay()));
      const sideRows = entries.map((e, i) =>
        `<div style="margin-bottom:2px"><strong>${sideLabel(e.block_side, i)}:</strong> ${e.weekdays.join(', ')}${e.start_hour !== null ? ' ' + formatTimeRange(e.start_hour, e.end_hour) : ''}</div>`
      ).join('');

      pin.bindPopup(`
        <div style="min-width:200px">
          <strong>${streetName}</strong>
          ${blockLimits ? `<br/><em style="font-size:0.85em;color:#666">${blockLimits}</em>` : ''}
          <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
          <div style="font-size:0.85em">${sideRows}</div>
          ${isToday ? '<div style="margin-top:6px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
        </div>`).openPopup();
    } catch {
      // geocode failed silently — detail panel still shows in sidebar
    }
  }

  // ── Pin an SF corridor using its geometry (no geocoding needed) ──
  function pinCorridorOnMap(entries: NormalizedEntry[]) {
    const map = mapInstanceRef.current;
    if (!map) return;

    const firstWithGeom = entries.find(e => e.geometry && e.geometry.length >= 2);
    if (!firstWithGeom) return;

    const coords = firstWithGeom.geometry!;
    const midIdx = Math.floor(coords.length / 2);
    const lat = coords[midIdx][1];
    const lng = coords[midIdx][0];

    if (droppedPinRef.current) {
      droppedPinRef.current.remove();
      droppedPinRef.current = null;
    }

    const pin = L.marker([lat, lng], { icon: DEFAULT_ICON }).addTo(map);
    droppedPinRef.current = pin;
    map.setView([lat, lng], 16, { animate: false });

    const corridor = entries[0].street_name;
    const isToday = entries.some(e => e.weekdays.includes(getTodayDay()));

    const byLimits = new Map<string, NormalizedEntry[]>();
    for (const e of entries) {
      const key = e.block_limits ?? '';
      if (!byLimits.has(key)) byLimits.set(key, []);
      byLimits.get(key)!.push(e);
    }

    const content = [...byLimits.entries()].map(([limits, lEntries]) => {
      const unique = [...new Map(lEntries.map(e =>
        [`${e.block_side}-${e.weekdays.join(',')}-${e.start_hour}`, e]
      )).values()];
      const rows = unique.map((e, i) =>
        `<div style="margin-bottom:2px"><strong>${sideLabel(e.block_side, i)}:</strong> ${formatScheduleDescription(e.weekdays, e.week_pattern)} ${formatTimeRange(e.start_hour, e.end_hour)}</div>`
      ).join('');
      return `
        <div style="margin-bottom:6px">
          <em style="font-size:0.78em;color:#888;text-transform:uppercase;letter-spacing:0.03em">${limits}</em>
          <div style="font-size:0.83em;margin-top:2px">${rows}</div>
        </div>`;
    }).join('');

    pin.bindPopup(`
      <div style="min-width:200px;max-height:240px;overflow-y:auto">
        <strong>${corridor}</strong>
        <hr style="margin:6px 0;border:none;border-top:1px solid #ddd"/>
        ${content}
        ${isToday ? '<div style="margin-top:4px;background:#FEF3C7;color:#92400E;padding:4px 8px;border-radius:12px;font-size:0.8em;font-weight:700;text-align:center">Sweeping today!</div>' : ''}
      </div>`).openPopup();
  }

  // ── Derived list data ─────────────────────────────────────────
  const today = getTodayDay();

  const filteredDCStreets = showDC && dcStreetMap.size
    ? [...dcStreetMap.entries()]
        .filter(([name, entries]) =>
          name.toLowerCase().includes(search.toLowerCase()) &&
          (!filterToday || entries.some(e => e.weekdays.includes(today)))
        )
        .map(([name, entries]) => ({ name, entries }))
    : [];

  const filteredSFCorridors = showSF && sfCorridorMap.size
    ? [...sfCorridorMap.entries()]
        .filter(([corridor, entries]) =>
          corridor.toLowerCase().includes(search.toLowerCase()) &&
          (!filterToday || entries.some(e => e.weekdays.includes(today)))
        )
        .map(([corridor, entries]) => ({ corridor, entries }))
    : [];

  const selectedDCEntries = selectedDCStreetName ? (dcStreetMap.get(selectedDCStreetName) ?? []) : [];
  const selectedSFEntries = selectedSFCorridorName ? (sfCorridorMap.get(selectedSFCorridorName) ?? []) : [];

  const sfByLimits = (() => {
    const m = new Map<string, NormalizedEntry[]>();
    for (const e of selectedSFEntries) {
      const key = e.block_limits ?? '';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return [...m.entries()].map(([limits, entries]) => ({ limits, entries }));
  })();

  const sfIsToday = selectedSFEntries.some(e => e.weekdays.includes(today));

  return (
    <div className="map-page">
      <div className="map-page-inner">
        <div className="map-header">
          <h1 className="map-title">Street Sweeping Schedule</h1>

          <p className="map-subtitle">
            Search for your street or click the map to drop a pin.{' '}
            Data sourced from{' '}
            <a href="https://www.dalycity.org/460/Street-Sweeping-Schedule" target="_blank" rel="noopener noreferrer" className="map-link">dalycity.org</a>
            {' '}and{' '}
            <a href="https://data.sfgov.org/City-Infrastructure/Street-Sweeping-Schedule/yhqp-dzhd" target="_blank" rel="noopener noreferrer" className="map-link">SF Open Data</a>.
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
                  setSelectedDCStreetName(null);
                  setSelectedSFCorridorName(null);
                  setPinnedSFLimitEntries(null);
                }}
              />
              <div className="sweep-filters">
                <label className="sweep-toggle">
                  <input
                    type="checkbox"
                    checked={filterToday}
                    onChange={(e) => {
                      setFilterToday(e.target.checked);
                      setSelectedDCStreetName(null);
                      setSelectedSFCorridorName(null);
                    }}
                  />
                  <span>Today ({today})</span>
                </label>
                <label className="sweep-toggle sweep-toggle--dc">
                  <input
                    type="checkbox"
                    checked={showDC}
                    onChange={(e) => handleDCCheckbox(e.target.checked)}
                  />
                  <span>Daly City</span>
                </label>
                <label className="sweep-toggle sweep-toggle--sf">
                  <input
                    type="checkbox"
                    checked={showSF}
                    onChange={(e) => handleSFCheckbox(e.target.checked)}
                  />
                  <span>San Francisco</span>
                </label>
              </div>
            </div>

            {/* Daly City detail panel */}
            {selectedDCStreetName && (
              <div className="sweep-detail">
                <div className="sweep-detail-header">
                  <h4 className="sweep-detail-name">{selectedDCStreetName}</h4>
                  <button className="sweep-detail-close" onClick={() => setSelectedDCStreetName(null)}>&times;</button>
                </div>
                {selectedDCEntries[0]?.block_limits && (
                  <p className="sweep-detail-loc">{selectedDCEntries[0].block_limits}</p>
                )}
                <div className="sweep-detail-sides">
                  {selectedDCEntries.map((e, i) => (
                    <div key={i} className="sweep-side">
                      <span className="sweep-side-label">{e.block_side ? `${e.block_side} Side` : `Side ${i + 1}`}</span>
                      {e.weekdays.length > 0 ? (
                        <>
                          <span className="sweep-side-day">{e.weekdays.join(', ')}</span>
                          {e.start_hour !== null && (
                            <span className="sweep-side-time">{formatTimeRange(e.start_hour, e.end_hour)}</span>
                          )}
                        </>
                      ) : (
                        <span className="sweep-side-none">No sweeping</span>
                      )}
                    </div>
                  ))}
                </div>
                {selectedDCEntries.some(e => e.weekdays.includes(today)) && (
                  <div className="sweep-today-badge">Sweeping today!</div>
                )}
                {onAddToCalendar && (
                  <button
                    className="sweep-add-cal-btn"
                    onClick={() => onAddToCalendar({
                      street: selectedDCStreetName,
                      sides: selectedDCEntries.map((e, i) => ({
                        label: e.block_side ? `${e.block_side} side` : `Side ${i + 1}`,
                        day: e.weekdays.join('/'),
                        time: formatTimeRange(e.start_hour, e.end_hour),
                      })),
                    })}
                  >
                    Add to Calendar
                  </button>
                )}
              </div>
            )}

            {/* SF detail panel */}
            {selectedSFCorridorName && (
              <div className="sweep-detail">
                <div className="sweep-detail-header">
                  <h4 className="sweep-detail-name">{selectedSFCorridorName}</h4>
                  <button className="sweep-detail-close" onClick={() => { setSelectedSFCorridorName(null); setPinnedSFLimitEntries(null); }}>&times;</button>
                </div>

                {pinnedSFLimitEntries ? (
                  /* Pin-drop view: show only the matched limit block, no scroll */
                  <div className="sf-limits-group">
                    <span className="sf-limits-label">{pinnedSFLimitEntries[0]?.block_limits ?? ''}</span>
                    {pinnedSFLimitEntries.map((e: NormalizedEntry, i: number) => (
                      <div key={i} className="sf-schedule-row">
                        <span className="sf-schedule-side">{sideLabel(e.block_side, i)}</span>
                        <div className="sf-schedule-info">
                          <span className="sweep-side-day">{formatScheduleDescription(e.weekdays, e.week_pattern)}</span>
                          {e.start_hour !== null && (
                            <span className="sweep-side-time">{formatTimeRange(e.start_hour, e.end_hour)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {onAddToCalendar && (
                      <button
                        className="sweep-add-cal-btn"
                        onClick={() => onAddToCalendar({
                          street: `${selectedSFCorridorName} (${pinnedSFLimitEntries[0]?.block_limits ?? ''})`,
                          sides: pinnedSFLimitEntries.map((e: NormalizedEntry) => ({
                            label: e.block_side ?? 'Side',
                            day: e.weekdays.join('/'),
                            time: formatTimeRange(e.start_hour, e.end_hour),
                          })),
                        })}
                      >
                        Add to Calendar
                      </button>
                    )}
                  </div>
                ) : (
                  /* List-click view: all limit blocks, scrollable */
                  <div className="sf-schedules">
                    {sfByLimits.map(({ limits, entries: limitsEntries }: { limits: string; entries: NormalizedEntry[] }) => (
                      <div key={limits} className="sf-limits-entry">
                        <div
                          className="sf-limits-group sf-limits-group--clickable"
                          onClick={() => { setPinnedSFLimitEntries(limitsEntries); pinCorridorOnMap(limitsEntries); }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(ev) => { if (ev.key === 'Enter') { setPinnedSFLimitEntries(limitsEntries); pinCorridorOnMap(limitsEntries); } }}
                          title="Click to pin this block on the map"
                        >
                          <span className="sf-limits-label">{limits}</span>
                          {limitsEntries.map((e: NormalizedEntry, i: number) => (
                            <div key={i} className="sf-schedule-row">
                              <span className="sf-schedule-side">{sideLabel(e.block_side, i)}</span>
                              <div className="sf-schedule-info">
                                <span className="sweep-side-day">{formatScheduleDescription(e.weekdays, e.week_pattern)}</span>
                                {e.start_hour !== null && (
                                  <span className="sweep-side-time">{formatTimeRange(e.start_hour, e.end_hour)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {onAddToCalendar && (
                          <button
                            className="sweep-add-cal-btn"
                            onClick={() => onAddToCalendar({
                              street: `${selectedSFCorridorName} (${limits})`,
                              sides: limitsEntries.map((e: NormalizedEntry) => ({
                                label: e.block_side ?? 'Side',
                                day: e.weekdays.join('/'),
                                time: formatTimeRange(e.start_hour, e.end_hour),
                              })),
                            })}
                          >
                            Add to Calendar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="sweep-detail-footer">
                  {sfIsToday && <div className="sweep-today-badge">Sweeping today!</div>}
                </div>
              </div>
            )}

            {/* Street list — hidden when a detail panel is active */}
            <div className={`sweep-list${selectedDCStreetName || selectedSFCorridorName ? ' sweep-list--hidden' : ''}`}>
              {!normalizedData ? (
                <p className="sweep-loading">Loading schedule data...</p>
              ) : !showDC && !showSF ? (
                <p className="sweep-empty">Select at least one city above.</p>
              ) : filteredDCStreets.length === 0 && filteredSFCorridors.length === 0 ? (
                <p className="sweep-empty">No streets found{search ? ` for "${search}"` : ''}.</p>
              ) : (
                <>
                  {/* Daly City section */}
                  {showDC && filteredDCStreets.length > 0 && (
                    <>
                      {showSF && <p className="sweep-list-section-label sweep-list-section-label--dc">Daly City</p>}
                      {filteredDCStreets.slice(0, 50).map(({ name, entries }) => (
                        <button
                          key={name}
                          className={`sweep-item${selectedDCStreetName === name ? ' sweep-item--active' : ''}${entries.some(e => e.weekdays.includes(today)) ? ' sweep-item--today' : ''}`}
                          onClick={() => { setSelectedDCStreetName(name); setSelectedSFCorridorName(null); pinStreetOnMap(name, entries); }}
                        >
                          <span className="sweep-item-name">
                            {name}
                            {showSF && <span className="sweep-item-badge sweep-item-badge--dc">DC</span>}
                          </span>
                          <span className="sweep-item-preview">
                            {entries[0]
                              ? `${sideLabel(entries[0].block_side, 0)}: ${entries[0].weekdays.join(', ')}${entries[0].start_hour !== null ? ' ' + formatTimeRange(entries[0].start_hour, entries[0].end_hour) : ''}`
                              : ''}
                          </span>
                          {entries[0]?.block_limits && (
                            <span className="sweep-item-loc">{entries[0].block_limits}</span>
                          )}
                        </button>
                      ))}
                      {filteredDCStreets.length > 50 && (
                        <p className="sweep-more">Showing 50 of {filteredDCStreets.length} results. Refine your search.</p>
                      )}
                    </>
                  )}

                  {/* San Francisco section */}
                  {showSF && filteredSFCorridors.length > 0 && (
                    <>
                      {showDC && <p className="sweep-list-section-label sweep-list-section-label--sf">San Francisco</p>}
                      {filteredSFCorridors.slice(0, 50).map(({ corridor, entries }) => (
                        <button
                          key={corridor}
                          className={`sweep-item${selectedSFCorridorName === corridor ? ' sweep-item--active' : ''}${entries.some(e => e.weekdays.includes(today)) ? ' sweep-item--today' : ''}`}
                          onClick={() => { setSelectedSFCorridorName(corridor); setPinnedSFLimitEntries(null); setSelectedDCStreetName(null); pinCorridorOnMap(entries); }}
                        >
                          <span className="sweep-item-name">
                            {corridor}
                            {showDC && <span className="sweep-item-badge sweep-item-badge--sf">SF</span>}
                          </span>
                          <span className="sweep-item-preview">
                            {entries[0]
                              ? `${formatScheduleDescription(entries[0].weekdays, entries[0].week_pattern)} · ${formatTimeRange(entries[0].start_hour, entries[0].end_hour)}`
                              : ''}
                          </span>
                        </button>
                      ))}
                      {filteredSFCorridors.length > 50 && (
                        <p className="sweep-more">Showing 50 of {filteredSFCorridors.length} results. Refine your search.</p>
                      )}
                    </>
                  )}
                </>
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
