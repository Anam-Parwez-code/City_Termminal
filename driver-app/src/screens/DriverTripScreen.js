import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { SOCKET_OPTIONS, socketOrigin } from '../config';
import driverClient, {
  acceptBooking,
  apiErrorMessage,
  fetchBookingDetails,
  fetchPendingBookings,
  fetchTripStatus,
  resolveVehicleForDriver,
  verifyPassengerVehicle,
} from '../api/driverClient';
import { loadDriverSession, saveDriverSession } from '../sessionStorage';
import { formatTaskStatus, statusToDone, statusBadgeColor } from '../utils/tripStatus';

const ACTIONS = [
  {
    key: 'enRoutePickup',
    title: 'En route to pickup',
    done: 'Done: En route to pickup',
    status: 'En route to pickup',
    request: (bookingId, vehicleId) => driverClient.post('/otp/mark-en-route', { bookingId, vehicleId }),
  },
  {
    key: 'atPickup',
    title: 'Arrived at pickup',
    done: 'Done: Arrived at pickup',
    status: 'Arrived at Pickup',
    request: (bookingId, vehicleId) => driverClient.post('/otp/mark-at-pickup', { bookingId, vehicleId }),
  },
  {
    key: 'airportTrip',
    title: 'Heading to airport',
    done: 'Done: Heading to airport',
    status: 'En route to Airport',
    request: (bookingId) => driverClient.post('/otp/airport-trip', { bookingId }),
  },
  {
    key: 'airportDone',
    title: 'Reached terminal',
    done: 'Done: Terminal reached',
    status: 'Arrived - At Airport',
    request: (bookingId) => driverClient.put(`/otp/reached/${encodeURIComponent(bookingId)}`),
  },
];

const pick = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

const formatPickupTime = (value) => {
  if (!value) return 'Time pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

const sanitizeDriverId = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.startsWith('CT-')) return '';
  return raw;
};

const buildTripFromPayload = (payload = {}) => {
  const bookingId = pick(payload.bookingId, payload.booking_id);
  if (!bookingId) return null;
  return {
    bookingId: String(bookingId).toUpperCase(),
    passengerName: pick(payload.passengerName, payload.passenger_name, payload.flight?.passengerName, 'Passenger'),
    pickup: pick(payload.pickupAddress, payload.pickup, payload.pickupLocation, payload.pickup_location, payload.current_location, 'Pickup pending'),
    destination: pick(payload.destination, payload.destinationTerminal, payload.destination_terminal, payload.flight?.terminal, 'Airport terminal'),
    pickupTime: pick(payload.pickupTime, payload.pickup_time, payload.flightTime, payload.flight_time, payload.departureTime, payload.departure_time, 'Time pending'),
    status: pick(payload.statusLabel, payload.status, 'Assigned'),
    vehicleId: pick(payload.vehicleId, payload.vehicle_id, payload.vehicle_number),
    driverName: pick(payload.driverName, payload.driver_name),
    driverPhone: pick(payload.driverPhone, payload.driver_phone),
  };
};

