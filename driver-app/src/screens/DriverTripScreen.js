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
} from 'react-native';
import * as Location from 'expo-location';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_URL, socketOrigin } from '../config';

const ax = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

export default function DriverTripScreen() {
  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [log, setLog] = useState('');
  const watchRef = useRef(null);

  const append = useCallback((line) => {
    setLog((prev) => `${new Date().toLocaleTimeString()} — ${line}\n${prev}`.slice(0, 4000));
  }, []);

  const socket = useMemo(() => io(socketOrigin, { transports: ['websocket', 'polling'] }), []);

  useEffect(() => {
    socket.emit('join_dispatch');
    return () => socket.disconnect();
  }, [socket]);

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
      await ax.put('/otp/driver-location', {
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
        lat: coords.latitude,
        lng: coords.longitude,
      });
      append(`GPS synced (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`);
    } catch (err) {
      append(`GPS API error: ${err.message}`);
    }

    socket.emit('location_update', {
      bookingId: bookingId.trim(),
      booking_id: bookingId.trim(),
      vehicleId: vehicleId.trim(),
      vehicle_number: vehicleId.trim(),
      lat: coords.latitude,
      lng: coords.longitude,
      updated_at: new Date().toISOString(),
      status: 'Live',
      current_location: 'Driver GPS ping',
      map_x: 0,
      map_y: 0,
    });
  };

  const stopWatch = async () => {
    if (watchRef.current?.remove) {
      watchRef.current.remove();
      watchRef.current = null;
    }
  };

  const startSharing = async () => {
    if (!bookingId.trim() || !vehicleId.trim()) {
      Alert.alert('Missing data', 'Enter booking ID assigned to your van and matching vehicle plate code.');
      return;
    }

    const ok = await ensureLocationAllowed();
    if (!ok) return;

    await stopWatch();
    append('Watching GPS every 15s …');

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
      (loc) => {
        pushGpsPing(loc.coords);
      },
    );

    const first = await Location.getCurrentPositionAsync({});
    pushGpsPing(first.coords);
  };

  const startAirportTrip = async () => {
    try {
      await ax.post('/otp/airport-trip', { bookingId: bookingId.trim() });
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicleId: vehicleId.trim(),
        vehicle_number: vehicleId.trim(),
        status: 'En route to Airport',
        updated_at: new Date().toISOString(),
      });
      append('Marked heading to airport ✓');
      Alert.alert('Airport trip', 'Passenger tracking updates to Airport leg.');
    } catch (err) {
      append(`Airport trip error: ${err.message}`);
      Alert.alert('Airport trip failed', err.message || 'Retry');
    }
  };

  const markAirportDone = async () => {
    try {
      await ax.put(`/otp/reached/${bookingId.trim()}`);
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicleId: vehicleId.trim(),
        vehicle_number: vehicleId.trim(),
        status: 'Arrived — At Airport',
        updated_at: new Date().toISOString(),
      });
      append('Terminal arrival broadcast ✓');
      Alert.alert('Arrived', 'Admin + passenger see landed status.');
    } catch (err) {
      append(`Arrival error: ${err.message}`);
      Alert.alert('Arrival failed', err.message || 'Retry');
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Driver console</Text>
      <Text style={styles.note}>
        Use the same Booking ID assigned in the rider app once they confirm pickup. Vehicle ID must match backend.
      </Text>

      <Text style={styles.label}>Booking ID</Text>
      <TextInput
        placeholder="EK123456789"
        value={bookingId}
        onChangeText={setBookingId}
        autoCapitalize="characters"
        style={styles.input}
      />

      <Text style={styles.label}>Vehicle ID</Text>
      <TextInput
        placeholder="CT-102"
        value={vehicleId}
        onChangeText={setVehicleId}
        autoCapitalize="characters"
        style={styles.input}
      />

      <TouchableOpacity style={styles.btn} onPress={startSharing}>
        <Text style={styles.btnTxt}>Start live GPS (pickup ↔ airport)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnMuted} onPress={stopWatch}>
        <Text style={styles.btnTxtMuted}>Pause GPS watcher</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={startAirportTrip}>
        <Text style={styles.btnTxt}>Announce “heading to airport”</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnAirport} onPress={markAirportDone}>
        <Text style={styles.btnTxt}>Mark landed at terminal</Text>
      </TouchableOpacity>

      <Text style={styles.log}>{log || 'Telemetry log shows here …'}</Text>
      <Text style={styles.footer}>{Platform.OS} • API {API_BASE_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060708' },
  content: { padding: 22, paddingTop: 62, gap: 6 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 28, marginBottom: 8 },
  note: { color: '#9ca3af', fontSize: 13, marginBottom: 18, lineHeight: 18 },
  label: { color: '#d1d5db', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btn: { backgroundColor: '#47d361', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 18 },
  btnTxt: { fontWeight: '900', fontSize: 16, color: '#08110a' },
  btnMuted: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    alignItems: 'center',
  },
  btnTxtMuted: { color: '#9ca3af', fontWeight: '800' },
  btnAirport: { backgroundColor: '#163a1c', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 14 },
  log: {
    marginTop: 26,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  footer: { marginTop: 16, fontSize: 11, color: '#6b7280' },
});
