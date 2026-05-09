import axios from 'axios';

// Update when testing on devices to match passenger app IP
const API_BASE_URL = 'http:// 172.17.128.1:5000/api';

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

export const socketOrigin = API_BASE_URL.replace(/\/api\/?$/i, '').trim();

export default client;