export default function DriverTripScreen({ navigation, route }) {
  const routeBookingId = route?.params?.bookingId;
  const routeVehicleId = route?.params?.vehicleId;
  const [bookingId, setBookingId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [assignedVehicleId, setAssignedVehicleId] = useState('');
  const [passengerOtp, setPassengerOtp] = useState('');
  const [log, setLog] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [incomingAssignment, setIncomingAssignment] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [completedActions, setCompletedActions] = useState({});
  const [loadingAction, setLoadingAction] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [incomingAcceptedId, setIncomingAcceptedId] = useState(null);
  const watchRef = useRef(null);

  const socket = useMemo(() => io(socketOrigin, SOCKET_OPTIONS), []);

  const append = useCallback((line) => {
    setLog((prev) => `${new Date().toLocaleTimeString()} - ${line}\n${prev}`.slice(0, 4000));
  }, []);

  const applyTrip = useCallback((nextTrip) => {
    if (!nextTrip?.bookingId) return;
    setActiveTrip((prev) => ({ ...(prev || {}), ...nextTrip }));
    if (nextTrip.vehicleId) setAssignedVehicleId(String(nextTrip.vehicleId).toUpperCase());
    setCompletedActions((prev) => ({ ...prev, ...statusToDone(nextTrip.status) }));
  }, []);

  const loadCurrentTrip = useCallback(async (id) => {
    const nextId = String(id || '').trim();
    if (!nextId) return;
    try {
      const [statusRes, bookingRes] = await Promise.allSettled([
        fetchTripStatus(nextId),
        fetchBookingDetails(nextId),
      ]);

      const statusData =
        statusRes.status === 'fulfilled'
          ? (statusRes.value?.status || statusRes.value?.assignment || {})
          : {};
      const bookingData =
        bookingRes.status === 'fulfilled'
          ? (bookingRes.value?.bookingData || bookingRes.value?.booking || {})
          : {};

      applyTrip(buildTripFromPayload({
        ...statusData,
        bookingId: nextId,
        vehicleId: pick(
          statusData?.vehicleId,
          statusData?.vehicle_id,
          bookingData?.vehicle_id,
          bookingData?.vehicleId,
        ),
        passengerName: pick(
          statusData?.passengerName,
          statusData?.passenger_name,
          bookingData?.passenger_name,
          bookingData?.passengerName,
        ),
        pickupAddress: pick(
          statusData?.pickupAddress,
          statusData?.pickupLocation,
          statusData?.pickup_location,
          bookingData?.pickup_location,
          bookingData?.pickupAddress,
        ),
        destination: pick(
          statusData?.destination,
          statusData?.destinationTerminal,
          statusData?.destination_terminal,
          bookingData?.destination,
          bookingData?.terminal,
        ),
        pickupTime: pick(
          statusData?.pickupTime,
          statusData?.pickup_time,
          bookingData?.pickup_time,
          bookingData?.departure_time,
          bookingData?.departureTime,
        ),
      }));
    } catch (err) {
      append(`Trip refresh: ${apiErrorMessage(err)}`);
    }
  }, [append, applyTrip]);

  useEffect(() => {
    const nextId = String(bookingId || '').trim();
    if (nextId.length < 4) return undefined;
    const timer = setTimeout(() => {
      loadCurrentTrip(nextId);
    }, 350);
    return () => clearTimeout(timer);
  }, [bookingId, loadCurrentTrip]);

  useEffect(() => {
    loadDriverSession().then(async ({ bookingId: b, driverId: d, vehicleId: v }) => {
      const initialBooking = routeBookingId || b;
      if (initialBooking) {
        setBookingId(String(initialBooking).toUpperCase());
        loadCurrentTrip(initialBooking);
      }
      const normalizedDriverId = sanitizeDriverId(d);
      if (normalizedDriverId) setDriverId(normalizedDriverId);
      let initialVehicle = routeVehicleId || v;
      if (!initialVehicle && normalizedDriverId) {
        initialVehicle = await resolveVehicleForDriver(normalizedDriverId);
      }
      if (initialVehicle) setAssignedVehicleId(String(initialVehicle).toUpperCase());
    });
  }, [loadCurrentTrip, routeBookingId, routeVehicleId]);

  useEffect(() => {
    const t = setTimeout(() => {
      saveDriverSession(bookingId, driverId, assignedVehicleId).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [assignedVehicleId, bookingId, driverId]);

  useEffect(() => {
    let mounted = true;
    const loadPending = async () => {
      let vehicle = assignedVehicleId.trim();
      if (!vehicle && driverId.trim()) {
        vehicle = (await resolveVehicleForDriver(driverId)) || '';
        if (vehicle && mounted) setAssignedVehicleId(String(vehicle).toUpperCase());
      }
      if (!vehicle) return;
      try {
        const bookings = await fetchPendingBookings(vehicle);
        if (!mounted || !bookings.length) return;
        const pending = buildTripFromPayload(bookings[0]);
        if (pending && pending.bookingId !== incomingAcceptedId) {
          setIncomingAssignment(pending);
        }
      } catch (err) {
        append(`Pending bookings: ${apiErrorMessage(err)}`);
      }
    };
    loadPending();
    return () => {
      mounted = false;
    };
  }, [append, assignedVehicleId, driverId, incomingAcceptedId]);

  useEffect(() => {
    socket.emit('join_dispatch');
    if (bookingId.trim()) socket.emit('join_booking', { bookingId: bookingId.trim() });

    const handleAssignment = (payload = {}) => {
      const nextTrip = buildTripFromPayload(payload);
      if (!nextTrip) return;
      if (incomingAcceptedId && nextTrip.bookingId === incomingAcceptedId) return;
      const assignedVehicle = pick(nextTrip.vehicleId, payload.vehicleId, payload.vehicle_id, payload.vehicle_number);
      const myVehicle = assignedVehicleId.trim();
      if (myVehicle && assignedVehicle && String(assignedVehicle).toUpperCase() !== myVehicle.toUpperCase()) return;

      if (bookingId.trim() && nextTrip.bookingId === bookingId.trim().toUpperCase()) {
        applyTrip(nextTrip);
        return;
      }
      setIncomingAssignment(nextTrip);
    };

    const handleStatus = (payload = {}) => {
      const nextTrip = buildTripFromPayload(payload);
      if (!nextTrip) return;
      const matchesBooking = bookingId.trim() && nextTrip.bookingId === bookingId.trim().toUpperCase();
      const matchesVehicle = assignedVehicleId.trim() && nextTrip.vehicleId && String(nextTrip.vehicleId).toUpperCase() === assignedVehicleId.trim().toUpperCase();
      if (matchesBooking || matchesVehicle) applyTrip(nextTrip);
    };

    socket.on('new_booking', handleAssignment);
    socket.on('vehicle_update', handleAssignment);
    socket.on('status_update', handleStatus);

    return () => {
      if (bookingId.trim()) socket.emit('leave_booking', { bookingId: bookingId.trim() });
      socket.emit('leave_dispatch');
      socket.off('new_booking', handleAssignment);
      socket.off('vehicle_update', handleAssignment);
      socket.off('status_update', handleStatus);
    };
  }, [applyTrip, assignedVehicleId, bookingId, driverId, incomingAcceptedId, socket]);

  useEffect(() => () => {
    socket.disconnect();
    if (watchRef.current?.remove) watchRef.current.remove();
  }, [socket]);

  const requireIds = () => {
    if (!bookingId.trim() || !driverId.trim()) {
      Alert.alert('Required', 'Enter Booking ID and Driver ID first.');
      return false;
    }
    return true;
  };

  const emitStatus = (status, extra = {}) => {
    const payload = {
      bookingId: bookingId.trim(),
      booking_id: bookingId.trim(),
      vehicle_number: assignedVehicleId.trim() || driverId.trim(),
      vehicleId: assignedVehicleId.trim() || driverId.trim(),
      driverId: driverId.trim(),
      passengerName: activeTrip?.passengerName,
      pickupAddress: activeTrip?.pickup,
      destination: activeTrip?.destination,
      pickupTime: activeTrip?.pickupTime,
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    };
    socket.emit('status_update', payload);
    applyTrip(buildTripFromPayload(payload));
  };

  const acceptIncoming = async () => {
    if (!incomingAssignment?.bookingId || accepting) return;
    if (incomingAcceptedId === incomingAssignment.bookingId) return;

    let vehicleForAccept = String(
      incomingAssignment.vehicleId || assignedVehicleId || '',
    ).trim();
    if (!vehicleForAccept && driverId.trim()) {
      vehicleForAccept = (await resolveVehicleForDriver(driverId)) || driverId.trim();
    }
    if (!vehicleForAccept) {
      Alert.alert(
        'Vehicle ID missing',
        'Enter your Driver ID on this screen first, or ensure your vehicle (CT-xxx) is linked in the system.',
      );
      return;
    }

    setAccepting(true);
    const acceptBid = incomingAssignment.bookingId;
    try {
      const result = await acceptBooking({
        bookingId: acceptBid,
        vehicleId: vehicleForAccept,
        driverId: driverId.trim(),
      });
      const nextTrip = buildTripFromPayload(result?.assignment || incomingAssignment);
      const resolvedVehicle = String(
        nextTrip?.vehicleId || result?.assignment?.vehicleId || vehicleForAccept,
      ).toUpperCase();
      if (resolvedVehicle) setAssignedVehicleId(resolvedVehicle);

      const resolvedDriverId = sanitizeDriverId(
        result?.assignment?.driverId || result?.assignment?.driver_id || driverId,
      );
      if (resolvedDriverId) setDriverId(resolvedDriverId);

      setBookingId(acceptBid);
      applyTrip(nextTrip);
      setIncomingAcceptedId(acceptBid);
      setIncomingAssignment((prev) =>
        prev ? { ...prev, status: 'Accepted', accepted: true } : prev,
      );

      await saveDriverSession(acceptBid, resolvedDriverId || driverId, resolvedVehicle);

      socket.emit('status_update', {
        bookingId: acceptBid,
        booking_id: acceptBid,
        vehicleId: resolvedVehicle,
        vehicle_number: resolvedVehicle,
        driverId: (resolvedDriverId || driverId).trim(),
        passengerName: nextTrip?.passengerName,
        pickupAddress: nextTrip?.pickup,
        destination: nextTrip?.destination,
        pickupTime: nextTrip?.pickupTime,
        status: 'Driver Assigned',
        updated_at: new Date().toISOString(),
      });
      append(`Accepted assignment ${acceptBid}.`);
    } catch (err) {
      Alert.alert('Accept failed', apiErrorMessage(err));
    } finally {
      setAccepting(false);
    }
  };

  const dismissIncoming = () => {
    setIncomingAssignment(null);
    setIncomingAcceptedId(null);
  };

  const runAction = async (action) => {
    if (!requireIds() || loadingAction) return;
    const vehicleForApi = assignedVehicleId.trim();
    if (!vehicleForApi) {
      Alert.alert('Vehicle ID missing', 'Load a booking with an assigned Vehicle ID (CT-xxx) first.');
      return;
    }
    setLoadingAction(action.key);
    try {
      const { data } = await action.request(bookingId.trim(), vehicleForApi);
      const status = data?.status || data?.assignment || {};
      setCompletedActions((prev) => ({ ...prev, [action.key]: true }));
      emitStatus(action.status, {
        barcode_data: status?.barcodeData || status?.barcode_data,
        barcodeData: status?.barcodeData || status?.barcode_data,
      });
      append(action.done);
    } catch (err) {
      append(`${action.title}: ${apiErrorMessage(err)}`);
      Alert.alert('Could not update status', apiErrorMessage(err));
    } finally {
      setLoadingAction('');
    }
  };

  const verifyPassengerOTP = async () => {
    if (!requireIds() || loadingAction) return;
    if (!passengerOtp.trim()) {
      Alert.alert('Required', 'Enter the OTP (Vehicle ID) provided by the passenger.');
      return;
    }
    if (!assignedVehicleId.trim()) {
      Alert.alert('Vehicle missing', 'Assigned vehicle ID not loaded yet for this booking.');
      return;
    }
    if (passengerOtp.trim().toUpperCase() !== assignedVehicleId.trim().toUpperCase()) {
      Alert.alert('Invalid OTP', 'The OTP does not match your assigned Vehicle ID.');
      return;
    }

    setLoadingAction('verifyPassenger');
    try {
      const result = await verifyPassengerVehicle({ bookingId: bookingId.trim(), vehicleId: assignedVehicleId.trim() });
      setCompletedActions((prev) => ({ ...prev, verifyPassenger: true }));
      emitStatus('Barcode issued', {
        barcode_data: result?.status?.barcodeData || result?.status?.barcode_data,
        barcodeData: result?.status?.barcodeData || result?.status?.barcode_data,
      });
      append('Done: Passenger verified.');
    } catch (err) {
      append(`Verify OTP: ${apiErrorMessage(err)}`);
      Alert.alert('Verification failed', apiErrorMessage(err));
    } finally {
      setLoadingAction('');
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
        vehicleId: assignedVehicleId.trim() || driverId.trim(),
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
      vehicleId: assignedVehicleId.trim() || driverId.trim(),
      vehicle_number: assignedVehicleId.trim() || driverId.trim(),
      driverId: driverId.trim(),
      lat: coords.latitude,
      lng: coords.longitude,
      updated_at: new Date().toISOString(),
      status: activeTrip?.status || 'Live',
      current_location: 'Driver GPS ping',
      map_x: 0,
      map_y: 0,
    });
  };

  const stopWatch = async () => {
    if (watchRef.current?.remove) {
      watchRef.current.remove();
      watchRef.current = null;
      append('GPS watcher paused.');
    }
  };

  const startSharing = async () => {
    if (!requireIds()) return;
    const ok = await ensureLocationAllowed();
    if (!ok) return;
    await stopWatch();
    append('Watching GPS every 15s...');
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
      (loc) => pushGpsPing(loc.coords),
    );
    const first = await Location.getCurrentPositionAsync({});
    pushGpsPing(first.coords);
  };

  const manualBookingChanged = (value) => {
    const next = String(value || '').toUpperCase();
    setBookingId(next);
    setCompletedActions({});
    setIncomingAssignment(null);
    setActiveTrip(null);
  };

  const actionDone = (key) => completedActions[key] === true;
  const visibleTrip = activeTrip || (bookingId ? { bookingId, status: 'pending' } : null);
  const tripBadge = statusBadgeColor(visibleTrip?.status);
  const tripStatusLabel = formatTaskStatus(visibleTrip?.status);

  return (
    <View style={styles.outer}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.hamCircle} onPress={() => setMenuOpen(true)} accessibilityLabel="Open menu" hitSlop={12}>
          <Text style={styles.hamLines}>Menu</Text>
        </TouchableOpacity>
        <View style={styles.topTitles}>
          <Text style={styles.brandEyebrow}>City Terminal</Text>
          <Text style={styles.brandTitle}>Live Trip Management</Text>
        </View>
        <View style={styles.hamCirclePlaceholder} />
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuBrand}>Menu</Text>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setMenuOpen(false); navigation.navigate('Profile'); }}>
              <Text style={styles.menuRowIcon}>ID</Text>
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
            <Text style={styles.assignmentEyebrow}>Incoming Booking</Text>
            <Text style={styles.assignmentTitle}>{incomingAssignment?.bookingId}</Text>
            <Info label="Passenger" value={incomingAssignment?.passengerName} />
            <Info label="Pickup" value={incomingAssignment?.pickup} />
            <Info label="Destination" value={incomingAssignment?.destination} />
            <Info label="Pickup time" value={formatPickupTime(incomingAssignment?.pickupTime)} />
            <View style={styles.assignmentActions}>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={dismissIncoming}
                disabled={accepting}
              >
                <Text style={styles.declineTxt}>
                  {incomingAcceptedId === incomingAssignment?.bookingId ? 'Close' : 'Dismiss'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.acceptBtn,
                  incomingAcceptedId === incomingAssignment?.bookingId && styles.acceptBtnDone,
                ]}
                onPress={acceptIncoming}
                disabled={accepting || incomingAcceptedId === incomingAssignment?.bookingId}
              >
                {accepting ? (
                  <ActivityIndicator color="#08100a" />
                ) : (
                  <Text style={styles.acceptTxt}>
                    {incomingAcceptedId === incomingAssignment?.bookingId ? 'Accepted ✓' : 'Accept'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.note}>
          Assigned bookings appear here automatically after passenger confirms location and time slot.
        </Text>

        <Text style={styles.label}>Driver ID</Text>
        <TextInput
          placeholder="Driver ID, e.g. DR-101"
          placeholderTextColor="#6B7280"
          value={driverId}
          onChangeText={setDriverId}
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.label}>Booking ID</Text>
        <TextInput
          placeholder="Passenger booking ID, e.g. DXB8888"
          placeholderTextColor="#6B7280"
          value={bookingId}
          onChangeText={manualBookingChanged}
          onBlur={() => loadCurrentTrip(bookingId)}
          onSubmitEditing={() => loadCurrentTrip(bookingId)}
          autoCapitalize="characters"
          style={styles.input}
        />

        {visibleTrip ? (
          <View style={styles.tripCard}>
            <View style={styles.tripCardHeader}>
              <View>
                <Text style={styles.tripEyebrow}>Persistent Trip Card</Text>
                <Text style={styles.tripBooking}>{visibleTrip.bookingId}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: tripBadge.bg }]}>
                <Text style={[styles.statusBadgeText, { color: tripBadge.text }]}>
                  {tripStatusLabel}
                </Text>
              </View>
            </View>
            <Info label="Driver ID" value={driverId || '—'} />
            <Info label="Vehicle ID" value={assignedVehicleId || '—'} />
            <Info label="Passenger" value={visibleTrip.passengerName || 'Passenger'} />
            <Info label="Pickup" value={visibleTrip.pickup || 'Pickup pending'} />
            <Info label="Destination" value={visibleTrip.destination || 'Airport terminal'} />
            <Info label="Pickup time" value={formatPickupTime(visibleTrip.pickupTime)} />
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active assignment yet</Text>
            <Text style={styles.emptySub}>Keep this screen open. New admin/passenger assignments will pop up here.</Text>
          </View>
        )}

        {ACTIONS.slice(0, 2).map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index + 1}
            done={actionDone(action.key)}
            loading={loadingAction === action.key}
            disabled={!!loadingAction || actionDone(action.key)}
            onPress={() => runAction(action)}
          />
        ))}

        <View style={styles.otpCard}>
          <Text style={styles.label}>Passenger OTP (Their Vehicle ID)</Text>
          <TextInput
            placeholder="Passenger OTP / Vehicle ID (CT-101)"
            placeholderTextColor="#6B7280"
            value={passengerOtp}
            onChangeText={setPassengerOtp}
            autoCapitalize="characters"
            style={styles.input}
          />
          <TouchableOpacity
            style={[styles.btn, styles.btnOtp, actionDone('verifyPassenger') && styles.btnDone]}
            onPress={verifyPassengerOTP}
            disabled={!!loadingAction || actionDone('verifyPassenger')}
          >
            {loadingAction === 'verifyPassenger' ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={[styles.btnTxt, { color: '#000' }]}>
                {actionDone('verifyPassenger') ? 'Verified' : '3 - Verify Passenger'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btn} onPress={startSharing}>
          <Text style={styles.btnTxt}>Start live GPS</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnMuted} onPress={stopWatch}>
          <Text style={styles.btnTxtMuted}>Pause GPS watcher</Text>
        </TouchableOpacity>

        {ACTIONS.slice(2).map((action, index) => (
          <ActionButton
            key={action.key}
            action={action}
            index={index + 4}
            done={actionDone(action.key)}
            loading={loadingAction === action.key}
            disabled={!!loadingAction || actionDone(action.key)}
            onPress={() => runAction(action)}
            airport={action.key === 'airportDone'}
          />
        ))}

        <Text style={styles.log}>{log || 'Telemetry log shows here...'}</Text>
        <Text style={styles.footer}>{Platform.OS} - API {driverClient.defaults.baseURL}</Text>
      </ScrollView>
    </View>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '--'}</Text>
    </View>
  );
}

