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

const COLORS = {
  bg:        '#0A0A0B',
  card:      '#15171B',
  panel:     '#191C20',
  line:      '#2A2F36',
  green:     '#47D361',
  greenDark: '#163A1C',
  red:       '#EF3340',
  amber:     '#F5A623',
  text:      '#FFFFFF',
  muted:     '#A7B0C0',
};
const formatTime = (dateString) => {
  if (!dateString) return '--';
  // Agar humne "  •  " already inject kar diya hai params se, toh as-is show karo
  if (String(dateString).includes('•')) return dateString;
  try {
    if (/^\d{1,2}:\d{2}/.test(dateString)) return dateString.substring(0, 5);
    const d = new Date(dateString);
    if (!isNaN(d)) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return String(dateString);
  } catch { return String(dateString); }
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

  // Booking ID nikalo — sab jagah se try karo
  const bookingId =
    params.bookingId ||
    params.bookingData?.bookingId ||
    params.bookingData?.booking_id ||
    params.confirmation?.bookingId ||
    null;

  // ── States ─────────────────────────────────────────────
  const [loading, setLoading]   = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError]       = useState(null);

  // Vehicle + Driver — DB se aayega, no fallbacks
  const [vehicleId,    setVehicleId]    = useState(null);
  const [driverName,   setDriverName]   = useState(null);
  const [driverPhone,  setDriverPhone]  = useState(null);
  const [pickupLoc,    setPickupLoc]    = useState(null);
  const [destTerminal, setDestTerminal] = useState(null);
  const [pickupTime,   setPickupTime]   = useState(null);
  const [status,       setStatus]       = useState(null);

  // ── Fetch real data from DB ─────────────────────────────
  useEffect(() => {
    if (!bookingId) {
      setError('Booking ID missing. Please go back.');
      setLoading(false);
      return;
    }
    fetchData();
  }, [bookingId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Final Params:', params)
      // ── STEP 1: TimeSlot se aaye hue data ko prioritize karo ──
      const pName = params.pickupLocation?.name || params.pickupLocation || params.slotDetails?.locationName || '--';
      const term = params.destinationTerminal || '--';
      
      // Slot time ko sahi se handle karo
      const sTime = params.slotDetails?.slotTime 
                    ? new Date(params.slotDetails.slotTime).toISOString() 
                    : params.selectedTimeSlot || null;

      setPickupLoc(pName);
      setDestTerminal(term);
      setPickupTime(sTime);

      // ── STEP 2: OTP Status check karo ────────────
      try {
        const otpRes = await apiService.getOTPStatus(bookingId);
        const st = otpRes?.status || otpRes?.assignment || {};

        if (st.vehicleId || st.vehicle_id) {
          setVehicleId(st.vehicleId || st.vehicle_id);
          setDriverName(st.driverName || st.driver_name);
          setDriverPhone(st.driverPhone || st.driver_phone);
          
          // Agar API se data mil raha hai, tabhi override karo, warna mat karo
          if(st.pickupLocation) setPickupLoc(st.pickupLocation);
          if(st.destinationTerminal) setDestTerminal(st.destinationTerminal);
          
          setStatus(st.statusLabel || st.status);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('OTP status check failed, proceeding to assign...');
      }
      // ── STEP 3: Agar vehicle nahi mila → assign karo ─────
      // POST /api/otp/assign
      if (pName && term && pName !== '--' && term !== '--') {
        setAssigning(true);
        try {
          const assignRes = await apiService.assignVehicle({
            bookingId,
            pickupLocation: pName,
            destinationTerminal: term,
            pickupCoordinates: params.pickupLocation?.lat != null && params.pickupLocation?.lng != null
              ? { lat: params.pickupLocation.lat, lng: params.pickupLocation.lng }
              : null,
          });

          const a = assignRes?.assignment || assignRes?.status || {};

          setVehicleId(a.vehicleId || a.vehicle_id || null);
          setDriverName(a.driverName || a.driver_name || null);
          setDriverPhone(a.driverPhone || a.driver_phone || null);
          setStatus(a.statusLabel || a.status || 'dispatched');

        } catch (assignErr) {
          console.warn('Assign failed:', assignErr.message);
          setError('Could not assign vehicle. Please try again.');
        } finally {
          setAssigning(false);
        }
      }

    } catch (err) {
      console.error('BookingConfirm fetchData error:', err.message);
      setError('Could not load booking details.');
    } finally {
      setLoading(false);
    }
  };

  // ── Call driver ─────────────────────────────────────────
  const callDriver = async () => {
    if (!driverPhone) {
      Alert.alert('Phone not available', 'Driver phone number not assigned yet.');
      return;
    }
    const url = `tel:${driverPhone}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Phone unavailable', `Driver phone: ${driverPhone}`);
      return;
    }
    Linking.openURL(url);
  };

  // ── Go to tracking ──────────────────────────────────────
  const goToTracking = () => {
    navigation.navigate('LiveTracking', {
      ...params,
      bookingId,
      confirmation: {
        ...(params.confirmation || {}),
        vehicleNumber:       vehicleId,
        vehicleId:           vehicleId,
        driverName:          driverName,
        driverPhone:         driverPhone,
        locationName:        pickupLoc,
        pickupLocation:      pickupLoc,
        destinationTerminal: destTerminal,
        slotTime:            pickupTime,
      },
    });
  };

  // ── Go to Profile ────────────────────────────────────────
  const goToProfile = () => {
    navigation.navigate('UserProfile', {
      bookingId,
      bookingData: params.bookingData || {},
    });
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
          value={formatTime(pickupTime)}
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
