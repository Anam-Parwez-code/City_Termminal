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
} from 'react-native';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { socketOrigin } from '../config';
import driverClient, { apiErrorMessage, verifyPassengerVehicle } from '../api/driverClient';
import { loadDriverSession, saveDriverSession } from '../sessionStorage';

export default function DriverTripScreen({ navigation }) {
  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [passengerOtp, setPassengerOtp] = useState('');
  const [log, setLog] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [incomingAssignment, setIncomingAssignment] = useState(null);
  const [completedActions, setCompletedActions] = useState({});
  const watchRef = useRef(null);

  const append = useCallback((line) => {
    setLog((prev) => `${new Date().toLocaleTimeString()} — ${line}\n${prev}`.slice(0, 4000));
  }, []);

  const socket = useMemo(() => io(socketOrigin, { transports: ['websocket', 'polling'] }), []);

  useEffect(() => {
    socket.emit('join_dispatch');
    socket.on('vehicle_update', (payload = {}) => {
      const assignedVehicle = payload.vehicleId || payload.vehicle_id || payload.vehicle_number;
      const myVehicle = vehicleId.trim();
      if (myVehicle && assignedVehicle && String(assignedVehicle).toUpperCase() !== myVehicle.toUpperCase()) return;
      const nextBookingId = payload.bookingId || payload.booking_id;
      if (!nextBookingId) return;
      const nextAssignment = {
        bookingId: String(nextBookingId).toUpperCase(),
        passengerName: payload.passengerName || payload.passenger_name || payload.flight?.passengerName || 'Passenger',
        pickup: payload.pickupLocation || payload.pickup_location || payload.current_location || 'Pickup',
        destination: payload.destinationTerminal || payload.destination_terminal || payload.flight?.terminal || 'Terminal',
      };
      setIncomingAssignment(nextAssignment);
      Alert.alert('New booking assigned', `${nextAssignment.bookingId} is ready for pickup.`);
    });
    return () => socket.disconnect();
  }, [socket, vehicleId]);

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

  const requireIds = () => {
    if (!bookingId.trim() || !vehicleId.trim()) {
      Alert.alert('Required', 'Enter Booking ID first. Vehicle ID comes from driver login.');
      return false;
    }
    return true;
  };

  const actionDone = (key) => completedActions[key] === true;

  const markActionDone = (key, message) => {
    setCompletedActions((prev) => ({ ...prev, [key]: true }));
    append(message);
    Alert.alert('Updated', message);
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
      append(`GPS synced (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`);
    } catch (err) {
      append(`GPS API error: ${apiErrorMessage(err)}`);
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

  const markEnRoutePickup = async () => {
    if (!requireIds()) return;
    try {
      await driverClient.post('/otp/mark-en-route', {
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
      });
      markActionDone('enRoutePickup', 'Marked: driving to passenger pickup.');
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicle_number: vehicleId.trim(),
        vehicleId: vehicleId.trim(),
        status: 'En route to pickup',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      append(`mark-en-route: ${apiErrorMessage(err)}`);
      Alert.alert('Could not update status', apiErrorMessage(err));
    }
  };

  const markAtPickup = async () => {
    if (!requireIds()) return;
    try {
      await driverClient.post('/otp/mark-at-pickup', {
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
      });
      markActionDone('atPickup', 'Marked: arrived at pickup. Passenger can verify Vehicle ID.');
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicle_number: vehicleId.trim(),
        vehicleId: vehicleId.trim(),
        status: 'Arrived at Pickup',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      append(`mark-at-pickup: ${apiErrorMessage(err)}`);
      Alert.alert('Could not update status', apiErrorMessage(err));
    }
  };

  const verifyPassengerOTP = async () => {
    if (!requireIds()) return;
    if (!passengerOtp.trim()) {
      Alert.alert('Required', 'Enter the OTP (Vehicle ID) provided by the passenger.');
      return;
    }
    if (passengerOtp.trim().toUpperCase() !== vehicleId.trim().toUpperCase()) {
      Alert.alert('Invalid OTP', 'The OTP does not match your assigned Vehicle ID.');
      return;
    }
    
    try {
      const result = await verifyPassengerVehicle({
        bookingId: bookingId.trim(),
        vehicleId: vehicleId.trim(),
      });
      append('Passenger verified! Barcode generated.');
      setCompletedActions((prev) => ({ ...prev, verifyPassenger: true }));
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicle_number: vehicleId.trim(),
        vehicleId: vehicleId.trim(),
        status: 'Barcode issued',
        barcode_data: result?.status?.barcodeData || result?.status?.barcode_data,
        updated_at: new Date().toISOString(),
      });
      Alert.alert('Success', 'Passenger verified. They can now see their barcode.');
    } catch (err) {
      append(`Verify OTP: ${apiErrorMessage(err)}`);
      Alert.alert('Verification failed', apiErrorMessage(err));
    }
  };

  const startSharing = async () => {
    if (!requireIds()) return;

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
    if (!requireIds()) return;
    try {
      const { data: result } = await driverClient.post('/otp/airport-trip', { bookingId: bookingId.trim() });
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicle_number: vehicleId.trim(),
        vehicleId: vehicleId.trim(),
        status: 'En route to Airport',
        vehicleVerified: true,
        barcode_data: result?.status?.barcodeData || result?.status?.barcode_data,
        barcodeData: result?.status?.barcodeData || result?.status?.barcode_data,
        updated_at: new Date().toISOString(),
      });
      markActionDone('airportTrip', 'Marked: heading to airport. Passenger tracking updated.');
    } catch (err) {
      append(`Airport trip: ${apiErrorMessage(err)}`);
      Alert.alert('Airport trip failed', apiErrorMessage(err));
    }
  };

  const markAirportDone = async () => {
    if (!requireIds()) return;
    try {
      await driverClient.put(`/otp/reached/${encodeURIComponent(bookingId.trim())}`);
      socket.emit('status_update', {
        bookingId: bookingId.trim(),
        booking_id: bookingId.trim(),
        vehicleId: vehicleId.trim(),
        vehicle_number: vehicleId.trim(),
        status: 'Arrived — At Airport',
        updated_at: new Date().toISOString(),
      });
      markActionDone('airportDone', 'Terminal arrival broadcast sent. Passenger boarding pass updated.');
    } catch (err) {
      append(`Arrival: ${apiErrorMessage(err)}`);
      Alert.alert('Arrival failed', apiErrorMessage(err));
    }
  };

  const openProfile = () => {
    setMenuOpen(false);
    navigation.navigate('Profile');
  };

  return (
    <View style={styles.outer}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.hamCircle}
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Open menu"
          hitSlop={12}
        >
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
            <Text style={styles.menuBrand}>Menu</Text>
            <TouchableOpacity style={styles.menuRow} onPress={openProfile}>
              <Text style={styles.menuRowIcon}>◉</Text>
              <View>
                <Text style={styles.menuRowTitle}>My Profile</Text>
                <Text style={styles.menuRowSub}>Driver details, QR barcode, trip phase</Text>
              </View>
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
            <Text style={styles.assignmentEyebrow}>New Booking Assigned</Text>
            <Text style={styles.assignmentTitle}>{incomingAssignment?.passengerName || 'Passenger'}</Text>
            <Text style={styles.assignmentLocation}>Pickup: {incomingAssignment?.pickup || 'DXB'}</Text>
            <Text style={styles.assignmentLocation}>Destination: {incomingAssignment?.destination || 'Terminal'}</Text>
            
            <View style={styles.assignmentActions}>
              <TouchableOpacity style={styles.declineBtn} onPress={() => setIncomingAssignment(null)}>
                <Text style={styles.declineTxt}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => {
                setBookingId(incomingAssignment.bookingId);
                setIncomingAssignment(null);
                append('Accepted new assignment.');
              }}>
                <Text style={styles.acceptTxt}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.demoBtn} onPress={() => setIncomingAssignment({
          bookingId: 'EK123456', passengerName: 'Mohammed Al Fayed', pickup: 'Downtown Dubai', destination: 'DXB T3'
        })}>
          <Text style={styles.demoBtnTxt}>Simulate Incoming Assignment</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Enter the passenger Booking ID. Your roster Vehicle ID is loaded from login and used automatically.
        </Text>

        <Text style={styles.label}>Booking ID</Text>
        <TextInput
          placeholder="Passenger booking ID, e.g. DXB8888"
          placeholderTextColor="#6B7280"
          value={bookingId}
          onChangeText={(value) => {
            setBookingId(value);
            setCompletedActions({});
          }}
          autoCapitalize="characters"
          style={styles.input}
        />

       {/* <Text style={styles.label}>Vehicle ID</Text>
        <View style={styles.vehiclePillBox}>
          <Text style={styles.vehiclePillValue}>{vehicleId || 'Login vehicle missing'}</Text>
        </View>*/}

        <TouchableOpacity
          style={[styles.btn, actionDone('enRoutePickup') && styles.btnDone]}
          onPress={markEnRoutePickup}
          disabled={actionDone('enRoutePickup')}
        >
          <Text style={styles.btnTxt}>{actionDone('enRoutePickup') ? 'Done: En route to pickup' : '1 - En route to passenger pickup'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, actionDone('atPickup') && styles.btnDone]}
          onPress={markAtPickup}
          disabled={actionDone('atPickup')}
        >
          <Text style={styles.btnTxt}>{actionDone('atPickup') ? 'Done: Arrived at pickup' : '2 - Arrived at pickup'}</Text>
        </TouchableOpacity>

        <View style={styles.otpCard}>
          <Text style={styles.label}>Passenger OTP (Their Vehicle ID)</Text>
          <TextInput
            placeholder={`Passenger OTP / Vehicle ID (${vehicleId || 'CT-102'})`}
            placeholderTextColor="#6B7280"
            value={passengerOtp}
            onChangeText={setPassengerOtp}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TouchableOpacity
            style={[styles.btn, styles.btnOtp, actionDone('verifyPassenger') && styles.btnDone]}
            onPress={verifyPassengerOTP}
            disabled={actionDone('verifyPassenger')}
          >
            <Text style={[styles.btnTxt, { color: '#000' }]}>
              {actionDone('verifyPassenger') ? 'Done: Passenger verified' : '3 - Verify Passenger (OTP step)'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btn} onPress={startSharing}>
          <Text style={styles.btnTxt}>Start live GPS (pickup ↔ airport)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnMuted} onPress={stopWatch}>
          <Text style={styles.btnTxtMuted}>Pause GPS watcher</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, actionDone('airportTrip') && styles.btnDone]}
          onPress={startAirportTrip}
          disabled={actionDone('airportTrip')}
        >
          <Text style={styles.btnTxt}>{actionDone('airportTrip') ? 'Done: Heading to airport' : 'Announce heading to airport'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnAirport, actionDone('airportDone') && styles.btnDone]}
          onPress={markAirportDone}
          disabled={actionDone('airportDone')}
        >
          <Text style={styles.btnTxt}>{actionDone('airportDone') ? 'Done: Terminal reached' : 'Mark landed at terminal'}</Text>
        </TouchableOpacity>

        <Text style={styles.log}>{log || 'Telemetry log shows here …'}</Text>
        <Text style={styles.footer}>{Platform.OS} · API {driverClient.defaults.baseURL}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  hamCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamCirclePlaceholder: { width: 46, height: 46 },
  hamLines: { color: '#111827', fontSize: 22, fontWeight: '700' },
  topTitles: { alignItems: 'center', flex: 1 },
  brandEyebrow: { color: '#47d361', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  brandTitle: { color: '#111827', fontSize: 17, fontWeight: '900', marginTop: 2 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
  },
  menuSheet: {
    width: '78%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuBrand: { color: '#9ca3af', fontWeight: '900', fontSize: 12, letterSpacing: 2, marginBottom: 24 },
  menuRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  menuRowIcon: { color: '#47d361', fontSize: 18 },
  menuRowTitle: { color: '#111827', fontSize: 17, fontWeight: '900' },
  menuRowSub: { color: '#6b7280', fontSize: 12, marginTop: 4, maxWidth: 220 },
  menuClose: {
    marginTop: 28,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
  },
  menuCloseTxt: { color: '#d1d5db', fontWeight: '800' },
  root: { flex: 1 },
  content: { padding: 22, paddingTop: 16, gap: 6, paddingBottom: 40 },
  note: { color: '#6B7280', fontSize: 13, marginBottom: 18, lineHeight: 19 },
  label: { color: '#111827', fontWeight: '800', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  btn: { backgroundColor: '#47d361', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 18 },
  btnDone: { opacity: 0.58 },
  btnOtp: { backgroundColor: '#eab308' },
  btnTxt: { fontWeight: '900', fontSize: 15, color: '#08110a' },
  btnMuted: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 14,
    alignItems: 'center',
  },
  btnTxtMuted: { color: '#9ca3af', fontWeight: '800' },
  btnAirport: { backgroundColor: '#163a1c', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 14 },
  log: {
    marginTop: 26,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  footer: { marginTop: 16, fontSize: 11, color: '#6b7280' },
  vehiclePillBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 16,
  },
  vehiclePillValue: { color: '#111827', fontSize: 20, fontWeight: '900', letterSpacing: 1.5 },
  assignmentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  assignmentCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB' },
  assignmentEyebrow: { color: '#47d361', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 },
  assignmentTitle: { color: '#111827', fontSize: 24, fontWeight: '900', marginBottom: 16 },
  assignmentLocation: { color: '#374151', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  assignmentActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  declineBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: '#ef4444', alignItems: 'center' },
  declineTxt: { color: '#ef4444', fontWeight: '900', fontSize: 16 },
  acceptBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#47d361', alignItems: 'center' },
  acceptTxt: { color: '#08100a', fontWeight: '900', fontSize: 16 },
  demoBtn: { backgroundColor: '#1f2937', padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  demoBtnTxt: { color: '#9ca3af', fontWeight: '800' },
  otpCard: { backgroundColor: '#FEFCE8', padding: 16, borderRadius: 16, marginTop: 18, borderWidth: 1, borderColor: '#eab308' },
}); 