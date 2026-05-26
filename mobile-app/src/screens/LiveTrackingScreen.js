// ============================================================
// FILE: mobile-app/src/screens/LiveTrackingScreen.js
// FIXED — Real countdown timer (har second ghatta hai)
// ============================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import TripMap from '../components/TripMap';
import apiService, { getSocketBaseUrl } from '../services/apiService';

const { height } = Dimensions.get('window');

const COLORS = {
  bg:        '#F8FAF8',
  map:       '#E8F5EA',
  card:      '#FFFFFF',
  line:      '#E5E7EB',
  green:     '#47D361',
  greenDark: '#163A1C',
  text:      '#111111',
  muted:     '#6B7280',
};

const STAGES = [
  { key: 'dispatched',       label: 'Dispatched',           eta: 18,  progress: 0.08, x: 0.18, y: 0.72 },
  { key: 'en_route',         label: 'En Route',             eta: 12,  progress: 0.26, x: 0.34, y: 0.62 },
  { key: 'arrived_pickup',   label: 'At Pickup Zone',       eta: 0,   progress: 0.42, x: 0.48, y: 0.54 },
  { key: 'barcode_issued',   label: 'Barcode ready',        eta: 0,   progress: 0.54, x: 0.56, y: 0.5  },
  { key: 'en_route_airport', label: 'En Route to Airport',  eta: 10,  progress: 0.78, x: 0.68, y: 0.4  },
  { key: 'at_airport',       label: 'Arrived — Airport',    eta: 0,   progress: 1,    x: 0.82, y: 0.3  },
];

const normalizeStatus = (value) => {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!raw || raw === 'undefined') return 'dispatched';
  if (raw.includes('barcode')) return 'barcode_issued';

  if (
    raw === 'at_airport' ||
    raw.endsWith('_at_airport') ||
    raw.includes('landed_at_terminal') ||
    (raw.includes('arrived') &&
      raw.includes('airport') &&
      !raw.includes('pickup') &&
      !raw.includes('en_route'))
  ) {
    return 'at_airport';
  }

  if (
    raw === 'en_route_airport' ||
    raw.includes('en_route_airport') ||
    raw.includes('heading_to_airport') ||
    (raw.includes('heading_to') && raw.includes('terminal'))
  ) {
    return 'en_route_airport';
  }

  if (
    (raw.includes('pickup') || raw.includes('passenger')) &&
    (raw.includes('arrived') || raw.includes('reached') || raw.includes('waiting_for_vehicle'))
  ) {
    return 'arrived_pickup';
  }

  if (raw.includes('en_route')) return 'en_route';
  return raw || 'dispatched';
};

const stageForStatus = (status) =>
  STAGES.find((stage) => stage.key === normalizeStatus(status)) || STAGES[0];

const pick = (...values) =>
  values.find((value) => value != null && String(value).trim() !== '' && String(value).trim() !== 'â€”');

const pickupNameFrom = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return pick(value.name, value.label, value.locationName, value.pickupLocation);
};

const coordsFrom = (...values) => {
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const lat = value.lat ?? value.latitude;
    const lng = value.lng ?? value.longitude;
    if (lat != null && lng != null && Number.isFinite(+lat) && Number.isFinite(+lng)) {
      return { lat: +lat, lng: +lng };
    }
  }
  return null;
};

