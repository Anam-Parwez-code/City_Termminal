import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'http://192.168.245.224:5000/api';
const TOKEN_KEY = 'city_terminal_admin_token';
const CURRENT_BOOKING_KEY = 'city_terminal_current_booking_id';

const adminApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const withToken = async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
};

const adminService = {
  async login({ email, password }) {
    const res = await adminApi.post('/admin/auth/login', { email, password });
    if (res.data?.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, res.data.token);
    }
    return res.data;
  },

  async signup({ email, password, name }) {
    const res = await adminApi.post('/admin/auth/signup', { email, password, name });
    if (res.data?.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, res.data.token);
    }
    return res.data;
  },

  async logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },

  async saveCurrentBookingId(bookingId) {
    if (bookingId) {
      await SecureStore.setItemAsync(CURRENT_BOOKING_KEY, String(bookingId));
    }
  },

  async getCurrentBookingId() {
    return SecureStore.getItemAsync(CURRENT_BOOKING_KEY);
  },

  async isAuthenticated() {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return Boolean(token);
  },

  async fetchStats() {
    const res = await adminApi.get('/admin/operations/stats', await withToken());
    return res.data;
  },

  async fetchVehicles() {
    const res = await adminApi.get('/admin/operations/vehicles', await withToken());
    return res.data;
  },

  async fetchPassengers(q = '') {
    const config = await withToken();
    config.params = q ? { q } : {};
    const res = await adminApi.get('/admin/operations/passengers', config);
    return res.data;
  },
};

export { TOKEN_KEY, CURRENT_BOOKING_KEY };
export default adminService;
