import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SUPABASE_URL } from './services/supabaseClient';

export const KEYS = {
  BOOKING_ID: 'ct_driver_booking_id',
  DRIVER_ID: 'ct_driver_driver_id',
  VEHICLE_ID: 'ct_driver_vehicle_id',
  EMAIL: 'ct_driver_email',
  DRIVER_NAME: 'ct_driver_name',
  AUTH_TOKEN: 'ct_driver_auth_token',
  /** Set only when driver types ID on login — wins over Supabase metadata on restore */
  LAST_ENTERED_DRIVER_ID: 'ct_driver_last_entered_id',
};

export const normalizeDriverIdKey = (id) =>
  String(id || '')
    .trim()
    .toUpperCase()
    .replace(/^DRV-/, 'DR-');

export async function loadDriverSession() {
  const [bookingId, driverId, vehicleId, email, driverName, authToken, lastEntered] =
    await Promise.all([
      AsyncStorage.getItem(KEYS.BOOKING_ID),
      AsyncStorage.getItem(KEYS.DRIVER_ID),
      AsyncStorage.getItem(KEYS.VEHICLE_ID),
      AsyncStorage.getItem(KEYS.EMAIL),
      AsyncStorage.getItem(KEYS.DRIVER_NAME),
      AsyncStorage.getItem(KEYS.AUTH_TOKEN),
      AsyncStorage.getItem(KEYS.LAST_ENTERED_DRIVER_ID),
    ]);
  const resolvedDriverId =
    normalizeDriverIdKey(lastEntered) || normalizeDriverIdKey(driverId) || null;
  return {
    bookingId: bookingId?.trim() || null,
    driverId: resolvedDriverId,
    vehicleId: vehicleId?.trim() || null,
    email: email?.trim() || null,
    driverName: driverName?.trim() || null,
    authToken: authToken?.trim() || null,
    lastEnteredDriverId: normalizeDriverIdKey(lastEntered) || null,
  };
}

export async function saveLastEnteredDriverId(driverId) {
  const id = normalizeDriverIdKey(driverId);
  if (!id) return;
  await AsyncStorage.setItem(KEYS.LAST_ENTERED_DRIVER_ID, id);
  await AsyncStorage.setItem(KEYS.DRIVER_ID, id);
}

/** Backward compatible: saveDriverSession(bookingId, driverId, vehicleId) OR object */
export async function saveDriverSession(a = '', b = '', c = '') {
  if (a && typeof a === 'object') {
    const {
      bookingId = '',
      driverId = '',
      vehicleId = '',
      email = '',
      driverName = '',
      authToken = '',
    } = a;
    const did = normalizeDriverIdKey(driverId);
    await AsyncStorage.multiSet([
      [KEYS.BOOKING_ID, String(bookingId || '').trim()],
      [KEYS.DRIVER_ID, did],
      [KEYS.VEHICLE_ID, String(vehicleId || '').trim()],
      [KEYS.EMAIL, String(email || '').trim()],
      [KEYS.DRIVER_NAME, String(driverName || '').trim()],
      [KEYS.AUTH_TOKEN, String(authToken || '').trim()],
      ...(did ? [[KEYS.LAST_ENTERED_DRIVER_ID, did]] : []),
    ]);
    return;
  }
  await AsyncStorage.multiSet([
    [KEYS.BOOKING_ID, String(a || '').trim()],
    [KEYS.DRIVER_ID, String(b || '').trim()],
    [KEYS.VEHICLE_ID, String(c || '').trim()],
  ]);
}

const supabaseAuthStorageKey = () => {
  const ref = String(SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  return ref ? `sb-${ref}-auth-token` : null;
};

/** Remove driver keys + Supabase persisted auth (web localStorage included) */
export async function clearDriverSession() {
  const keys = [...Object.values(KEYS)];
  const sbKey = supabaseAuthStorageKey();
  if (sbKey) keys.push(sbKey);
  await AsyncStorage.multiRemove(keys);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    const toDrop = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith('ct_driver_') ||
          key.startsWith('sb-') ||
          key === 'city_terminal_admin_token')
      ) {
        toDrop.push(key);
      }
    }
    toDrop.forEach((key) => window.localStorage.removeItem(key));
  }
}
