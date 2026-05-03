// OpenStreetMap Nominatim — pickup search (Uber-style), works web + native.
const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

export async function searchPickupPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const url = `${SEARCH_URL}?format=json&q=${encodeURIComponent(q)}&limit=7&bounded=1&viewbox=54.89,24.92,55.62,25.43`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CityTerminal/1.0 (passenger pickup search)',
      'Accept-Language': 'en',
    },
  });

  if (!res.ok) {
    throw new Error('Places search unavailable');
  }

  const rows = await res.json();
  return Array.isArray(rows)
    ? rows.map((item) => ({
        id: String(item.place_id ?? item.osm_id ?? `${item.lat},${item.lon}`),
        label: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }))
    : [];
}
