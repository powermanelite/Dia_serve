"""
Scrapes street sweeping schedule from Daly City's website
and outputs a JSON file for the map page to consume.

Usage:
    pip install requests beautifulsoup4
    python Scape_Street_Sweeping_DalyCity.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

URL = "https://www.dalycity.org/460/Street-Sweeping-Schedule"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "StreetSweeping_DalyCity.json"


def scrape() -> list[dict]:
    response = requests.get(URL, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    records: list[dict] = []

    # The page uses tabbed panels, each containing a table
    tables = soup.find_all("table")

    for table in tables:
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) < 4:
                continue

            texts = [cell.get_text(separator=" ", strip=True) for cell in cells]

            street = texts[0]
            odd_side_raw = texts[1]
            even_side_raw = texts[2]
            location = texts[3] if len(texts) > 3 else "N/A"

            # Skip header rows
            if street.lower() in ("street", "streets", "street name", ""):
                continue
            if "odd" in street.lower() and "number" in street.lower():
                continue

            record = {
                "street": street,
                "odd_side": parse_schedule(odd_side_raw),
                "even_side": parse_schedule(even_side_raw),
                "location": location if location and location != "N/A" else None,
            }
            records.append(record)

    return records


def parse_schedule(raw: str) -> dict | None:
    """Parse a schedule cell like 'Thursday Between 6 am and 8 am' into structured data."""
    if not raw or raw.strip().lower() in ("n/a", "we don't sweep", "no sweep", ""):
        return None

    # Handle city-managed streets
    if "city of" in raw.lower() or "colma" in raw.lower() or "san francisco" in raw.lower():
        return {"day": raw.strip(), "time": None, "note": "Managed by another city"}

    # Extract day(s)
    day_pattern = r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)"
    days = re.findall(day_pattern, raw, re.IGNORECASE)

    # Also handle slash-separated days like "Monday/Wednesday/Friday"
    slash_days = re.findall(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))+", raw, re.IGNORECASE)

    day_str = ""
    if slash_days:
        day_str = slash_days[0]
    elif days:
        day_str = days[0]

    # Extract time range
    time_pattern = r"(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|Noon)\s*(?:-|to|and|&)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|Noon)"
    time_match = re.search(time_pattern, raw, re.IGNORECASE)

    def _normalize_time(t: str) -> str:
        """Convert 'Noon' to '12:00 PM' and normalize case."""
        t = t.strip()
        if t.upper() == "NOON":
            return "12:00 PM"
        return t.upper()

    time_str = None
    if time_match:
        time_str = f"{_normalize_time(time_match.group(1))} - {_normalize_time(time_match.group(2))}"
    elif "noon" in raw.lower():
        noon_match = re.search(r"Noon\s*(?:-|to|and|&)\s*(\d{1,2}(?::\d{2})?\s*(?:PM|pm))", raw, re.IGNORECASE)
        if noon_match:
            time_str = f"12:00 PM - {_normalize_time(noon_match.group(1))}"

    # Extract side info (North/South/East/West)
    side_match = re.search(r"(North|South|East|West)\s+Side", raw, re.IGNORECASE)
    side = side_match.group(1).capitalize() if side_match else None

    result: dict = {}
    if day_str:
        result["day"] = day_str
    if time_str:
        result["time"] = time_str
    if side:
        result["side"] = side

    # If we couldn't parse anything useful, store raw text
    if not result:
        return {"raw": raw.strip()}

    return result


def main():
    print(f"Scraping {URL} ...")
    records = scrape()
    print(f"Found {len(records)} street entries.")

    # Write JSON
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {
                "source": URL,
                "scraped_at": __import__("datetime").datetime.now().isoformat(),
                "total_streets": len(records),
                "streets": records,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
