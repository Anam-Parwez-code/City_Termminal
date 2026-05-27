import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { io } from 'socket.io-client';
import { fetchTripStatus, fetchBookingDetails, apiErrorMessage } from '../api/driverClient';
import { SOCKET_OPTIONS, socketOrigin } from '../config';
import { loadDriverSession, clearDriverSession } from '../sessionStorage';

const COLORS = {
  bg: '#F8FAF8',
  card: '#FFFFFF',
  line: '#E5E7EB',
  green: '#47d361',
  greenBg: '#163a1c',
  text: '#111111',
  muted: '#6b7280',
};

export default function DriverProfileScreen({ navigation }) {
  const [bookingId, setBookingId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const socket = useMemo(() => io(socketOrigin, SOCKET_OPTIONS), []);

  const refresh = useCallback(async () => {
    const sess = await loadDriverSession();
    const bid = String(sess.bookingId || '').trim();
    const did = String(sess.driverId || sess.vehicleId || '').trim();
    const vid = String(sess.vehicleId || '').trim();
    setBookingId(bid);
    setDriverId(did);
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
      const next = data.status || null;
      let merged = next || null;
      try {
        const bookingRes = await fetchBookingDetails(bid);
        const bookingData = bookingRes?.bookingData || bookingRes?.booking || null;
        if (bookingData) {
          merged = {
            ...(merged || {}),
            passengerName: bookingData.passenger_name || bookingData.passengerName || merged?.passengerName,
            passenger_name: bookingData.passenger_name || bookingData.passengerName || merged?.passenger_name,
            destination: bookingData.destination || merged?.destination,
            destinationTerminal: bookingData.terminal || bookingData.destination_terminal || merged?.destinationTerminal,
            flight: {
              ...(merged?.flight || {}),
              passengerName: bookingData.passenger_name || bookingData.passengerName || merged?.flight?.passengerName,
              flightNumber: bookingData.flight_number || bookingData.flightNumber || merged?.flight?.flightNumber,
              destination: bookingData.destination || merged?.flight?.destination,
              airline: bookingData.airline_code || bookingData.airlineCode || merged?.flight?.airline,
              terminal: bookingData.terminal || merged?.flight?.terminal,
            },
          };
        }
      } catch (_detailsErr) {
        // keep base OTP status payload
      }
      setStatusPayload(merged);
      if (!did && next?.driverId) {
        setDriverId(String(next.driverId).toUpperCase());
      }
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

  useEffect(() => {
    if (!bookingId) return undefined;
    socket.emit('join_booking', { bookingId });
    socket.emit('join_dispatch');

    const handleStatus = (payload = {}) => {
      const payloadBookingId = payload.bookingId || payload.booking_id;
      const payloadVehicleId = payload.vehicleId || payload.vehicle_id || payload.vehicle_number;
      const bookingMatches = payloadBookingId && String(payloadBookingId).toUpperCase() === String(bookingId).toUpperCase();
      const vehicleMatches = vehicleId && payloadVehicleId && String(payloadVehicleId).toUpperCase() === String(vehicleId).toUpperCase();
      if (!bookingMatches && !vehicleMatches) return;

      setStatusPayload((prev) => ({
        ...(prev || {}),
        ...payload,
        bookingId: payloadBookingId || prev?.bookingId || bookingId,
        vehicleId: payloadVehicleId || prev?.vehicleId || vehicleId,
        status: payload.statusLabel || payload.status || prev?.status,
        pickupLocation: payload.pickupAddress || payload.pickupLocation || payload.pickup_location || prev?.pickupLocation,
        destinationTerminal: payload.destination || payload.destinationTerminal || payload.destination_terminal || prev?.destinationTerminal,
        pickupTime: payload.pickupTime || payload.pickup_time || payload.flightTime || payload.departureTime || prev?.pickupTime,
        passengerName: payload.passengerName || payload.passenger_name || payload.flight?.passengerName || prev?.passengerName,
        driverId: payload.driverId || payload.driver_id || prev?.driverId,
      }));
    };

    socket.on('status_update', handleStatus);
    socket.on('vehicle_update', handleStatus);
    return () => {
      socket.emit('leave_booking', { bookingId });
      socket.emit('leave_dispatch');
      socket.off('status_update', handleStatus);
      socket.off('vehicle_update', handleStatus);
    };
  }, [bookingId, socket, vehicleId]);

  useEffect(() => () => socket.disconnect(), [socket]);

  const driverName = statusPayload?.driverName || statusPayload?.driver_name || '—';
  const barcodePayload = useMemo(() => {
    const raw = statusPayload?.barcodeData || statusPayload?.barcode_data;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_e) {
      return null;
    }
  }, [statusPayload?.barcodeData, statusPayload?.barcode_data]);

  const userName =
    statusPayload?.passengerName ||
    statusPayload?.passenger_name ||
    statusPayload?.flight?.passengerName ||
    statusPayload?.flight?.passenger_name ||
    barcodePayload?.passengerName ||
    barcodePayload?.passenger_name ||
    '—';
  const resolvedDriverId =
    driverId ||
    statusPayload?.driverId ||
    statusPayload?.driver_id ||
    barcodePayload?.driverId ||
    barcodePayload?.driver_id ||
    '—';
  const driverPhone = statusPayload?.driverPhone || statusPayload?.driver_phone || '—';
  const tripPhase = statusPayload?.statusLabel || statusPayload?.status || '—';
  const pickupLocation = statusPayload?.pickupLocation || statusPayload?.pickup_location || statusPayload?.pickupAddress || '—';
  const destinationTerminal = statusPayload?.destinationTerminal || statusPayload?.destination_terminal || statusPayload?.destination || '—';
  const pickupTime =
    statusPayload?.pickupTime ||
    statusPayload?.pickup_time ||
    statusPayload?.flightTime ||
    statusPayload?.departureTime ||
    statusPayload?.departure_time ||
    '—';
  const barcodeRaw =
    statusPayload?.barcodeData ||
    statusPayload?.barcode_data ||
    (bookingId && (vehicleId || resolvedDriverId)
      ? JSON.stringify({
          bookingId,
          vehicleId: vehicleId || null,
          driverId: resolvedDriverId !== '—' ? resolvedDriverId : null,
          passengerName: userName !== '—' ? userName : null,
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
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
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
          <Row label="Driver ID" value={resolvedDriverId} />
          <Row label="Vehicle ID" value={vehicleId || '—'} />
          <Row label="User name" value={userName} />
          <Row label="Driver name" value={driverName} />
          <Row label="Driver phone" value={driverPhone} emphasis />
          <View style={styles.badgeRow}>
            <Text style={styles.rowLabel}>Status Badge</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{tripPhase}</Text>
            </View>
          </View>
          <Row label="Pickup location" value={pickupLocation} />
          <Row label="Destination" value={destinationTerminal} />
          <Row label="Pickup time" value={pickupTime} />
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
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  errTitle: { color: '#DC2626', fontWeight: '900', marginBottom: 6 },
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
  badgeRow: { gap: 8 },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  statusBadgeText: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
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
    color: '#111827',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  logoutBtn: {
    marginTop: 36,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  logoutTxt: { color: '#fca5a5', fontWeight: '900', fontSize: 17 },
  logoutSub: { color: COLORS.muted, fontSize: 12, marginTop: 6, textAlign: 'center' },
  footer: { textAlign: 'center', color: '#4b5563', fontSize: 11, marginTop: 24 },
});