// ── ETA seconds se mm:ss format ──────────────────────────
const formatETA = (totalSeconds) => {
  if (totalSeconds <= 0) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

// ════════════════════════════════════════════════════════
const LiveTrackingScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL       = i18n.dir() === 'rtl';
  const params      = route?.params || {};
  const bookingId   = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
  const confirmation = params.confirmation || {};

  const [statusData,   setStatusData]   = useState(params.statusData || null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [pushNotify,   setPushNotify]   = useState({ visible: false, title: '', body: '' });

  // ── Real countdown timer state ────────────────────────
  // etaSeconds = total seconds bache hain (e.g. 18 min = 1080 seconds)
  const [etaSeconds,   setEtaSeconds]   = useState(null);
  const countdownRef   = useRef(null);
  const arrivedPing    = useRef(false);
  const pulseAnim      = useRef(new Animated.Value(1)).current;

  const vehicleId =
    statusData?.vehicleId || statusData?.vehicle_id ||
    confirmation.vehicleId || confirmation.vehicleNumber || '—';

  const currentStage = useMemo(
    () => stageForStatus(statusData?.status),
    [statusData?.status],
  );

  const pickupLocation =
    pick(
      statusData?.pickupLocation,
      statusData?.pickup_location,
      confirmation.pickupLocation,
      confirmation.locationName,
      pickupNameFrom(params?.pickupLocation),
      params?.pickupLocationName,
    ) || 'Pickup';

  const destinationTerminal =
    pick(
      statusData?.destinationTerminal,
      statusData?.destination_terminal,
      confirmation.destinationTerminal,
      params?.destinationTerminal,
      params?.bookingData?.terminal,
    ) || 'DXB';

  const pickupCoords = useMemo(() => {
    return coordsFrom(params.pickupLocation, confirmation.pickupCoordinates, statusData?.pickupCoordinates);
  }, [confirmation.pickupCoordinates, params.pickupLocation, statusData?.pickupCoordinates]);

  const pickupForMap   = pickupCoords || null;

  const rawDriver =
    driverCoords ||
    (statusData?.driverLat != null && statusData?.driverLng != null
      ? { lat: Number(statusData.driverLat), lng: Number(statusData.driverLng) }
      : null) ||
    (pickupCoords
      ? {
          lat: pickupCoords.lat + (0.018 * (1 - currentStage.progress)),
          lng: pickupCoords.lng + (0.014 * (1 - currentStage.progress)),
        }
      : null);

  const validDriverCoords =
    rawDriver &&
    Number.isFinite(rawDriver.lat) &&
    Number.isFinite(rawDriver.lng) &&
    Math.abs(rawDriver.lat) <= 90 &&
    Math.abs(rawDriver.lng) <= 180
      ? rawDriver
      : null;

  const isAtPickup    = currentStage.key === 'arrived_pickup';
  const isBarcodeStage = normalizeStatus(statusData?.status) === 'barcode_issued';
  const isAtAirport   = currentStage.key === 'at_airport';
  const slotTime = pick(
    statusData?.slotTime,
    statusData?.slot_time,
    confirmation.slotTime,
    params?.slotDetails?.slotTime,
    params?.selectedTimeSlot,
  );
  const barcodeData = pick(
    statusData?.barcodeData,
    statusData?.barcode_data,
    confirmation.barcodeData,
    confirmation.barcode_data,
    confirmation.qrCode,
  );

  // ── ETA countdown start/reset karo ───────────────────
  // Jab bhi stage change ho ya server se etaMinutes aaye, timer reset ho
  const startCountdown = useCallback((minutes) => {
    // Purana timer band karo
    if (countdownRef.current) clearInterval(countdownRef.current);

    const totalSecs = Math.max(0, Math.round(minutes * 60));
    setEtaSeconds(totalSecs);

    if (totalSecs === 0) return; // "0 min" stages ke liye timer nahi

    countdownRef.current = setInterval(() => {
      setEtaSeconds((prev) => {
        if (prev == null || prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000); // Har 1 second mein ghatta hai
  }, []);

  // Stage ya server ETA change hone par countdown reset karo
  useEffect(() => {
    const serverEta = statusData?.etaMinutes;

    if (typeof serverEta === 'number' && serverEta > 0) {
      // Server ne real ETA diya — use karo
      startCountdown(serverEta);
    } else if (currentStage.eta > 0) {
      // Stage ka default ETA use karo
      startCountdown(currentStage.eta);
    } else {
      // Arrived stages (0 min)
      if (countdownRef.current) clearInterval(countdownRef.current);
      setEtaSeconds(0);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [currentStage.key, statusData?.etaMinutes, startCountdown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Pulse animation ────────────────────────────────────
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.28, duration: 800, useNativeDriver }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver }),
      ]),
    ).start();
  }, [pulseAnim]);

  // ── Fetch + Socket ────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const fetchStatus = async () => {
      if (!bookingId) return;
      try {
        const result = await apiService.getOTPStatus(bookingId);
        const next   = result.status || result.assignment || null;
        if (mounted && next) {
          setStatusData(next);
          const lat =
            next.driverLat  != null ? Number(next.driverLat)  :
            next.driver_lat != null ? Number(next.driver_lat)  : null;
          const lng =
            next.driverLng  != null ? Number(next.driverLng)  :
            next.driver_lng != null ? Number(next.driver_lng)  : null;
          if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            setDriverCoords({ lat, lng });
          }
        }
      } catch (_err) { /* silent */ }
    };

    fetchStatus();
    const pollTimer = setInterval(fetchStatus, 8000);

    const baseUrl = getSocketBaseUrl?.() || '';
    let socket;

    try {
      if (bookingId && baseUrl.length > 0) {
        socket = io(baseUrl, {
          transports: ['websocket', 'polling'],
          reconnectionDelay: 2000,
        });
        socket.emit('join_booking', { bookingId });

        socket.on('location_update', (payload = {}) => {
          const pb = String(payload.bookingId || payload.booking_id || '').toUpperCase();
          const my = String(bookingId || '').toUpperCase();
          if (!pb || pb !== my) return;
          const lat = payload.lat ?? payload.latitude;
          const lng = payload.lng ?? payload.longitude;
          if (lat != null && lng != null) {
            setDriverCoords({ lat: Number(lat), lng: Number(lng) });
          }
          // Server ne real-time ETA bheja — timer update karo
          if (typeof payload.etaMinutes === 'number' && payload.etaMinutes > 0) {
            startCountdown(payload.etaMinutes);
          }
        });

        socket.on('status_update', (payload = {}) => {
          const pb = String(payload.bookingId || payload.booking_id || '').toUpperCase();
          const my = String(bookingId || '').toUpperCase();
          if (pb && pb !== my) return;

          const n = payload.notification;
          const statusStr = String(payload.status || '').toLowerCase();
          if (n?.title || n?.body) {
            setPushNotify({
              visible: true,
              title: n.title || 'Trip update',
              body: n.body || payload.status || '',
            });
          } else if (statusStr.includes('en route') && statusStr.includes('pickup')) {
            setPushNotify({
              visible: true,
              title: 'Driver en route',
              body: 'Your driver is on the way to pickup.',
            });
          } else if (statusStr.includes('pickup') && (statusStr.includes('arrived') || statusStr.includes('at pickup'))) {
            setPushNotify({
              visible: true,
              title: 'Driver at pickup',
              body: 'Your driver has arrived at the pickup point.',
            });
          } else if (statusStr.includes('airport')) {
            setPushNotify({
              visible: true,
              title: 'Airport update',
              body: payload.status || 'Van status updated for airport leg.',
            });
          }

          setStatusData((prev) => ({
            ...(prev || {}),
            status:           payload.status           || prev?.status,
            etaMinutes:       payload.etaMinutes       ?? prev?.etaMinutes,
            barcodeData:      payload.barcodeData      || payload.barcode_data   || prev?.barcodeData,
            barcode_data:     payload.barcode_data     || payload.barcodeData    || prev?.barcode_data,
            currentLocation:  payload.currentLocation  || payload.current_location || prev?.currentLocation,
            current_location: payload.current_location || payload.currentLocation  || prev?.current_location,
            vehicleId:        payload.vehicleId        || payload.vehicle_number   || prev?.vehicleId,
            vehicle_id:       payload.vehicle_id       || payload.vehicleId        || payload.vehicle_number || prev?.vehicle_id,
            driverName:       payload.driverName       || payload.driver_name      || payload.driver || prev?.driverName,
            driverPhone:      payload.driverPhone      || payload.driver_phone     || prev?.driverPhone,
            pickupLocation:   payload.pickupLocation   || payload.pickup_location  || prev?.pickupLocation,
            pickup_location:  payload.pickup_location  || payload.pickupLocation   || prev?.pickup_location,
            destinationTerminal: payload.destinationTerminal || payload.destination_terminal || prev?.destinationTerminal,
            destination_terminal: payload.destination_terminal || payload.destinationTerminal || prev?.destination_terminal,
          }));
          fetchStatus();
        });
      }
    } catch (_e) { /* silent */ }

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      socket?.disconnect?.();
    };
  }, [bookingId, startCountdown]);

  // ── Boarding pass / airport handoff ───────────────────
  useEffect(() => {
    if ((!isBarcodeStage && !isAtAirport) || arrivedPing.current) return;
    arrivedPing.current = true;
    navigation.replace('Confirmation', {
      ...params,
      bookingId,
      statusData,
      confirmation: {
        ...confirmation,
        ...(statusData || {}),
        vehicleId,
        vehicleNumber: vehicleId,
        locationName: pickupLocation,
        pickupLocation,
        destinationTerminal,
        slotTime,
        barcodeData,
        barcode_data: barcodeData,
        qrCode: barcodeData || confirmation.qrCode,
      },
    });
  }, [barcodeData, bookingId, confirmation, destinationTerminal, isAtAirport, isBarcodeStage, navigation, params, pickupLocation, slotTime, statusData, vehicleId]);

  // ── ETA display ───────────────────────────────────────
  // etaSeconds null = still loading initial stage
  const etaDisplay = etaSeconds == null
    ? `${currentStage.eta}`          // minutes (initial render)
    : etaSeconds <= 0
      ? 'Here'                        // arrived
      : formatETA(etaSeconds);        // mm:ss countdown

  const showMMSS = etaSeconds != null && etaSeconds > 0;

  return (
    <View style={styles.container}>
      <Modal
        visible={pushNotify.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPushNotify((n) => ({ ...n, visible: false }))}
      >
        <Pressable
          style={styles.notifyBackdrop}
          onPress={() => setPushNotify((n) => ({ ...n, visible: false }))}
        >
          <View style={styles.notifyCard}>
            <Text style={styles.notifyTitle}>{pushNotify.title}</Text>
            <Text style={styles.notifyBody}>{pushNotify.body}</Text>
            <TouchableOpacity
              style={styles.notifyBtn}
              onPress={() => setPushNotify((n) => ({ ...n, visible: false }))}
            >
              <Text style={styles.notifyBtnTxt}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.mapContainer}>
        <TripMap
          pickup={pickupForMap}
          driver={validDriverCoords}
          style={[styles.liveMap, { height: height * 0.44 }]}
        />

        {!pickupForMap && (
          <View style={styles.fallbackDots} pointerEvents="none">
            <View style={styles.gridMini} />
            <Animated.View
              style={[
                styles.vehicleDotMini,
                {
                  left: `${currentStage.x * 100}%`,
                  top:  `${currentStage.y * 100}%`,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <View style={styles.vehicleInnerMini} />
            </Animated.View>
          </View>
        )}

        <View style={styles.mapHeader}>
          <TouchableOpacity style={styles.backMini} onPress={() => navigation.goBack()}>
            <Text style={styles.backMiniText}>{isRTL ? '→' : '←'}</Text>
          </TouchableOpacity>
          <View style={styles.livePillWrap}>
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
          <Text style={styles.vehiclePill}>{vehicleId}</Text>
        </View>
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <View style={[styles.statusHeader, isRTL && styles.rtlRow]}>

          {/* ── ETA Box — real countdown ── */}
          <View style={styles.etaBox}>
            <Text style={styles.etaNumber}>{etaDisplay}</Text>
            <Text style={styles.etaLabel}>
              {etaSeconds === 0
                ? '🟢'
                : showMMSS
                  ? 'mm:ss'
                  : 'min'}
            </Text>
          </View>

          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, isRTL && styles.textRight]}>
              {currentStage.label}
            </Text>
            <Text style={[styles.statusSub, isRTL && styles.textRight]}>
              {statusData?.currentLocation ||
                statusData?.current_location ||
                `${pickupLocation} ⇄ ${destinationTerminal}`}
            </Text>
          </View>
        </View>

        {isBarcodeStage && (
          <TouchableOpacity
            style={styles.barcodeBanner}
            onPress={() =>
              navigation.navigate('UserProfile', {
                bookingId,
                ...params,
                statusData,
                confirmation: {
                  ...confirmation,
                  barcodeData: statusData?.barcodeData || confirmation.barcodeData,
                  driverName:  statusData?.driverName  || confirmation.driverName,
                  driverPhone: statusData?.driverPhone || confirmation.driverPhone,
                },
              })
            }
          >
            <Text style={styles.barcodeBannerTitle}>Boarding barcode is ready</Text>
            <Text style={styles.barcodeBannerSub}>Open barcode with driver phone + QR</Text>
          </TouchableOpacity>
        )}

        <View style={styles.stageRail}>
          {STAGES.map((stage) => {
            const idxCurrent = STAGES.findIndex((item) => item.key === currentStage.key);
            const idxStage   = STAGES.findIndex((item) => item.key === stage.key);
            const complete   = idxStage <= idxCurrent;
            return (
              <View key={stage.key} style={styles.stageItem}>
                <View style={[styles.stageDot, complete && styles.stageDotDone]} />
                <Text style={[styles.stageLabel, complete && styles.stageLabelDone]}>
                  {stage.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${currentStage.progress * 100}%` }]} />
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.vehicleId}>{vehicleId}</Text>
          <Text style={styles.detailLabel}>Pickup</Text>
          <Text style={styles.detailValue}>{pickupLocation}</Text>
          <Text style={styles.detailLabel}>Destination</Text>
          <Text style={styles.detailValue}>{destinationTerminal}</Text>
          <Text style={styles.detailLabel}>Pickup Time</Text>
          <Text style={styles.detailValue}>{slotTime || '--'}</Text>
        </View>

        {normalizeStatus(statusData?.status) === 'dispatched' && (
          <Text style={styles.flowHint}>
            Flow: driver marks en route, then at pickup. Share this Vehicle ID with the driver so they can verify you and unlock the barcode.
          </Text>
        )}

        {statusData?.driverPhone ? (
          <View style={styles.driverCard}>
            <Text style={styles.detailLabel}>Driver</Text>
            <Text style={styles.detailValue}>{statusData.driverName || 'Assigned driver'}</Text>
            <Text style={styles.driverPhone}>{statusData.driverPhone}</Text>
          </View>
        ) : null}

        {isAtPickup && (
          <View style={styles.verificationContainer}>
            <Text style={styles.verificationLabel}>
              Driver reached you! Tell them your Vehicle ID (OTP) to unlock your barcode:
            </Text>
            <View style={styles.otpBox}>
              <Text style={styles.otpText}>{vehicleId}</Text>
            </View>
          </View>
        )}

        {isAtAirport && (
          <View style={styles.airportBanner}>
            <Text style={styles.airportBannerText}>Luggage approaching terminal check-in belts</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  mapContainer: { height: height * 0.46, position: 'relative', backgroundColor: COLORS.map },
  liveMap:      { width: '100%' },
  fallbackDots: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  gridMini:     { flex: 1, opacity: 0.06, backgroundColor: '#fff' },
  vehicleDotMini: {
    position: 'absolute', marginLeft: -14, marginTop: -14, width: 28, height: 28,
  },
  vehicleInnerMini: {
    flex: 1, borderRadius: 999,
    backgroundColor: COLORS.green,
    borderWidth: 2, borderColor: COLORS.text, opacity: 0.72,
  },
  mapHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    left: 18, right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backMini: {
    backgroundColor: '#0a0a0bcc',
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  backMiniText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  livePillWrap: {
    flexShrink: 0,
    backgroundColor: COLORS.green,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
  },
  livePillText: { color: '#08100a', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  vehiclePill: {
    color: COLORS.text, backgroundColor: '#0a0a0bcc',
    borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
    fontSize: 14, fontWeight: '900', overflow: 'hidden',
  },

  barcodeBanner: {
    backgroundColor: COLORS.greenDark, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.green,
    padding: 16, marginBottom: 14, gap: 4,
  },
  barcodeBannerTitle: { color: COLORS.green, fontWeight: '900', fontSize: 16 },
  barcodeBannerSub:   { color: COLORS.muted,  fontWeight: '700', fontSize: 13 },

  panel: {
    flex: 1, backgroundColor: COLORS.card,
    marginTop: -28, borderTopLeftRadius: 30, borderTopRightRadius: 30,
  },
  panelContent: { padding: 24, paddingBottom: 40 },

  statusHeader: {
    flexDirection: 'row', gap: 16,
    alignItems: 'center', marginBottom: 18,
  },
  rtlRow: { flexDirection: 'row-reverse' },

  etaBox: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: COLORS.green,
    alignItems: 'center', justifyContent: 'center',
  },
  etaNumber: { color: '#08100A', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  etaLabel:  { color: '#0b240f', fontSize: 11, fontWeight: '900' },

  statusCopy:  { flex: 1 },
  statusTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statusSub:   { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  textRight:   { textAlign: 'right' },

  stageRail: { gap: 10, marginBottom: 16 },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageDot:  { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3a404a' },
  stageDotDone: { backgroundColor: COLORS.green },
  stageLabel:    { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  stageLabelDone: { color: COLORS.text },

  progressBar: {
    height: 7, borderRadius: 999,
    backgroundColor: '#2e343d', overflow: 'hidden', marginBottom: 18,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.green },

  detailsCard: {
    backgroundColor: '#101215', borderRadius: 22,
    padding: 18, borderWidth: 1, borderColor: COLORS.line,
  },
  driverCard: {
    marginTop: 12, backgroundColor: '#101215',
    borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: COLORS.line,
  },
  driverPhone: { marginTop: 6, fontSize: 18, fontWeight: '900', color: COLORS.green },
  vehicleId:   { color: COLORS.green, fontSize: 34, fontWeight: '900', marginBottom: 8 },
  detailLabel: {
    color: COLORS.muted, fontSize: 12, fontWeight: '900',
    textTransform: 'uppercase', marginTop: 10,
  },
  detailValue: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginTop: 4 },

  airportBanner: {
    backgroundColor: COLORS.greenDark,
    borderWidth: 1, borderColor: COLORS.green,
    borderRadius: 18, padding: 18,
    alignItems: 'center', marginTop: 18,
  },
  airportBannerText: { color: COLORS.green, fontWeight: '900', fontSize: 18 },

  verificationContainer: {
    backgroundColor: '#101215', borderRadius: 22,
    padding: 18, borderWidth: 1, borderColor: COLORS.line, marginTop: 18,
  },
  verificationLabel: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginBottom: 12 },
  otpBox: {
    backgroundColor: '#0A0A0B', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: '#2A2F36',
  },
  otpText: { fontSize: 32, fontWeight: '900', color: COLORS.green, letterSpacing: 2 },

  flowHint: {
    marginTop: 12, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.line,
    color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: '700',
  },
  notifyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 28,
  },
  notifyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 22,
    borderWidth: 2,
    borderColor: COLORS.green,
  },
  notifyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900' },
  notifyBody: { color: COLORS.muted, marginTop: 8, lineHeight: 20 },
  notifyBtn: {
    marginTop: 16,
    backgroundColor: COLORS.green,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  notifyBtnTxt: { color: COLORS.greenDark, fontWeight: '900' },
});

export default LiveTrackingScreen;
