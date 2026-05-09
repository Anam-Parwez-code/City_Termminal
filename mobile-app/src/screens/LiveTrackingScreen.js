import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import TripMap from '../components/TripMap';
import apiService, { getSocketBaseUrl } from '../services/apiService';

const { height } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0B',
  map: '#15171B',
  card: '#191C20',
  line: '#2A2F36',
  green: '#47D361',
  greenDark: '#163A1C',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const STAGES = [
  { key: 'dispatched', label: 'Dispatched', eta: 18, progress: 0.08, x: 0.18, y: 0.72 },
  { key: 'en_route', label: 'En Route', eta: 12, progress: 0.26, x: 0.34, y: 0.62 },
  { key: 'arrived_pickup', label: 'At Pickup Zone', eta: 0, progress: 0.42, x: 0.48, y: 0.54 },
  { key: 'barcode_issued', label: 'Barcode ready', eta: 0, progress: 0.54, x: 0.56, y: 0.5 },
  { key: 'en_route_airport', label: 'En Route to Airport', eta: 10, progress: 0.78, x: 0.68, y: 0.4 },
  { key: 'at_airport', label: 'Arrived — Airport', eta: 0, progress: 1, x: 0.82, y: 0.3 },
];

const normalizeStatus = (value) => {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!raw || raw === 'undefined') return 'dispatched';
  if (raw.includes('barcode')) return 'barcode_issued';

  // Terminal arrival — strict (never treat "en_route_airport" as landed)
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

const LiveTrackingScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
  const confirmation = params.confirmation || {};

  const [statusData, setStatusData] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arrivedPing = useRef(false);

  const vehicleId =
    statusData?.vehicleId || statusData?.vehicle_id || confirmation.vehicleId || confirmation.vehicleNumber || '—';

  const currentStage = useMemo(
    () => stageForStatus(statusData?.status),
    [statusData?.status],
  );
  const eta =
    typeof statusData?.etaMinutes === 'number' ? statusData.etaMinutes : currentStage.eta;
  const pickupLocation =
    statusData?.pickupLocation ||
    statusData?.pickup_location ||
    confirmation.locationName ||
    'Pickup';

  const destinationTerminal =
    statusData?.destinationTerminal ||
    statusData?.destination_terminal ||
    confirmation.destinationTerminal ||
    'DXB';

  const pickupCoords = useMemo(() => {
    const pl = params.pickupLocation || {};
    if (pl.lat != null && pl.lng != null && Number.isFinite(+pl.lat) && Number.isFinite(+pl.lng)) {
      return { lat: +pl.lat, lng: +pl.lng };
    }
    return null;
  }, [params.pickupLocation]);

  const pickupForMap = pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : null;

  const rawDriver =
    driverCoords ||
    (statusData?.driverLat != null && statusData?.driverLng != null
      ? {
          lat: Number(statusData.driverLat),
          lng: Number(statusData.driverLng),
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

  const isAtPickup = currentStage.key === 'arrived_pickup';
  const isBarcodeStage = normalizeStatus(statusData?.status) === 'barcode_issued';
  const isAtAirport = currentStage.key === 'at_airport';

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.28, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    let mounted = true;

    const fetchStatus = async () => {
      if (!bookingId) return;
      try {
        const result = await apiService.getOTPStatus(bookingId);
        const next = result.status || result.assignment || null;
        if (mounted && next) {
          setStatusData(next);
          const lat =
            next.driverLat != null
              ? Number(next.driverLat)
              : next.driver_lat != null
                ? Number(next.driver_lat)
                : null;
          const lng =
            next.driverLng != null
              ? Number(next.driverLng)
              : next.driver_lng != null
                ? Number(next.driver_lng)
                : null;
          if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            setDriverCoords({ lat, lng });
          }
        }
      } catch (_err) {
        //
      }
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
        });

        socket.on('status_update', (payload = {}) => {
          const pb = String(payload.bookingId || payload.booking_id || '').toUpperCase();
          const my = String(bookingId || '').toUpperCase();
          if (pb && pb !== my) return;
          setStatusData((prev) => ({
            ...(prev || {}),
            status: payload.status || prev?.status,
            barcodeData: payload.barcodeData || payload.barcode_data || prev?.barcodeData,
            barcode_data: payload.barcode_data || payload.barcodeData || prev?.barcode_data,
            currentLocation: payload.currentLocation || payload.current_location || prev?.currentLocation,
            current_location: payload.current_location || payload.currentLocation || prev?.current_location,
            vehicleId: payload.vehicleId || payload.vehicle_number || prev?.vehicleId,
            vehicle_id: payload.vehicle_id || payload.vehicleId || payload.vehicle_number || prev?.vehicle_id,
            driverName: payload.driverName || payload.driver_name || payload.driver || prev?.driverName,
            driverPhone: payload.driverPhone || payload.driver_phone || prev?.driverPhone,
          }));
          fetchStatus();
        });
      }
    } catch (_e) {
      //
    }

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      socket?.disconnect?.();
    };
  }, [bookingId]);

  useEffect(() => {
    if (!isAtAirport || arrivedPing.current) return;

    arrivedPing.current = true;
    Alert.alert(
      Platform.OS === 'web' ? 'Arrived — Airport' : 'Arrived at airport',
      'Driver has reached the terminal. Your baggage team will offload shortly.',
      [
        {
          text: 'OK',
          onPress: () =>
            navigation.replace('Arrived', {
              ...params,
              statusData,
              confirmation: {
                ...confirmation,
                vehicleId,
                vehicleNumber: vehicleId,
              },
            }),
        },
      ],
      { cancelable: true },
    );
  }, [
    confirmation,
    isAtAirport,
    navigation,
    params,
    statusData,
    vehicleId,
  ]);



  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <TripMap
          pickup={pickupForMap}
          driver={validDriverCoords}
          style={[styles.liveMap, { height: height * 0.44 }]}
        />

        {/* schematic overlay fallback when coords missing */}
        {!pickupForMap && (
          <View style={styles.fallbackDots} pointerEvents="none">
            <View style={styles.gridMini} />
            <Animated.View
              style={[
                styles.vehicleDotMini,
                {
                  left: `${currentStage.x * 100}%`,
                  top: `${currentStage.y * 100}%`,
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
          <View style={styles.etaBox}>
            <Text style={styles.etaNumber}>{eta}</Text>
            <Text style={styles.etaLabel}>min</Text>
          </View>
          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, isRTL && styles.textRight]}>{currentStage.label}</Text>
            <Text style={[styles.statusSub, isRTL && styles.textRight]}>
              {statusData?.currentLocation ||
                statusData?.current_location ||
                `Van ${pickupLocation} ⇄ ${destinationTerminal}`}
            </Text>
          </View>
        </View>

        {isBarcodeStage && (
          <TouchableOpacity
            style={styles.barcodeBanner}
            onPress={() =>
              navigation.navigate('UserProfile', {
                 bookingId: bookingId,
                  
                ...params,
                statusData,
                confirmation: {
                  ...confirmation,
                  barcodeData: statusData?.barcodeData || confirmation.barcodeData,
                  driverName: statusData?.driverName || confirmation.driverName,
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
            const idxStage = STAGES.findIndex((item) => item.key === stage.key);
            const complete = idxStage <= idxCurrent;
            return (
              <View key={stage.key} style={styles.stageItem}>
                <View style={[styles.stageDot, complete && styles.stageDotDone]} />
                <Text style={[styles.stageLabel, complete && styles.stageLabelDone]}>{stage.label}</Text>
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
            <Text style={styles.verificationLabel}>Driver reached you! Tell them your Vehicle ID (OTP) to unlock your barcode:</Text>
            <View style={{ backgroundColor: '#0A0A0B', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#2A2F36' }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#47D361', letterSpacing: 2 }}>{vehicleId}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapContainer: { height: height * 0.46, position: 'relative', backgroundColor: COLORS.map },
  liveMap: { width: '100%' },
  fallbackDots: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  gridMini: { flex: 1, opacity: 0.06, backgroundColor: '#fff' },
  vehicleDotMini: { position: 'absolute', marginLeft: -14, marginTop: -14, width: 28, height: 28 },
  vehicleInnerMini: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    borderWidth: 2,
    borderColor: COLORS.text,
    opacity: 0.72,
  },
  mapHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 40,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backMini: {
    backgroundColor: '#0a0a0bcc',
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMiniText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  livePillWrap: {
    flexShrink: 0,
    backgroundColor: COLORS.green,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  livePillText: { color: '#08100a', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  vehiclePill: {
    color: COLORS.text,
    backgroundColor: '#0a0a0bcc',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    fontSize: 14,
    fontWeight: '900',
    overflow: 'hidden',
  },
  barcodeBanner: {
    backgroundColor: COLORS.greenDark,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.green,
    padding: 16,
    marginBottom: 14,
    gap: 4,
  },
  barcodeBannerTitle: { color: COLORS.green, fontWeight: '900', fontSize: 16 },
  barcodeBannerSub: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  panel: {
    flex: 1,
    backgroundColor: COLORS.card,
    marginTop: -28,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  panelContent: { padding: 24, paddingBottom: 40 },
  statusHeader: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 18 },
  rtlRow: { flexDirection: 'row-reverse' },
  etaBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaNumber: { color: '#08100A', fontSize: 30, fontWeight: '900' },
  etaLabel: { color: '#0b240f', fontSize: 12, fontWeight: '900' },
  statusCopy: { flex: 1 },
  statusTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statusSub: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  stageRail: { gap: 10, marginBottom: 16 },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3a404a' },
  stageDotDone: { backgroundColor: COLORS.green },
  stageLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  stageLabelDone: { color: COLORS.text },
  progressBar: {
    height: 7,
    borderRadius: 999,
    backgroundColor: '#2e343d',
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.green },
  detailsCard: {
    backgroundColor: '#101215',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  driverCard: {
    marginTop: 12,
    backgroundColor: '#101215',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  driverPhone: { marginTop: 6, fontSize: 18, fontWeight: '900', color: COLORS.green },
  vehicleId: {
    color: COLORS.green,
    fontSize: 34,
    fontWeight: '900',
    marginBottom: 8,
  },
  detailLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 10 },
  detailValue: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  airportBanner: {
    backgroundColor: COLORS.greenDark,
    borderWidth: 1,
    borderColor: COLORS.green,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginTop: 18,
  },
  airportBannerText: { color: COLORS.green, fontWeight: '900', fontSize: 18 },
  textRight: { textAlign: 'right' },
  verificationContainer: {
    backgroundColor: '#101215',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    marginTop: 18,
  },
  flowHint: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#101215',
    borderWidth: 1,
    borderColor: COLORS.line,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },

  verificationLabel: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginBottom: 12 },
  verificationInputRow: { flexDirection: 'row', gap: 10 },
  verificationInput: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 14,
    color: COLORS.text,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
  },
  verifyButton: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonText: { color: '#08100A', fontWeight: '900', fontSize: 15 },
  disabledButton: { opacity: 0.45 },
});

export default LiveTrackingScreen;
