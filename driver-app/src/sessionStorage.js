import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  BOOKING_ID: 'ct_driver_booking_id',
  DRIVER_ID: 'ct_driver_driver_id',
  VEHICLE_ID: 'ct_driver_vehicle_id',
};

export async function loadDriverSession() {
  const [bookingId, driverId, vehicleId] = await Promise.all([
    AsyncStorage.getItem(KEYS.BOOKING_ID),
    AsyncStorage.getItem(KEYS.DRIVER_ID),
    AsyncStorage.getItem(KEYS.VEHICLE_ID),
  ]);
  return {
    bookingId: (bookingId && bookingId.trim() !== '') ? bookingId : null,
    driverId: (driverId && driverId.trim() !== '') ? driverId : null,
    vehicleId: (vehicleId && vehicleId.trim() !== '') ? vehicleId : null,
  };
}

export async function saveDriverSession(bookingId = '', driverId = '', vehicleId = '') {
  await AsyncStorage.multiSet([
    [KEYS.BOOKING_ID, String(bookingId || '').trim()],
    [KEYS.DRIVER_ID, String(driverId || '').trim()],
    [KEYS.VEHICLE_ID, String(vehicleId || '').trim()],
  ]);
}

export async function clearDriverSession() {
  await AsyncStorage.multiRemove([KEYS.BOOKING_ID, KEYS.DRIVER_ID, KEYS.VEHICLE_ID]);
}
