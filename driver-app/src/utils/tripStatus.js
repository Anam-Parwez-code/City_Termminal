export const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

export const formatTaskStatus = (status) => {
  const s = normalizeStatus(status);
  const map = {
    dispatched: 'Pending',
    driver_assigned: 'Assigned',
    en_route: 'En route to pickup',
    en_route_to_pickup: 'En route to pickup',
    arrived_pickup: 'At pickup',
    at_pickup: 'At pickup',
    barcode_issued: 'Barcode issued',
    en_route_airport: 'En route to airport',
    en_route_to_airport: 'En route to airport',
    at_airport: 'At terminal',
    arrived_at_airport: 'At terminal',
    at_terminal: 'At terminal',
  };
  if (map[s]) return map[s];
  if (s.includes('airport') || s.includes('terminal')) return 'At terminal';
  if (s.includes('pickup') && (s.includes('arrived') || s.includes('at_'))) return 'At pickup';
  if (s.includes('en_route')) return 'En route';
  return status || 'Pending';
};

export const statusToDone = (status) => {
  const normalized = normalizeStatus(status);
  return {
    enRoutePickup: [
      'en_route',
      'en_route_to_pickup',
      'arrived_pickup',
      'at_pickup',
      'barcode_issued',
      'en_route_airport',
      'at_airport',
    ].includes(normalized),
    atPickup: [
      'arrived_pickup',
      'at_pickup',
      'picked_up',
      'barcode_issued',
      'en_route_airport',
      'at_airport',
    ].includes(normalized),
    verifyPassenger: ['barcode_issued', 'en_route_airport', 'at_airport'].includes(normalized),
    airportTrip: ['en_route_airport', 'en_route_to_airport', 'at_airport'].includes(normalized),
    airportDone: ['at_airport', 'arrived_at_airport', 'arrived_-_at_airport', 'at_terminal'].includes(
      normalized,
    ),
  };
};

export const statusBadgeColor = (status) => {
  const s = normalizeStatus(status);
  if (s.includes('airport') || s === 'at_terminal') return { bg: '#163a1c', text: '#47d361' };
  if (s.includes('pickup') || s === 'barcode_issued') return { bg: '#EFF6FF', text: '#1D4ED8' };
  if (s.includes('en_route')) return { bg: '#FEF3C7', text: '#B45309' };
  return { bg: '#F3F4F6', text: '#374151' };
};
