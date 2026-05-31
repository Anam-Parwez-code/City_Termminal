import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TRIP_KEY = 'ct_passenger_active_trip';

const storage = {
  async getItem(key) {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key) {
    if (Platform.OS === 'web') {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const normalizeStatus = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '_');

export async function savePassengerTrip(patch = {}) {
  const prev = (await loadPassengerTrip()) || {};
  const status = patch.status ?? prev.status;
  const norm = normalizeStatus(status);
  const atAirport =
    patch.atAirport === true ||
    norm === 'at_airport' ||
    norm.includes('at_airport') ||
    prev.atAirport === true;
  const vehicleVerified =
    patch.vehicleVerified === true ||
    ['barcode_issued', 'at_airport'].includes(norm) ||
    prev.vehicleVerified === true;

  let phase = patch.phase || prev.phase || 'tracking';
  if (atAirport) phase = 'boarding_pass';
  else if (vehicleVerified || norm.includes('pickup') || norm.includes('en_route')) phase = 'tracking';

  const next = {
    ...prev,
    ...patch,
    atAirport,
    vehicleVerified,
    phase,
    updatedAt: new Date().toISOString(),
  };
  await storage.setItem(TRIP_KEY, JSON.stringify(next));
  return next;
}

export async function loadPassengerTrip() {
  try {
    const raw = await storage.getItem(TRIP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearPassengerTrip() {
  await storage.deleteItem(TRIP_KEY);
}
