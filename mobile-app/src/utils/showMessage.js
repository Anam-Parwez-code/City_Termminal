import { Alert, Platform } from 'react-native';

/** Works on native and react-native-web (Alert.alert is unreliable on web). */
export const showMessage = (title, message = '') => {
  const body = [title, message].filter(Boolean).join('\n\n');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(body);
    return;
  }
  Alert.alert(title, message || undefined);
};

export const isNetworkError = (err) => {
  if (err?.response) return false;
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'ERR_NETWORK' ||
    msg.includes('network error') ||
    msg.includes('network request failed') ||
    msg.includes('timeout')
  );
};
