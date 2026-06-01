import { Platform } from 'react-native';

// Native devices need your machine LAN IP. Expo web should call the host that
// served the web app, usually localhost or the same LAN host, on backend port 5000.
const LAN_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://172.16.200.39:5000/api';
const webHost =
  typeof window !== 'undefined' && window.location?.hostname
    ? window.location.hostname
    : 'localhost';

export const API_BASE_URL =
  Platform.OS === 'web'
    ? `http://${webHost}:5000/api`
    : LAN_API_BASE_URL;

export const socketOrigin = API_BASE_URL.replace(/\/api\/?$/i, '').trim();

export const SOCKET_OPTIONS = {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 3,
  reconnectionDelay: 1200,
  timeout: 6000,
};
