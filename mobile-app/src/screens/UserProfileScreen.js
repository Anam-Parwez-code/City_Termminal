// ============================================================
// FILE: mobile-app/src/screens/UserProfileScreen.js
// FIXED — Booking ID se poora data fetch hoga
// Name, Flight, Terminal, Vehicle, Barcode sab
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import apiService from '../services/apiService';
import theme from '../theme';

// Socket origin from apiService base URL
const _apiBase = apiService?.defaults?.baseURL || '';
const socketOrigin = _apiBase.replace(/\/api\/?.*$/, '') || 'http://localhost:5000';

const COLORS = {
  bg:    '#0A0A0B',
  card:  '#15171B',
  line:  '#2A2F36',
  green: theme?.colors?.careemGreen || '#47D361',
  red:   '#EF3340',
  amber: '#F5A623',
  text:  '#FFFFFF',
  muted: '#A7B0C0',
  dark:  '#111318',
};

const EMPTY = '-';

// ── Helper: pehli non-empty value nikalo ──────────────────
const pick = (...values) =>
  values.find(v => v != null && String(v).trim() !== '' && String(v).trim() !== EMPTY);

// ── Format time ──────────────────────────────────────────
const formatTime = (raw) => {
  if (!raw) return EMPTY;
  try {
    // "14:30:00" format
    if (/^\d{1,2}:\d{2}/.test(raw)) return raw.substring(0, 5);
    const d = new Date(raw);
    if (!isNaN(d)) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return String(raw);
  } catch { return String(raw); }
};

// ── Sub components ────────────────────────────────────────
const InfoRow = ({ label, value, valueColor }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>
      {value || EMPTY}
    </Text>
  </View>
);

const Card = ({ title, children, titleColor }) => (
  <View style={styles.card}>
    <Text style={[styles.cardTitle, titleColor && { color: titleColor }]}>{title}</Text>
    {children}
  </View>
);

const Divider = () => <View style={styles.divider} />;

// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════
const UserProfileScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  const params = route?.params || {};

  // Booking ID — sab jagah se try karo
  const bookingId = pick(
    params.bookingId,
    params.bookingData?.bookingId,
    params.bookingData?.booking_id,
    params.status?.bookingId,
  ) || null;

  // ── States ──────────────────────────────────────────
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  // Passenger data
  const [passenger, setPassenger] = useState({
    name: 'Loading...',
    phone: EMPTY,
    passportNumber: EMPTY,
    nationality: EMPTY,
  });

  // Flight data
  const [flight, setFlight] = useState({
    flightNumber: EMPTY,
    airline: EMPTY,
    destination: EMPTY,
    terminal: EMPTY,
    departureTime: null,
    seatNumber: EMPTY,
  });

  // Vehicle / booking status
  const [vehicleData, setVehicleData] = useState({
    bookingId:       bookingId,
    vehicleId:       null,
    driverName:      null,
    driverPhone:     null,
    status:          'Scheduled',
    vehicleVerified: false,
    barcodeData:     null,
    currentLocation: null,
    reachedAirport:  false,
  });

  const socketRef = useRef(null);

  // ── MAIN FETCH FUNCTION ────────────────────────────
  // bookings table se passenger + flight data
  // vehicle_assignments se driver + barcode data
  const fetchAllData = useCallback(async (isRefresh = false) => {
    if (!bookingId) {
      setLoading(false);
      setError('No booking ID found. Please go back and try again.');
      return;
    }

    if (!isRefresh) setLoading(true);
    setError(null);

    try {
      // ── STEP 1: Booking verify → passenger + flight data ──
      // POST /api/bookings/verify
      let bookingRes = null;
      try {
        bookingRes = await apiService.verifyBooking({
          bookingId: bookingId.trim().toUpperCase(),
        });
      } catch (e) {
        console.warn('verifyBooking failed:', e.message);
      }

      // Agar verify fail hua → GET /api/bookings/:bookingId try karo
      if (!bookingRes?.success) {
        try {
          bookingRes = await apiService.getBookingDetails(bookingId);
        } catch (e) {
          console.warn('getBookingDetails failed:', e.message);
        }
      }

      // Booking data parse karo
      const bd = bookingRes?.bookingData || bookingRes?.booking || {};

      if (bd) {
        setPassenger({
          name:           pick(bd.passenger_name, bd.passengerName, 'Passenger') || 'Passenger',
          phone:          pick(bd.passenger_phone, bd.passengerPhone, EMPTY) || EMPTY,
          passportNumber: pick(bd.passport_number, bd.passportNumber, EMPTY) || EMPTY,
          nationality:    pick(bd.nationality, EMPTY) || EMPTY,
        });

        setFlight({
          flightNumber:  pick(bd.flight_number, bd.flightNumber, EMPTY) || EMPTY,
          airline:       pick(bd.airline_code, bd.airlineCode, bd.airline, EMPTY) || EMPTY,
          destination:   pick(bd.destination, EMPTY) || EMPTY,
          terminal:      pick(bd.terminal, bd.destination_terminal, 'Terminal 3') || 'Terminal 3',
          departureTime: bd.departure_time || bd.departureTime || null,
          seatNumber:    pick(bd.seat_number, bd.seatNumber, EMPTY) || EMPTY,
        });

        // Vehicle data from booking response (if available)
        if (bd.vehicle_id || bd.vehicleId) {
          setVehicleData(prev => ({
            ...prev,
            vehicleId:       pick(bd.vehicle_id, bd.vehicleId, prev.vehicleId),
            driverName:      pick(bd.driver_name, bd.driverName, prev.driverName),
            driverPhone:     pick(bd.driver_phone, bd.driverPhone, prev.driverPhone),
            status:          pick(bd.status, bd.vehicle_status, prev.status) || 'Scheduled',
            vehicleVerified: bd.vehicle_verified === true || prev.vehicleVerified,
            barcodeData:     bd.vehicle_verified ? pick(bd.barcode_data, bd.barcodeData, prev.barcodeData) : prev.barcodeData,
          }));
        }
      }

      // ── STEP 2: OTP Status → vehicle + barcode data ───────
      // GET /api/otp/status/:bookingId
      try {
        const otpRes = await apiService.getOTPStatus(bookingId);
        const st = otpRes?.status || otpRes?.assignment || otpRes || {};

        if (st) {
          const isVerified =
            st.vehicleVerified === true ||
            st.vehicle_verified === true ||
            ['barcode_issued', 'at_airport'].includes(String(st.status || '').toLowerCase());

          const barcode = isVerified
            ? pick(st.barcodeData, st.barcode_data, st.barcode)
            : null;

          setVehicleData(prev => ({
            bookingId:       pick(st.bookingId, st.booking_id, prev.bookingId),
            vehicleId:       pick(st.vehicleId, st.vehicle_id, prev.vehicleId),
            driverName:      pick(st.driverName, st.driver_name, prev.driverName),
            driverPhone:     pick(st.driverPhone, st.driver_phone, prev.driverPhone),
            status:          pick(st.statusLabel, st.status, prev.status) || 'Scheduled',
            vehicleVerified: isVerified || prev.vehicleVerified,
            barcodeData:     barcode || (prev.vehicleVerified ? prev.barcodeData : null),
            currentLocation: pick(st.currentLocation, st.current_location, prev.currentLocation),
            reachedAirport:  st.reachedAirport === true || st.reached_airport === true || prev.reachedAirport,
          }));

          // Flight from OTP status
          const fl = st.flight || {};
          if (fl.flightNumber || fl.destination) {
            setFlight(prev => ({
              flightNumber:  pick(fl.flightNumber, fl.flight_number, prev.flightNumber) || prev.flightNumber,
              airline:       pick(fl.airline, prev.airline) || prev.airline,
              destination:   pick(fl.destination, prev.destination) || prev.destination,
              terminal:      pick(fl.terminal, fl.destinationTerminal, prev.terminal) || prev.terminal,
              departureTime: fl.departureTime || fl.departure_time || prev.departureTime,
              seatNumber:    prev.seatNumber,
            }));
          }
        }
      } catch (e) {
        console.warn('OTP status fetch failed:', e.message);
      }

    } catch (err) {
      console.error('fetchAllData error:', err.message);
      setError('Could not load profile. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  // ── Initial fetch ──────────────────────────────────
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ── Poll every 8 seconds ──────────────────────────
  useEffect(() => {
    const interval = setInterval(() => fetchAllData(true), 8000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // ── WebSocket — barcode instant unlock ────────────
  useEffect(() => {
    if (!bookingId) return;

    const socket = io(socketOrigin, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.emit('join', { room: `booking:${bookingId}` });

    socket.on('status_update', (payload) => {
      const pBid = payload?.bookingId || payload?.booking_id || '';
      if (String(pBid).toUpperCase() !== String(bookingId).toUpperCase()) return;

      console.log('[UserProfile] Socket update:', payload.status);

      const isVerified =
        payload.vehicleVerified === true ||
        payload.vehicle_verified === true ||
        ['barcode_issued', 'at_airport'].includes(String(payload.status || '').toLowerCase());

      const barcode = isVerified
        ? pick(payload.barcodeData, payload.barcode_data, payload.barcode)
        : null;

      setVehicleData(prev => ({
        ...prev,
        vehicleId:       pick(payload.vehicleId, payload.vehicle_id, payload.vehicle_number, prev.vehicleId),
        driverName:      pick(payload.driverName, payload.driver_name, prev.driverName),
        driverPhone:     pick(payload.driverPhone, payload.driver_phone, prev.driverPhone),
        status:          pick(payload.statusLabel, payload.status, prev.status) || prev.status,
        vehicleVerified: isVerified || prev.vehicleVerified,
        barcodeData:     barcode || (prev.vehicleVerified ? prev.barcodeData : null),
        currentLocation: pick(payload.current_location, payload.currentLocation, prev.currentLocation),
        reachedAirport:  payload.reachedAirport === true || payload.reached_airport === true || prev.reachedAirport,
      }));
    });

    return () => socket.disconnect();
  }, [bookingId]);

  // ── Status color ──────────────────────────────────
  const statusColor = () => {
    const st = String(vehicleData.status || '').toLowerCase();
    if (st.includes('airport') || st === 'at_airport') return COLORS.green;
    if (st.includes('barcode') || st === 'barcode_issued') return COLORS.green;
    if (st.includes('route') || st.includes('en_route')) return COLORS.amber;
    if (st.includes('arrived') || st.includes('pickup')) return COLORS.amber;
    return COLORS.muted;
  };

  // ── Barcode value ─────────────────────────────────
  const barcodeValue = () => {
    if (!vehicleData.barcodeData) return bookingId || 'CITY-TERMINAL';
    try {
      return typeof vehicleData.barcodeData === 'object'
        ? JSON.stringify(vehicleData.barcodeData)
        : String(vehicleData.barcodeData);
    } catch { return bookingId || 'CITY-TERMINAL'; }
  };

  // ── Render ────────────────────────────────────────
  if (!bookingId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.muted, fontSize: 16, textAlign: 'center', paddingHorizontal: 32 }}>
          No booking found.{'\n'}Please go back and complete your booking first.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => { setRefreshing(true); fetchAllData(true); }}
        >
          <Text style={{ color: COLORS.green, fontSize: 18 }}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAllData(true); }}
            tintColor={COLORS.green}
          />
        }
      >

        {/* Booking ID Badge */}
        <View style={styles.bookingBadge}>
          <Text style={styles.bookingBadgeLabel}>BOOKING ID</Text>
          <Text style={styles.bookingBadgeId}>{bookingId}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchAllData()}>
              <Text style={styles.retryTxt}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── PASSENGER INFO ── */}
            <Card title="PASSENGER INFO">
              <InfoRow label="Full Name"       value={passenger.name} />
              <Divider />
              <InfoRow label="Phone"           value={passenger.phone} />
              <Divider />
              <InfoRow label="Nationality"     value={passenger.nationality} />
              <Divider />
              <InfoRow label="Passport Number" value={passenger.passportNumber} />
            </Card>

            {/* ── FLIGHT DETAILS ── */}
            <Card title="FLIGHT DETAILS">
              <InfoRow label="Flight Number" value={flight.flightNumber} />
              <Divider />
              <InfoRow label="Airline"       value={flight.airline} />
              <Divider />
              <InfoRow label="Destination"   value={flight.destination} />
              <Divider />
              <InfoRow label="Terminal"      value={flight.terminal} />
              <Divider />
              <InfoRow label="Departure"     value={formatTime(flight.departureTime)} valueColor={COLORS.amber} />
              <Divider />
              <InfoRow label="Seat"          value={flight.seatNumber} />
            </Card>

            {/* ── VEHICLE STATUS ── */}
            <Card title="VEHICLE & DRIVER">
              <InfoRow
                label="Vehicle ID"
                value={vehicleData.vehicleId || 'Assigning...'}
                valueColor={vehicleData.vehicleId ? COLORS.amber : COLORS.muted}
              />
              <Divider />
              <InfoRow
                label="Driver Name"
                value={vehicleData.driverName || 'Assigning...'}
              />
              <Divider />
              <InfoRow
                label="Driver Phone"
                value={vehicleData.driverPhone || EMPTY}
              />
              <Divider />
              <InfoRow
                label="Location"
                value={vehicleData.currentLocation || 'Tracking...'}
              />
              <Divider />
              <InfoRow
                label="Status"
                value={String(vehicleData.status).toUpperCase()}
                valueColor={statusColor()}
              />
              {vehicleData.reachedAirport && (
                <>
                  <Divider />
                  <View style={styles.arrivedBanner}>
                    <Text style={styles.arrivedText}>✅ Driver has reached Dubai Airport!</Text>
                  </View>
                </>
              )}
            </Card>

            {/* ── BARCODE SECTION ── */}
            {vehicleData.vehicleVerified && vehicleData.barcodeData ? (
              /* UNLOCKED — show barcode */
              <View style={styles.barcodeCard}>
                <Text style={styles.barcodeTitle}>Luggage Tag Barcode</Text>
                <Text style={styles.barcodeDesc}>
                  Driver verified your Vehicle ID.{'\n'}Show this at the airport counter.
                </Text>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={barcodeValue()}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#0A0A0B"
                  />
                </View>
                <Text style={styles.qrCaption}>SCAN AT AIRPORT COUNTER</Text>
                {/* Driver info on barcode card */}
                <View style={styles.barcodeDriverInfo}>
                  <Text style={styles.barcodeDriverText}>
                    🚗 {vehicleData.vehicleId}  •  👤 {vehicleData.driverName}
                  </Text>
                </View>
              </View>
            ) : vehicleData.vehicleId ? (
              /* LOCKED — vehicle assigned but waiting for verify */
              <View style={styles.lockedCard}>
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={styles.lockedTitle}>Barcode Locked</Text>

                <View style={styles.vehicleIdPill}>
                  <Text style={styles.vehicleIdLabel}>YOUR VEHICLE ID</Text>
                  <Text style={styles.vehicleIdValue}>{vehicleData.vehicleId}</Text>
                </View>

                <Text style={styles.lockedInstr}>
                  Tell the driver your Vehicle ID:{'\n'}
                  <Text style={{ color: COLORS.amber, fontWeight: '900' }}>
                    "{vehicleData.vehicleId}"
                  </Text>
                </Text>
                <Text style={styles.lockedSub}>
                  Once driver enters it in the driver app, your barcode will unlock here automatically.
                </Text>
              </View>
            ) : (
              /* No vehicle yet */
              <View style={styles.lockedCard}>
                <Text style={styles.lockIcon}>⏳</Text>
                <Text style={styles.lockedTitle}>Vehicle Being Assigned</Text>
                <Text style={styles.lockedSub}>
                  Your vehicle and driver are being assigned.{'\n'}
                  This screen auto-updates every 8 seconds.
                </Text>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
};

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.line,
  },
  backText:     { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  headerTitle:  { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  refreshIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  content: { padding: 20, paddingBottom: 40 },

  // Booking badge
  bookingBadge: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  bookingBadgeLabel: {
    color: COLORS.muted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 4,
  },
  bookingBadgeId: {
    color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: 3,
  },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20, padding: 18,
    marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.line,
  },
  cardTitle: {
    color: COLORS.muted, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  infoValue: { color: COLORS.text, fontSize: 14, fontWeight: '800', maxWidth: '55%', textAlign: 'right' },
  divider:   { height: 0.5, backgroundColor: COLORS.line, marginVertical: 8 },

  // Arrived banner
  arrivedBanner: {
    backgroundColor: '#0D2B1A',
    borderRadius: 10, padding: 10,
    alignItems: 'center', marginTop: 6,
    borderWidth: 1, borderColor: '#166534',
  },
  arrivedText: { color: COLORS.green, fontWeight: '700', fontSize: 13 },

  // Barcode unlocked
  barcodeCard: {
    backgroundColor: COLORS.green,
    borderRadius: 24, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  barcodeTitle: {
    color: '#08100A', fontSize: 20, fontWeight: '900', marginBottom: 6,
  },
  barcodeDesc: {
    color: '#163A1C', fontSize: 13, fontWeight: '600',
    textAlign: 'center', marginBottom: 20, lineHeight: 18,
  },
  qrWrapper: {
    backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 12,
  },
  qrCaption: {
    color: '#08100A', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.5, marginBottom: 12,
  },
  barcodeDriverInfo: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
  },
  barcodeDriverText: { color: '#08100A', fontSize: 13, fontWeight: '700' },

  // Barcode locked
  lockedCard: {
    backgroundColor: COLORS.dark,
    borderRadius: 24, padding: 28,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.line,
    borderStyle: 'dashed',
  },
  lockIcon:     { fontSize: 40, marginBottom: 12 },
  lockedTitle:  { color: COLORS.text, fontSize: 18, fontWeight: '900', marginBottom: 16 },
  vehicleIdPill: {
    backgroundColor: COLORS.card,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: COLORS.amber,
    alignItems: 'center', marginBottom: 16,
  },
  vehicleIdLabel: {
    color: COLORS.muted, fontSize: 9, fontWeight: '700',
    letterSpacing: 1, marginBottom: 4,
  },
  vehicleIdValue: {
    color: COLORS.amber, fontSize: 24, fontWeight: '900', letterSpacing: 3,
  },
  lockedInstr: {
    color: COLORS.muted, fontSize: 14, fontWeight: '600',
    textAlign: 'center', lineHeight: 22, marginBottom: 10,
  },
  lockedSub: {
    color: COLORS.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, opacity: 0.7,
  },

  // Error
  errorCard: { padding: 24, alignItems: 'center' },
  errorText: { color: COLORS.red, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: COLORS.red, paddingVertical: 12,
    paddingHorizontal: 28, borderRadius: 12,
  },
  retryTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});

export default UserProfileScreen;