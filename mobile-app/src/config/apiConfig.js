import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 5000;

/**
 * Expo dev server host → same PC IP for backend (physical phone on same WiFi).
 * e.g. debuggerHost "192.168.1.5:8081" → API http://192.168.1.5:5000
 */
const getDevMachineIp = () => {
  const candidates = [
    Constants.expoGoConfig?.debuggerHost,
    Constants.expoConfig?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw).replace(/^https?:\/\//, '').split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') continue;
    return host;
  }
  return null;
};

const isAndroidEmulator = () => {
  if (Platform.OS !== 'android') return false;
  // Physical Android phone
  if (Constants.isDevice === true) return false;
  const model = Constants.platform?.android?.model || '';
  if (/sdk|emulator|google_sdk|Android SDK built for x86/i.test(model)) return true;
  return Constants.isDevice === false;
};

/**
 * API host (no /api suffix).
 * Physical phone: set mobile-app/.env → EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:5000
 * Or rely on auto-detect from Expo debugger host (same WiFi).
 */
export const getApiHost = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/i, '').replace(/\/$/, '');
  }

  const devIp = getDevMachineIp();

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const { hostname } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://127.0.0.1:${API_PORT}`;
      }
      return `http://${hostname}:${API_PORT}`;
    }
    return `http://127.0.0.1:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    if (isAndroidEmulator()) {
      return `http://10.0.2.2:${API_PORT}`;
    }
    if (devIp) {
      return `http://${devIp}:${API_PORT}`;
    }
    return `http://10.0.2.2:${API_PORT}`;
  }

  if (Platform.OS === 'ios') {
    if (devIp) {
      return `http://${devIp}:${API_PORT}`;
    }
    return `http://127.0.0.1:${API_PORT}`;
  }

  return devIp ? `http://${devIp}:${API_PORT}` : `http://127.0.0.1:${API_PORT}`;
};

export const API_BASE_URL = `${getApiHost()}/api`;
export const AI_BASE_URL =
  process.env.EXPO_PUBLIC_AI_URL?.trim() || getApiHost().replace(`:${API_PORT}`, ':8000');

export const getSocketBaseUrl = () => getApiHost();

/** Logged in dev — helps debug physical device connection */
export const getApiConnectionHint = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return `Using EXPO_PUBLIC_API_URL → ${getApiHost()}`;
  }
  const devIp = getDevMachineIp();
  if (Platform.OS === 'android' && !isAndroidEmulator() && !devIp) {
    return 'Physical phone: create mobile-app/.env with EXPO_PUBLIC_API_URL=http://YOUR_PC_IP:5000 (ipconfig → IPv4)';
  }
  return `Auto API → ${getApiHost()} (PC and phone must be on same WiFi)`;
};
