/**
 * build-normalized-sweeping.js
 *
 * Combines Daly City (JSON) and San Francisco (GeoJSON) street sweeping
 * datasets into a single normalized JSON file.
 *
 * Output schema per entry:
 *   city             string          — "Daly City" | "San Francisco"
 *   street_name      string          — primary corridor / street name
 *   block_limits     string | null   — block range description
 *   block_side       string | null   — cardinal side or city-specific label
 *   weekdays         string[]        — full day names (e.g. ["Monday","Thursday"])
 *   week_pattern     number[]        — which weeks of the month [1..5]
 *   start_hour       number          — 24h float (e.g. 6 = 6 AM, 8.5 = 8:30 AM)
 *   end_hour         number          — 24h float
 *   observes_holidays boolean        — true if schedule skips holidays
 *   geometry         number[][] | null — [[lon,lat],...] LineString, or null
 *   source_id        string | null   — city-internal ID for deduplication
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ROOT       = path.resolve(__dirname, '..');
const DC_FILE    = path.join(ROOT, 'scripts', 'data', 'StreetSweeping_DalyCity.json');
const SF_FILE    = path.join(ROOT, 'scripts', 'data', 'Street_Sweeping_Schedule_SF_20260413.geojson');
const OUT_FILE   = path.join(ROOT, 'public', 'StreetSweeping_Normalized.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const WEEKDAY_FULL = {
  Mon:  'Monday',
  Tues: 'Tuesday',
  Wed:  'Wednesday',
  Thu:  'Thursday',
  Fri:  'Friday',
  Sat:  'Saturday',
  Sun:  'Sunday',
};

/**
 * Parse a single time token like "6 AM", "8:30 AM", "1 PM", "12:00 PM", "10AM"
 * Returns a 24-hour float (minutes represented as fractions, e.g. 8.5 = 8:30).
 * Returns null if unparseable.
 */
function parseToken(token) {
  if (!token) return null;
  const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h   = parseInt(m[1], 10);
  const min = parseInt(m[2] || '0', 10);
  const period = m[3].toUpperCase();
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h + min / 60;
}

/**
 * Parse a Daly City time-range string such as "6 AM - 8 AM" or "8:30 AM - 10:30 AM".
 * Returns { start_hour, end_hour } as 24h floats, or nulls on failure.
 */
function parseDCTimeRange(raw) {
  if (!raw) return { start_hour: null, end_hour: null };
  const dash = raw.indexOf(' - ');
  if (dash === -1) {
    // fallback: try splitting on '-' with optional spaces (e.g. "8 AM - 10AM")
    const parts = raw.split(/-/).map(s => s.trim());
    if (parts.length < 2) return { start_hour: null, end_hour: null };
    let start = parseToken(parts[0]);
    let end   = parseToken(parts[1]);
    if (start !== null && end !== null && start > end) start = start - 12; // fix PM→AM typo
    return { start_hour: start, end_hour: end };
  }
  let start = parseToken(raw.slice(0, dash));
  let end   = parseToken(raw.slice(dash + 3));
  // Detect probable AM/PM typo: sweeping at 11 PM makes no sense; fix to AM
  if (start !== null && end !== null && start > end) start = start - 12;
  return { start_hour: start, end_hour: end };
}

// ---------------------------------------------------------------------------
// Daly City transformation
// ---------------------------------------------------------------------------
function transformDalyCity(dc) {
  const entries = [];
  for (const s of dc.streets) {
    for (const [sideKey, sideObj] of [['odd', s.odd_side], ['even', s.even_side]]) {
      if (!sideObj) continue;
      // Skip entries managed by another city (no real schedule)
      if (sideObj.note) continue;
      // Skip entries with no parseable day
      if (!sideObj.day) continue;

      const { start_hour, end_hour } = parseDCTimeRange(sideObj.time);
      // Keep the entry even if time is null — the side/day info is still useful
      entries.push({
        city:              'Daly City',
        street_name:       s.street,
        block_limits:      s.location || null,
        block_side:        sideKey === 'odd' ? 'Odd' : 'Even',
        weekdays:          sideObj.day.split('/').map(d => d.trim()),
        week_pattern:      [1, 2, 3, 4, 5],  // DC source has no weekly-pattern data
        start_hour,
        end_hour,
        observes_holidays: false,             // DC source has no holiday data
        geometry:          null,
        source_id:         null,
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// San Francisco transformation
// ---------------------------------------------------------------------------
function transformSanFrancisco(sf) {
  const entries = [];
  for (const feature of sf.features) {
    const p = feature.properties;

    // Build week_pattern from binary flags
    const week_pattern = [];
    for (let i = 1; i <= 5; i++) {
      if (p[`week${i}`] === '1') week_pattern.push(i);
    }

    entries.push({
      city:              'San Francisco',
      street_name:       p.corridor,
      block_limits:      p.limits || null,
      block_side:        p.blockside || (p.cnnrightleft === 'R' ? 'Right' : p.cnnrightleft === 'L' ? 'Left' : null),
      weekdays:          [WEEKDAY_FULL[p.weekday] || p.weekday],
      week_pattern,
      start_hour:        parseInt(p.fromhour, 10),
      end_hour:          parseInt(p.tohour, 10),
      observes_holidays: p.holidays === '1',
      geometry:          feature.geometry?.coordinates ?? null,
      source_id:         p.blocksweepid || null,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('Reading source files…');
const dc = JSON.parse(fs.readFileSync(DC_FILE, 'utf8'));
const sf = JSON.parse(fs.readFileSync(SF_FILE, 'utf8'));

console.log(`Daly City streets : ${dc.streets.length}`);
console.log(`SF features       : ${sf.features.length}`);

const dcEntries = transformDalyCity(dc);
const sfEntries = transformSanFrancisco(sf);

const all = [...dcEntries, ...sfEntries];

const output = {
  schema_version: '1.0',
  generated_at:   new Date().toISOString(),
  sources: {
    daly_city:     { original_file: 'StreetSweeping_DalyCity.json',                    scraped_at: dc.scraped_at,      entry_count: dcEntries.length },
    san_francisco: { original_file: 'Street_Sweeping_Schedule_SF_20260413.geojson',    updated_at: '2026-03-10',       entry_count: sfEntries.length },
  },
  total_entries: all.length,
  fields: [
    'city', 'street_name', 'block_limits', 'block_side',
    'weekdays', 'week_pattern', 'start_hour', 'end_hour',
    'observes_holidays', 'geometry', 'source_id',
  ],
  entries: all,
};

console.log(`Writing ${all.length} total entries to ${path.basename(OUT_FILE)}…`);
fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');

const stat = fs.statSync(OUT_FILE);
const mb   = (stat.size / 1024 / 1024).toFixed(2);
console.log(`Done. Output: ${OUT_FILE} (${mb} MB)`);
console.log(`  Daly City entries : ${dcEntries.length}`);
console.log(`  SF entries        : ${sfEntries.length}`);
