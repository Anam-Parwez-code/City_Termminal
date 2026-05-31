import axios from 'axios';
import { API_BASE_URL } from '../config';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' },
});

export function apiErrorMessage(error) {
  const msg = error?.response?.data?.message;
  if (msg) return String(msg);
  if (error?.message) return error.message;
  return 'Request failed';
}

export async function fetchTripStatus(bookingId) {
  const id = String(bookingId || '').trim();
  if (!id) throw new Error('Booking ID missing');
  const { data } = await client.get(`/otp/status/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchBookingDetails(bookingId) {
  const id = String(bookingId || '').trim();
  if (!id) throw new Error('Booking ID missing');
  const { data } = await client.get(`/bookings/${encodeURIComponent(id)}`);
  return data;
}

export async function verifyPassengerVehicle({ bookingId, vehicleId }) {
  const id = String(bookingId || '').trim();
  const vehicle = String(vehicleId || '').trim();
  if (!id || !vehicle) throw new Error('Booking ID and Vehicle ID are required');
  const { data } = await client.post('/otp/verify-vehicle', {
    bookingId: id,
    vehicleId: vehicle,
  });
  return data;
}

export async function fetchPendingBookings(vehicleId) {
  const id = String(vehicleId || '').trim();
  if (!id) throw new Error('Vehicle ID missing');
  const { data } = await client.get(`/otp/pending/${encodeURIComponent(id)}`);
  return data?.bookings || [];
}

export async function fetchDriverTasks(driverId) {
  const id = String(driverId || '').trim();
  if (!id) throw new Error('Driver ID missing');
  const { data } = await client.get(`/otp/driver-tasks/${encodeURIComponent(id)}`);
  return data?.tasks || [];
}

export async function acceptBooking({ bookingId, vehicleId, driverId }) {
  const { data } = await client.post('/otp/accept-booking', {
    bookingId: String(bookingId || '').trim(),
    vehicleId: String(vehicleId || '').trim(),
    driverId: String(driverId || '').trim(),
  });
  return data;
}

/** Resolve CT-xxx for a driver id (DR-xxx) from assignments or drivers table */
export async function resolveVehicleForDriver(driverId) {
  const id = String(driverId || '').trim();
  if (!id) return null;
  try {
    const tasks = await fetchDriverTasks(id);
    const fromTask = tasks.find((t) => t.vehicleId)?.vehicleId;
    if (fromTask) return String(fromTask).toUpperCase();
  } catch (_e) {
    /* fall through */
  }
  return null;
}

export default client;
