import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { socketOrigin } from '../services/driverClient';
import driverClient, { apiErrorMessage } from '../services/driverClient';
import { loadDriverSession, saveDriverSession } from '../services/driverSession';

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const statusToDone = (status) => {
  const n = normalizeStatus(status);
  return {
    enRoute: ['en_route', 'en_route_to_pickup', 'arrived_at_pickup', 'at_pickup', 'barcode_issued', 'en_route_airport', 'at_airport'].includes(n),
    atPickup: ['arrived_at_pickup', 'at_pickup', 'barcode_issued', 'en_route_airport', 'at_airport'].includes(n),
    verify: ['barcode_issued', 'en_route_airport', 'at_airport'].includes(n),
    airport: ['en_route_airport', 'en_route_to_airport', 'at_airport'].includes(n),
    landed: ['at_airport', 'arrived_at_airport', 'at_terminal'].includes(n),
  };
};

function ActionBtn({ title, doneLabel, done, loading, disabled, onPress, variant }) {
  return (
    <TouchableOpacity
      style={[
        variant === 'airport' ? styles.btnAirport : styles.btn,
        done && styles.btnDone,
        disabled && !done && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator color="#08110a" />
      ) : (
        <Text style={[styles.btnTxt, done && styles.btnTxtDone]}>
          {done ? `Done — ${doneLabel}` : title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function DriverTripScreen({ navigation }) {
  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [passengerOtp, setPassengerOtp] = useState('');
  const [log, setLog] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [incomingAssignment, setIncomingAssignment] = useState(null);
  const [completed, setCompleted] = useState({});
  const [loadingKey, setLoadingKey] = useState('');
  const watchRef = useRef(null);

  const append = useCallback((line) => {
    setLog((prev) => `${new Date().toLocaleTimeString()} — ${line}\n${prev}`.slice(0, 4000));
  }, []);

  const socket = useMemo(() => io(socketOrigin, { transports: ['websocket', 'polling'] }), []);

  const applyStatus = useCallback((status) => {
    setCompleted((prev) => ({ ...prev, ...statusToDone(status) }));
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!bookingId.trim()) return;
    try {
      const { data } = await driverClient.get(`/otp/status/${encodeURIComponent(bookingId.trim())}`);
      const st = data?.status || data?.assignment || {};
      if (st.status) applyStatus(st.status);
      if (st.vehicleId || st.vehicle_id) setVehicleId(String(st.vehicleId || st.vehicle_id).toUpperCase());
    } catch (_e) {
      /* ignore */
    }
  }, [applyStatus, bookingId]);

  useEffect(() => {
    socket.emit('join_dispatch');
    if (bookingId.trim()) socket.emit('join_booking', { bookingId: bookingId.trim() });
    socket.on('status_update', (payload) => {
      const pb = String(payload.bookingId || payload.booking_id || '').toUpperCase();
      if (pb && pb === String(bookingId).toUpperCase() && payload.status) {
        applyStatus(payload.status);
      }
    });
    return () => {
      socket.emit('leave_dispatch');
      socket.disconnect();
    };
  }, [applyStatus, bookingId, socket]);

  useEffect(() => {
    loadDriverSession().then(({ bookingId: b, vehicleId: v }) => {
      if (b) setBookingId(b);
      if (v) setVehicleId(v);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      saveDriverSession(bookingId, vehicleId).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [bookingId, vehicleId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const requireIds = () => {
    if (!bookingId.trim() || !vehicleId.trim()) {
      Alert.alert('Required', 'Enter Booking ID and Vehicle ID (e.g. CT-114) first.');
      return false;
    }
    return true;
  };

  const emitStatus = (status, extra = {}) => {
    socket.emit('status_update', {
      bookingId: bookingId.trim(),
      booking_id: bookingId.trim(),
      vehicleId: vehicleId.trim(),
      vehicle_number: vehicleId.trim(),
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    });
    applyStatus(status);
  };

  const run = async (key, fn, doneLabel, statusLabel) => {
    if (!requireIds() || loadingKey) return;
    setLoadingKey(key);
    try {
      await fn();
      setCompleted((prev) => ({ ...prev, [key]: true }));
      if (statusLabel) emitStatus(statusLabel);
      append(`Done: ${doneLabel}`);
    } catch (err) {
      append(`${doneLabel}: ${apiErrorMessage(err)}`);
      Alert.alert('Could not update', apiErrorMessage(err));
    } finally {
      setLoadingKey('');
    }
  };

  const markEnRoutePickup = () =>
    run(
      'enRoute',
      () =>
        driverClient.post('/otp/mark-en-route', {
          bookingId: bookingId.trim(),
          vehicleId: vehicleId.trim(),
        }),
      'En route to pickup',
      'En route to pickup',
    );

  const markAtPickup = () =>
    run(
      'atPickup',
      () =>
        driverClient.post('/otp/mark-at-pickup', {
          bookingId: bookingId.trim(),
          vehicleId: vehicleId.trim(),
        }),
      'Arrived at pickup',
      'Arrived at Pickup',
    );

  const verifyPassenger = async () => {
    if (!requireIds() || loadingKey) return;
    if (!passengerOtp.trim()) {
      Alert.alert('Required', 'Enter passenger Vehicle ID (CT-xxx).');
      return;
    }
    if (passengerOtp.trim().toUpperCase() !== vehicleId.trim().toUpperCase()) {
      Alert.alert('Invalid OTP', 'Passenger OTP does not match your Vehicle ID.');
      return;
    }
    setLoadingKey('verify');
    try {
      const { data } = await driverClient.post('/otp/verify-vehicle', {
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
      });
      setCompleted((prev) => ({ ...prev, verify: true }));
      const barcode = data?.status?.barcodeData || data?.status?.barcode_data;
      emitStatus('Barcode issued', { barcodeData: barcode, barcode_data: barcode });
      append('Done: Passenger verified');
    } catch (err) {
      append(`Verify: ${apiErrorMessage(err)}`);
      Alert.alert('Verification failed', apiErrorMessage(err));
    } finally {
      setLoadingKey('');
    }
  };

  const ensureLocationAllowed = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location denied', 'Enable GPS to stream van position.');
      return false;
    }
    return true;
  };

  const pushGpsPing = async (coords) => {
    try {
      await driverClient.put('/otp/driver-location', {
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
        lat: coords.latitude,
        lng: coords.longitude,
      });
    } catch (err) {
      append(`GPS: ${apiErrorMessage(err)}`);
    }
    socket.emit('location_update', {
      bookingId: bookingId.trim(),
      vehicleId: vehicleId.trim(),
      vehicle_number: vehicleId.trim(),
      lat: coords.latitude,
      lng: coords.longitude,
      updated_at: new Date().toISOString(),
      status: 'Live',
    });
  };

  const stopWatch = async () => {
    if (watchRef.current?.remove) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  };

  const startSharing = async () => {
    if (!requireIds()) return;
    if (!(await ensureLocationAllowed())) return;
    await stopWatch();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
      (loc) => pushGpsPing(loc.coords),
    );
    const first = await Location.getCurrentPositionAsync({});
    pushGpsPing(first.coords);
    append('GPS sharing started');
  };

  const startAirportTrip = () =>
    run(
      'airport',
      () => driverClient.post('/otp/airport-trip', { bookingId: bookingId.trim() }),
      'Heading to airport',
      'En route to Airport',
    );

  const markAirportDone = () =>
    run(
      'landed',
      () => driverClient.put(`/otp/reached/${encodeURIComponent(bookingId.trim())}`),
      'At terminal',
      'Arrived — At Airport',
    );

  const done = (key) => completed[key] === true;
  const busy = Boolean(loadingKey);

  return (
    <View style={styles.outer}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.hamCircle} onPress={() => setMenuOpen(true)}>
          <Text style={styles.hamLines}>☰</Text>
        </TouchableOpacity>
        <View style={styles.topTitles}>
          <Text style={styles.brandEyebrow}>City Terminal</Text>
          <Text style={styles.brandTitle}>Driver console</Text>
        </View>
        <View style={styles.hamCirclePlaceholder} />
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setMenuOpen(false); navigation.navigate('Profile'); }}>
              <Text style={styles.menuRowTitle}>My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuClose} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCloseTxt}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!incomingAssignment} transparent animationType="slide">
        <View style={styles.assignmentBackdrop}>
          <View style={styles.assignmentCard}>
            <Text style={styles.assignmentTitle}>{incomingAssignment?.bookingId}</Text>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => {
                setBookingId(incomingAssignment.bookingId);
                setIncomingAssignment(null);
              }}
            >
              <Text style={styles.acceptTxt}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Booking ID</Text>
        <TextInput
          placeholder="DXB8888"
          value={bookingId}
          onChangeText={(v) => {
            setBookingId(v);
            setCompleted({});
          }}
          autoCapitalize="characters"
          style={styles.input}
          onBlur={refreshStatus}
        />

        <Text style={styles.label}>Vehicle ID</Text>
        <TextInput
          placeholder="CT-114"
          value={vehicleId}
          onChangeText={setVehicleId}
          autoCapitalize="characters"
          style={styles.input}
        />

        <ActionBtn
          title="1 · En route to pickup"
          doneLabel="En route to pickup"
          done={done('enRoute')}
          loading={loadingKey === 'enRoute'}
          disabled={busy || done('enRoute')}
          onPress={markEnRoutePickup}
        />

        <ActionBtn
          title="2 · Arrived at pickup"
          doneLabel="At pickup"
          done={done('atPickup')}
          loading={loadingKey === 'atPickup'}
          disabled={busy || done('atPickup')}
          onPress={markAtPickup}
        />

        <View style={styles.otpCard}>
          <Text style={styles.label}>Passenger OTP (Vehicle ID)</Text>
          <TextInput
            placeholder="CT-114"
            value={passengerOtp}
            onChangeText={setPassengerOtp}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TouchableOpacity
            style={[styles.btnOtp, done('verify') && styles.btnDone]}
            onPress={verifyPassenger}
            disabled={busy || done('verify')}
          >
            {loadingKey === 'verify' ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={[styles.btnTxt, { color: '#000' }]}>
                {done('verify') ? 'Done — Verified' : '3 · Verify passenger'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btnMuted} onPress={startSharing}>
          <Text style={styles.btnTxtMuted}>Start live GPS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnMuted} onPress={stopWatch}>
          <Text style={styles.btnTxtMuted}>Pause GPS</Text>
        </TouchableOpacity>

        <ActionBtn
          title="4 · Heading to airport"
          doneLabel="En route to airport"
          done={done('airport')}
          loading={loadingKey === 'airport'}
          disabled={busy || done('airport')}
          onPress={startAirportTrip}
        />

        <ActionBtn
          title="5 · Marked at airport"
          doneLabel="At terminal"
          done={done('landed')}
          loading={loadingKey === 'landed'}
          disabled={busy || done('landed')}
          onPress={markAirportDone}
          variant="airport"
        />

        <Text style={styles.log}>{log || 'Status log…'}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#060708' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  hamCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#0f1216',
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamCirclePlaceholder: { width: 46, height: 46 },
  hamLines: { color: '#f9fafb', fontSize: 22, fontWeight: '700' },
  topTitles: { alignItems: 'center', flex: 1 },
  brandEyebrow: { color: '#47d361', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  brandTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 2 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  menuSheet: { width: '78%', backgroundColor: '#0a0c10', padding: 24, paddingTop: 56 },
  menuRow: { paddingVertical: 16 },
  menuRowTitle: { color: '#fff', fontWeight: '900', fontSize: 17 },
  menuClose: { marginTop: 20, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#374151', borderRadius: 14 },
  menuCloseTxt: { color: '#d1d5db', fontWeight: '800' },
  root: { flex: 1 },
  content: { padding: 22, paddingBottom: 40 },
  label: { color: '#d1d5db', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btn: { backgroundColor: '#47d361', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 14, minHeight: 50, justifyContent: 'center' },
  btnDone: { backgroundColor: '#4B5563', borderWidth: 1, borderColor: '#9CA3AF' },
  btnDisabled: { opacity: 0.65 },
  btnTxt: { fontWeight: '900', fontSize: 15, color: '#08110a', textAlign: 'center' },
  btnTxtDone: { color: '#F3F4F6' },
  btnMuted: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#374151', padding: 14, alignItems: 'center' },
  btnTxtMuted: { color: '#9ca3af', fontWeight: '800' },
  btnAirport: { backgroundColor: '#163a1c', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 14, minHeight: 50, justifyContent: 'center' },
  btnOtp: { backgroundColor: '#eab308', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 12 },
  otpCard: { backgroundColor: '#1c1910', borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#854d0e' },
  log: { marginTop: 20, color: '#6b7280', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  assignmentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  assignmentCard: { backgroundColor: '#111827', padding: 24, borderRadius: 24 },
  assignmentTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 16 },
  acceptBtn: { backgroundColor: '#47d361', padding: 16, borderRadius: 14, alignItems: 'center' },
  acceptTxt: { color: '#08100a', fontWeight: '900' },
});
