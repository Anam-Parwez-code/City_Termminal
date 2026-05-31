// ============================================================
// FILE: mobile-app/src/screens/BookingConfirmScreen.js
// FIXED — Dynamic data from DB, no hardcoded fallbacks
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  Alert, Linking, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import { savePassengerTrip } from '../services/passengerTripStorage';
import { formatPickupTime, getPickupTimeFromParams } from '../utils/slotTime';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  panel: '#191C20',
  line: '#2A2F36',
  green: '#47D361',
  greenDark: '#163A1C',
  red: '#EF3340',
  amber: '#F5A623',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const pick = (...values) =>
  values.find((value) => value != null && String(value).trim() !== '' && String(value).trim() !== '--');

const pickupNameFrom = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return pick(value.name, value.label, value.locationName, value.pickupLocation);
};

const pickupCoordsFrom = (value) => {
  if (!value || typeof value !== 'object') return null;
  const lat = value.lat ?? value.latitude;
  const lng = value.lng ?? value.longitude;
  if (lat == null || lng == null || !Number.isFinite(+lat) || !Number.isFinite(+lng)) return null;
  return { lat: +lat, lng: +lng };
};

const DetailRow = ({ label, value, action, loading }) => (
  <TouchableOpacity style={styles.detailRow} disabled={!action} onPress={action}>
    <Text style={styles.detailLabel}>{label}</Text>
    {loading ? (
      <ActivityIndicator size="small" color={COLORS.green} />
    ) : (
      <Text style={[styles.detailValue, action && styles.linkValue]} numberOfLines={2}>
        {value || '--'}
      </Text>
    )}
  </TouchableOpacity>
);

const BookingConfirmScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id || params.confirmation?.bookingId;

  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState(null);
  const [vehicleId, setVehicleId] = useState(null);
  const [driverName, setDriverName] = useState(null);
  const [driverPhone, setDriverPhone] = useState(null);
  const [pickupLoc, setPickupLoc] = useState(null);
  const [destTerminal, setDestTerminal] = useState(null);
  const [pickupTime, setPickupTime] = useState(null);
  const [status, setStatus] = useState(null);

  const callDriver = () => {
    if (!driverPhone) return;
    Linking.openURL(`tel:${driverPhone}`).catch(() => {
      Alert.alert('Call failed', 'Could not open the phone dialer.');
    });
  };

  useEffect(() => {
    if (bookingId) fetchData();
    else { setError('Booking ID missing.'); setLoading(false); }
  }, [bookingId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pName = pick(pickupNameFrom(params.pickupLocation), params.pickupLocationName, params.slotDetails?.locationName) || '--';
      const term = pick(params.destinationTerminal, params.confirmation?.destinationTerminal, params.bookingData?.terminal) || '--';
      const sTime = getPickupTimeFromParams(params) || pick(params.selectedTimeSlot);

      setPickupLoc(pName);
      setDestTerminal(term);
      setPickupTime(sTime);

      let otpRes = null;
      try {
        otpRes = await apiService.getOTPStatus(bookingId);
      } catch (_err) {
        otpRes = null;
      }
      const st = otpRes?.status || otpRes?.assignment || {};

      if (st.vehicleId || st.vehicle_id) {
        setVehicleId(st.vehicleId || st.vehicle_id);
        setDriverName(st.driverName || st.driver_name);
        setDriverPhone(st.driverPhone || st.driver_phone);
        setPickupLoc(st.pickupLocation || st.pickup_location || pName);
        setDestTerminal(st.destinationTerminal || st.destination_terminal || term);
        setStatus(st.statusLabel || st.status);
        if (pName !== '--' && term !== '--') {
          setAssigning(true);
          const assignRes = await apiService.assignVehicle({
            bookingId,
            pickupLocation: pName,
            destinationTerminal: term,
            pickupCoordinates: pickupCoordsFrom(params.pickupLocation),
            pickupTime: sTime,
          });
          const a = assignRes?.assignment || assignRes?.status || {};
          setVehicleId(a.vehicleId || a.vehicle_id || st.vehicleId || st.vehicle_id);
          setDriverName(a.driverName || a.driver_name || st.driverName || st.driver_name);
          setDriverPhone(a.driverPhone || a.driver_phone || st.driverPhone || st.driver_phone);
          setPickupLoc(a.pickupLocation || a.pickup_location || pName);
          setDestTerminal(a.destinationTerminal || a.destination_terminal || term);
          setStatus(a.statusLabel || a.status || st.statusLabel || st.status);
        }
      } else if (pName !== '--' && term !== '--') {
        setAssigning(true);
        const assignRes = await apiService.assignVehicle({
          bookingId,
          pickupLocation: pName,
          destinationTerminal: term,
          pickupCoordinates: pickupCoordsFrom(params.pickupLocation),
          pickupTime: sTime,
        });
        const a = assignRes?.assignment || assignRes?.status || {};
        setVehicleId(a.vehicleId || a.vehicle_id);
        setDriverName(a.driverName || a.driver_name);
        setDriverPhone(a.driverPhone || a.driver_phone);
        setPickupLoc(a.pickupLocation || a.pickup_location || pName);
        setDestTerminal(a.destinationTerminal || a.destination_terminal || term);
        setStatus(a.statusLabel || a.status);
      }
    } catch (err) {
      setError('Could not load booking details.');
    } finally { setLoading(false); setAssigning(false); }
  };

  // --- FUNCTONS KO RETURN KE UPAR RAKHO ---
  const goToTracking = async () => {
    const tripParams = {
      ...params,
      bookingId,
      pickupLocationName: pickupLoc,
      destinationTerminal: destTerminal,
      pickupTimeIso: pickupTime,
      confirmation: {
        ...params.confirmation,
        vehicleId,
        vehicleNumber: vehicleId,
        driverName,
        driverPhone,
        locationName: pickupLoc,
        pickupLocation: pickupLoc,
        pickupCoordinates: pickupCoordsFrom(params.pickupLocation),
        destinationTerminal: destTerminal,
        slotTime: pickupTime,
      },
    };
    await savePassengerTrip({
      bookingId,
      params: tripParams,
      phase: 'tracking',
      status,
      vehicleId,
    });
    navigation.navigate('LiveTracking', tripParams);
  };

  const goToProfile = () => {
    navigation.navigate('UserProfile', { ...params, bookingId });
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, isRTL && styles.textRight]}>
            {vehicleId ? 'Vehicle Assigned ✅' : 'Booking Confirmed'}
          </Text>
          <Text style={[styles.title, isRTL && styles.textRight]}>
            Your City Terminal pickup is ready
          </Text>
        </View>
      </View>

      {/* Vehicle Hero */}
      <View style={[
        styles.vehicleHero,
        !vehicleId && styles.vehicleHeroPending,
      ]}>
        <Text style={styles.vehicleLabel}>
          {vehicleId ? 'Your Vehicle ID' : 'Assigning Vehicle...'}
        </Text>

        {loading || assigning ? (
          <ActivityIndicator size="large" color="#08100A" style={{ marginVertical: 16 }} />
        ) : vehicleId ? (
          <>
            <Text style={styles.vehicleId}>{vehicleId}</Text>
            <Text style={styles.vehicleHint}>
              Tell the driver this Vehicle ID when they arrive at your pickup.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.vehicleIdPending}>⏳</Text>
            <Text style={styles.vehicleHint}>
              {error || 'Vehicle is being assigned. Please wait a moment.'}
            </Text>
          </>
        )}
      </View>

      {/* Error + retry */}
      {error && !loading && (
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
          <Text style={styles.retryTxt}>↻ Retry</Text>
        </TouchableOpacity>
      )}

      {/* Details Card */}
      <View style={styles.detailsCard}>
        <DetailRow
          label="Driver Name"
          value={driverName}
          loading={loading}
        />
        <DetailRow
          label="Driver Phone"
          value={driverPhone}
          action={driverPhone ? callDriver : null}
          loading={loading}
        />
        <DetailRow
          label="Pickup Location"
          value={pickupLoc}
          loading={loading}
        />
        <DetailRow
          label="Pickup Time"
          value={formatPickupTime(pickupTime)}
          loading={loading}
        />
        <DetailRow
          label="Destination Terminal"
          value={destTerminal}
          loading={loading}
        />
        <DetailRow
          label="Status"
          value={status ? String(status).toUpperCase() : '--'}
          loading={loading}
        />
      </View>

      {/* Info note */}
      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>How it works</Text>
        <Text style={styles.noteText}>
          1. Track the driver on the map{'\n'}
          2. When driver arrives, tell them: <Text style={{ fontWeight: '900', color: COLORS.green }}>
            "{vehicleId || '...'}"
          </Text>{'\n'}
          3. Driver enters it in their app → your barcode unlocks{'\n'}
          4. Barcode gets tagged to your luggage → done!
        </Text>
      </View>

      {/* Action buttons */}
      <TouchableOpacity
        style={[styles.trackButton, !vehicleId && styles.trackButtonDisabled]}
        onPress={goToTracking}
        disabled={!vehicleId}
      >
        <Text style={styles.trackText}>
          {isRTL ? '← تتبع المركبة' : 'Live Tracking →'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.profileButton} onPress={goToProfile}>
        <Text style={styles.profileText}>My Profile & Barcode</Text>
      </TouchableOpacity>

    </ScrollView>
  );
};

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content:   { padding: 22, paddingTop: 58, paddingBottom: 40 },

  header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 24 },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.line,
  },
  backText:   { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: COLORS.green, fontSize: 12, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 1.1,
  },
  title: {
    color: COLORS.text, fontSize: 26, fontWeight: '900',
    lineHeight: 32, marginTop: 4,
  },
  textRight: { textAlign: 'right' },

  // Vehicle Hero
  vehicleHero: {
    backgroundColor: COLORS.green,
    borderRadius: 28, padding: 26, marginBottom: 18,
    minHeight: 120,
  },
  vehicleHeroPending: {
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line,
    alignItems: 'center',
  },
  vehicleLabel: {
    color: '#08100A', fontSize: 13, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  vehicleId: {
    color: '#08100A', fontSize: 52, fontWeight: '900',
    letterSpacing: 2, marginVertical: 6,
  },
  vehicleIdPending: {
    fontSize: 36, marginVertical: 8,
  },
  vehicleHint: {
    color: '#0B240F', fontSize: 13, fontWeight: '700', lineHeight: 18,
  },

  // Retry
  retryBtn: {
    backgroundColor: COLORS.red, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center', marginBottom: 12,
  },
  retryTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },

  // Details
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24, paddingHorizontal: 18,
    borderWidth: 1, borderColor: COLORS.line,
    marginBottom: 18,
  },
  detailRow: {
    paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.line,
  },
  detailLabel: {
    color: COLORS.muted, fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  detailValue: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  linkValue:   { color: COLORS.green, textDecorationLine: 'underline' },

  // Note
  noteCard: {
    backgroundColor: COLORS.greenDark, borderRadius: 20,
    padding: 18, marginBottom: 18,
    borderWidth: 1, borderColor: '#245F2E',
  },
  noteTitle: { color: COLORS.text, fontSize: 15, fontWeight: '900', marginBottom: 8 },
  noteText:  { color: '#D7F6DF', fontSize: 13, lineHeight: 21 },

  // Buttons
  trackButton: {
    backgroundColor: COLORS.green, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center', marginBottom: 12,
  },
  trackButtonDisabled: { backgroundColor: '#2E3138' },
  trackText: { color: '#08100A', fontSize: 16, fontWeight: '900' },

  profileButton: {
    backgroundColor: COLORS.card, borderRadius: 18,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.line,
  },
  profileText: { color: COLORS.muted, fontSize: 15, fontWeight: '700' },
});

export default BookingConfirmScreen;
