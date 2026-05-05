import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { fetchTripStatus, apiErrorMessage } from '../services/driverClient';
import { loadDriverSession, clearDriverSession } from '../services/driverSession';

const COLORS = {
  bg: '#060708',
  card: '#0f1216',
  line: '#1f2937',
  green: '#47d361',
  greenBg: '#163a1c',
  text: '#f9fafb',
  muted: '#9ca3af',
};

export default function DriverProfileScreen({ navigation }) {
  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const sess = await loadDriverSession();
    const bid = sess.bookingId.trim();
    const vid = sess.vehicleId.trim();
    setBookingId(bid);
    setVehicleId(vid);
    setError('');
    if (!bid) {
      setStatusPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchTripStatus(bid);
      setStatusPayload(data.status || null);
    } catch (e) {
      setStatusPayload(null);
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const driverName = statusPayload?.driverName || statusPayload?.driver_name || '—';
  const driverPhone = statusPayload?.driverPhone || statusPayload?.driver_phone || '—';
  const tripPhase = statusPayload?.statusLabel || statusPayload?.status || '—';
  const barcodeRaw =
    statusPayload?.barcodeData ||
    statusPayload?.barcode_data ||
    (bookingId && vehicleId
      ? JSON.stringify({
          bookingId,
          vehicleId,
          driverName,
          driverPhone,
          role: 'driver_profile_fallback',
          ts: new Date().toISOString(),
        })
      : null);

  const handleLogout = () => {
    Alert.alert('Log out', 'Clear saved Booking ID / Vehicle ID on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await clearDriverSession();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={14}>
          <Text style={styles.headerBtnTxt}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={refresh} hitSlop={14}>
          <Text style={styles.refreshTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Professional driver</Text>
        <Text style={styles.hero}>Operations sync</Text>
        <Text style={styles.sub}>
          Booking & barcode mirror what passengers and the admin dashboard see for this trip.
        </Text>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={COLORS.green} size="large" />
          </View>
        ) : null}

        {error ? (
          <View style={styles.errBox}>
            <Text style={styles.errTitle}>Could not load trip</Text>
            <Text style={styles.errBody}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
              <Text style={styles.retryTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Row label="Booking ID" value={bookingId || 'Not saved — enter on Trip console'} />
          <Row label="Vehicle ID" value={vehicleId || '—'} />
          <Row label="Driver name" value={driverName} />
          <Row label="Driver phone" value={driverPhone} emphasis />
          <Row label="Trip phase" value={tripPhase} />
        </View>

        <Text style={styles.sectionTitle}>Luggage barcode (QR)</Text>
        <Text style={styles.sectionHint}>Same payload synced with admin when passenger verifies Vehicle ID.</Text>

        <View style={styles.qrWrap}>
          {barcodeRaw ? (
            <QRCode value={String(barcodeRaw)} size={196} color="#0a0a0b" backgroundColor="#ffffff" />
          ) : (
            <Text style={styles.qrPlaceholder}>Save Booking ID on Trip screen, then refresh.</Text>
          )}
        </View>

        {barcodeRaw ? (
          <View style={styles.payloadPreview}>
            <Text style={styles.payloadLabel}>Barcode payload</Text>
            <Text style={styles.payloadMono} numberOfLines={6}>
              {String(barcodeRaw)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutTxt}>Log out</Text>
          <Text style={styles.logoutSub}>Clears saved credentials on this device only</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>{Platform.OS} · pull to refresh via ↻</Text>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, emphasis }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  headerBtnTxt: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  refreshTxt: { color: COLORS.green, fontSize: 22, fontWeight: '800' },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900' },
  scroll: { padding: 22, paddingBottom: 48 },
  eyebrow: { color: COLORS.green, fontWeight: '800', fontSize: 11, letterSpacing: 1.2 },
  hero: { color: COLORS.text, fontSize: 28, fontWeight: '900', marginTop: 6 },
  sub: { color: COLORS.muted, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 8 },
  loader: { paddingVertical: 24 },
  errBox: {
    backgroundColor: '#1c1418',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#422026',
    marginBottom: 16,
  },
  errTitle: { color: '#fecaca', fontWeight: '900', marginBottom: 6 },
  errBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  retryBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  retryTxt: { color: COLORS.green, fontWeight: '900' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    gap: 14,
    marginTop: 8,
  },
  row: { gap: 4 },
  rowLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  rowValue: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  rowEmphasis: { color: COLORS.green, fontSize: 17, fontWeight: '900' },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginTop: 28 },
  sectionHint: { color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  qrWrap: {
    marginTop: 16,
    alignSelf: 'center',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  qrPlaceholder: { color: COLORS.muted, padding: 24, textAlign: 'center', maxWidth: 240 },
  payloadPreview: {
    marginTop: 18,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  payloadLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  payloadMono: {
    color: '#d1d5db',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  logoutBtn: {
    marginTop: 36,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
  },
  logoutTxt: { color: '#fca5a5', fontWeight: '900', fontSize: 17 },
  logoutSub: { color: COLORS.muted, fontSize: 12, marginTop: 6, textAlign: 'center' },
  footer: { textAlign: 'center', color: '#4b5563', fontSize: 11, marginTop: 24 },
});
