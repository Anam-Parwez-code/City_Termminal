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

export default client;
