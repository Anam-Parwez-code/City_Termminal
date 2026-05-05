import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  BOOKING_ID: 'ct_driver_booking_id',
  VEHICLE_ID: 'ct_driver_vehicle_id',
};

export async function loadDriverSession() {
  const [bookingId, vehicleId] = await Promise.all([
    AsyncStorage.getItem(KEYS.BOOKING_ID),
    AsyncStorage.getItem(KEYS.VEHICLE_ID),
  ]);
  return {
    bookingId: bookingId || '',
    vehicleId: vehicleId || '',
  };
}

export async function saveDriverSession(bookingId, vehicleId) {
  await AsyncStorage.multiSet([
    [KEYS.BOOKING_ID, String(bookingId || '').trim()],
    [KEYS.VEHICLE_ID, String(vehicleId || '').trim()],
  ]);
}

export async function clearDriverSession() {
  await AsyncStorage.multiRemove([KEYS.BOOKING_ID, KEYS.VEHICLE_ID]);
}