function ActionButton({ action, index, done, loading, disabled, onPress, airport }) {
  return (
    <TouchableOpacity
      style={[airport ? styles.btnAirport : styles.btn, done && styles.btnDone, disabled && !done && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      {loading ? (
        <ActivityIndicator color="#08110a" />
      ) : (
        <Text style={[styles.btnTxt, done && styles.btnTxtDone, disabled && !done && styles.btnTxtDisabled]}>
          {done ? `Done — ${action.done.replace(/^Done:\s*/i, '')}` : `${index} - ${action.title}`}
        </Text>
      )}
    </TouchableOpacity>
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
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row' },
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
  menuRow: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  menuRowIcon: { color: '#47d361', fontSize: 18 },
  menuRowTitle: { color: '#111827', fontSize: 17, fontWeight: '900' },
  menuRowSub: { color: '#6b7280', fontSize: 12, marginTop: 4, maxWidth: 220 },
  menuClose: { marginTop: 28, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#D1D5DB' },
  menuCloseTxt: { color: '#111827', fontWeight: '800' },
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
  tripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 16,
    marginTop: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  tripCardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  tripEyebrow: { color: '#47d361', fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  tripBooking: { color: '#111827', fontSize: 24, fontWeight: '900', marginTop: 3 },
  statusBadge: { backgroundColor: '#163a1c', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 150 },
  statusBadgeText: { color: '#47d361', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  infoRow: { gap: 3 },
  infoLabel: { color: '#6B7280', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: '#111827', fontSize: 15, fontWeight: '800', lineHeight: 20 },
  emptyCard: { backgroundColor: '#F9FAFB', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 16, marginTop: 18 },
  emptyTitle: { color: '#111827', fontSize: 16, fontWeight: '900' },
  emptySub: { color: '#6B7280', fontSize: 13, marginTop: 6, lineHeight: 19 },
  btn: { backgroundColor: '#47d361', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 18, minHeight: 50, justifyContent: 'center' },
  btnDone: { backgroundColor: '#D1D5DB', borderWidth: 1, borderColor: '#9CA3AF', opacity: 1 },
  btnDisabled: { backgroundColor: '#A7F3D0', opacity: 0.75 },
  btnTxtDone: { color: '#1F2937' },
  btnTxtDisabled: { color: '#064E3B' },
  btnOtp: { backgroundColor: '#eab308' },
  btnTxt: { fontWeight: '900', fontSize: 15, color: '#08110a', textAlign: 'center' },
  btnMuted: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#D1D5DB', padding: 14, alignItems: 'center' },
  btnTxtMuted: { color: '#6b7280', fontWeight: '800' },
  btnAirport: { backgroundColor: '#163a1c', borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 14, minHeight: 50, justifyContent: 'center' },
  log: { marginTop: 26, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, lineHeight: 16 },
  footer: { marginTop: 16, fontSize: 11, color: '#6b7280' },
  otpCard: { backgroundColor: '#FEFCE8', padding: 16, borderRadius: 16, marginTop: 18, borderWidth: 1, borderColor: '#eab308' },
  assignmentBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  assignmentCard: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  assignmentEyebrow: { color: '#47d361', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  assignmentTitle: { color: '#111827', fontSize: 26, fontWeight: '900', marginBottom: 4 },
  assignmentActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  declineBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: '#ef4444', alignItems: 'center' },
  declineTxt: { color: '#ef4444', fontWeight: '900', fontSize: 16 },
  acceptBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#47d361', alignItems: 'center' },
  acceptBtnDone: { backgroundColor: '#9CA3AF' },
  acceptTxt: { color: '#08100a', fontWeight: '900', fontSize: 16 },
});
