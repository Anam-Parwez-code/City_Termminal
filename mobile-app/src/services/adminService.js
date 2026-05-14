import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE_URL = 'http://192.168.43.224:5000/api';
const TOKEN_KEY = 'city_terminal_admin_token';
const CURRENT_BOOKING_KEY = 'city_terminal_current_booking_id';

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

const adminApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const withToken = async () => {
  const token = await storage.getItem(TOKEN_KEY);
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
};

const adminService = {
  async login({ email, password }) {
    const res = await adminApi.post('/admin/auth/login', { email, password });
    if (res.data?.token) {
      await storage.setItem(TOKEN_KEY, res.data.token);
    }
    return res.data;
  },

  async signup({ email, password, name }) {
    let res;
    try {
      res = await adminApi.post('/admin/auth/signup', { email, password, name });
    } catch (error) {
      if (error?.response?.status === 409) {
        res = await adminApi.post('/admin/auth/login', { email, password });
      } else {
        throw error;
      }
    }
    if (res.data?.token) {
      await storage.setItem(TOKEN_KEY, res.data.token);
    }
    return res.data;
  },

  async logout() {
    await storage.deleteItem(TOKEN_KEY);
  },

  async saveCurrentBookingId(bookingId) {
    if (bookingId) {
      await storage.setItem(CURRENT_BOOKING_KEY, String(bookingId));
    }
  },

  async getCurrentBookingId() {
    return storage.getItem(CURRENT_BOOKING_KEY);
  },

  async isAuthenticated() {
    const token = await storage.getItem(TOKEN_KEY);
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
