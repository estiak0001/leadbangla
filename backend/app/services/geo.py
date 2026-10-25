"""Latitude/longitude helpers: validation and pulling coordinates out of a pasted Google Maps link."""
import re

_PATTERNS = [
    re.compile(r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)"),                 # .../maps/place/X/@23.78,90.41,17z
    re.compile(r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)"),             # data=!3d23.78!4d90.41
    re.compile(r"[?&](?:q|query|ll|center)=(-?\d{1,3}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)"),
    re.compile(r"^\s*(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)\s*$"),  # plain "23.78, 90.41"
]


def valid(lat: float | None, lng: float | None) -> bool:
    return lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180


def parse_map_text(text: str | None) -> tuple[float, float] | None:
    """Coordinates from a Google Maps URL or a 'lat, lng' pair, or None. (Short maps.app.goo.gl links can't be read offline.)"""
    if not text:
        return None
    for pat in _PATTERNS:
        m = pat.search(text)
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if valid(lat, lng):
                return lat, lng
    return None


def check_pair(lat, lng) -> tuple[float | None, float | None]:
    """Both or neither; within range. Raises ValueError with a friendly message."""
    if lat in (None, "") and lng in (None, ""):
        return None, None
    if lat in (None, "") or lng in (None, ""):
        raise ValueError("Enter both latitude and longitude")
    try:
        la, lo = float(lat), float(lng)
    except (TypeError, ValueError):
        raise ValueError("Latitude and longitude must be numbers")
    if not valid(la, lo):
        raise ValueError("Latitude must be between -90 and 90, longitude between -180 and 180")
    return round(la, 6), round(lo, 6)
