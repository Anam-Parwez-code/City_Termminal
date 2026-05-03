import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';

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
  { key: 'en_route', label: 'En Route', eta: 12, progress: 0.32, x: 0.34, y: 0.62 },
  { key: 'arrived_pickup', label: 'Arrived at Pickup', eta: 0, progress: 0.5, x: 0.48, y: 0.54 },
  { key: 'en_route_airport', label: 'En Route to Airport', eta: 10, progress: 0.76, x: 0.65, y: 0.42 },
  { key: 'at_airport', label: 'At Airport', eta: 0, progress: 1, x: 0.8, y: 0.3 },
];

const normalizeStatus = (value) => {
  const raw = String(value || '').toLowerCase().replace(/\s+/g, '_');
  if (raw.includes('airport') && (raw.includes('arrived') || raw.includes('at_') || raw.includes('reached'))) return 'at_airport';
  if (raw.includes('en_route_airport') || raw.includes('heading_to_airport') || raw.includes('picked_up')) return 'en_route_airport';
  if (raw.includes('pickup') && (raw.includes('arrived') || raw.includes('reached'))) return 'arrived_pickup';
  if (raw.includes('en_route')) return 'en_route';
  return raw || 'dispatched';
};

const stageForStatus = (status) => STAGES.find((stage) => stage.key === normalizeStatus(status)) || STAGES[0];

const LiveTrackingScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
  const confirmation = params.confirmation || {};
  const [statusData, setStatusData] = useState(null);
  const [localStageIndex, setLocalStageIndex] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const vehicleId = statusData?.vehicleId || statusData?.vehicle_id || confirmation.vehicleId || confirmation.vehicleNumber || 'CT-102';
  const currentStage = useMemo(
    () => stageForStatus(statusData?.status || STAGES[localStageIndex]?.key),
    [statusData, localStageIndex]
  );
  const eta = typeof statusData?.etaMinutes === 'number' ? statusData.etaMinutes : currentStage.eta;
  const pickupLocation = statusData?.pickupLocation || statusData?.pickup_location || confirmation.locationName || 'Pickup';
  const destinationTerminal = statusData?.destinationTerminal || statusData?.destination_terminal || confirmation.destinationTerminal || 'DXB';
  const isAtPickup = currentStage.key === 'arrived_pickup';
  const isAtAirport = currentStage.key === 'at_airport';

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      if (!bookingId) return;
      try {
        const result = await apiService.getOTPStatus(bookingId);
        if (mounted) setStatusData(result.status || result.assignment || null);
      } catch (_err) {
        // The local stage simulator keeps the UI useful if the API is offline.
      }
    };
    fetchStatus();
    const pollTimer = setInterval(fetchStatus, 10000);
    const simTimer = setInterval(() => {
      setLocalStageIndex((prev) => Math.min(prev + 1, STAGES.length - 1));
    }, 10000);
    return () => {
      mounted = false;
      clearInterval(pollTimer);
      clearInterval(simTimer);
    };
  }, [bookingId]);

  const goToBarcode = () => {
    navigation.navigate('Barcode', {
      ...params,
      statusData,
      confirmation: {
        ...confirmation,
        vehicleId,
        vehicleNumber: vehicleId,
        locationName: pickupLocation,
        destinationTerminal,
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <View style={styles.mapBg}>
          <View style={styles.gridLineA} />
          <View style={styles.gridLineB} />
          <View style={styles.roadMain} />
          <View style={styles.roadSecondary} />
          <View style={[styles.marker, styles.pickupMarker]}>
            <Text style={styles.markerText}>PICKUP</Text>
          </View>
          <View style={[styles.marker, styles.airportMarker]}>
            <Text style={styles.markerText}>AIRPORT</Text>
          </View>
          <View style={styles.routeLine} />
          <Animated.View
            style={[
              styles.vehicleDot,
              {
                left: `${currentStage.x * 100}%`,
                top: `${currentStage.y * 100}%`,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <View style={styles.vehicleInner} />
          </Animated.View>
        </View>
        <View style={styles.mapHeader}>
          <Text style={styles.livePill}>LIVE</Text>
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
              {statusData?.currentLocation || statusData?.current_location || `Moving from ${pickupLocation} to ${destinationTerminal}`}
            </Text>
          </View>
        </View>

        <View style={styles.stageRail}>
          {STAGES.map((stage) => {
            const complete = STAGES.findIndex((item) => item.key === currentStage.key) >= STAGES.findIndex((item) => item.key === stage.key);
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

        {isAtPickup && (
          <TouchableOpacity style={styles.primaryButton} onPress={goToBarcode}>
            <Text style={styles.primaryButtonText}>{isRTL ? '<- Show Barcode' : 'Show Barcode ->'}</Text>
          </TouchableOpacity>
        )}

        {isAtAirport && (
          <View style={styles.airportBanner}>
            <Text style={styles.airportBannerText}>Luggage at Airport</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapContainer: { height: height * 0.46, position: 'relative' },
  mapBg: { flex: 1, backgroundColor: COLORS.map, overflow: 'hidden' },
  gridLineA: { position: 'absolute', width: '130%', height: 1, backgroundColor: '#252A31', top: '32%', left: '-12%', transform: [{ rotate: '-11deg' }] },
  gridLineB: { position: 'absolute', width: '120%', height: 1, backgroundColor: '#252A31', top: '64%', left: '-8%', transform: [{ rotate: '15deg' }] },
  roadMain: { position: 'absolute', width: '110%', height: 7, backgroundColor: '#2C323B', left: '-8%', top: '52%', transform: [{ rotate: '-22deg' }], borderRadius: 999 },
  roadSecondary: { position: 'absolute', width: 6, height: '100%', backgroundColor: '#252A31', left: '63%', top: 0, transform: [{ rotate: '8deg' }] },
  routeLine: { position: 'absolute', width: '65%', height: 5, backgroundColor: COLORS.green, left: '18%', top: '54%', transform: [{ rotate: '-25deg' }], borderRadius: 999 },
  marker: { position: 'absolute', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.line },
  pickupMarker: { left: '10%', top: '68%' },
  airportMarker: { right: '10%', top: '25%' },
  markerText: { color: COLORS.text, fontSize: 10, fontWeight: '900' },
  vehicleDot: { position: 'absolute', width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: 17, backgroundColor: 'rgba(71,211,97,0.25)', alignItems: 'center', justifyContent: 'center' },
  vehicleInner: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.green, borderWidth: 3, borderColor: COLORS.text },
  mapHeader: { position: 'absolute', top: 52, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between' },
  livePill: { color: '#08100A', backgroundColor: COLORS.green, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  vehiclePill: { color: COLORS.text, backgroundColor: '#0A0A0BCC', borderRadius: 999, paddingHorizontal: 15, paddingVertical: 7, fontSize: 15, fontWeight: '900', overflow: 'hidden' },
  panel: { flex: 1, backgroundColor: COLORS.card, marginTop: -28, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  panelContent: { padding: 24, paddingBottom: 40 },
  statusHeader: { flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 18 },
  rtlRow: { flexDirection: 'row-reverse' },
  etaBox: { width: 76, height: 76, borderRadius: 22, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  etaNumber: { color: '#08100A', fontSize: 30, fontWeight: '900' },
  etaLabel: { color: '#0B240F', fontSize: 12, fontWeight: '900' },
  statusCopy: { flex: 1 },
  statusTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  statusSub: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  stageRail: { gap: 10, marginBottom: 16 },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3A404A' },
  stageDotDone: { backgroundColor: COLORS.green },
  stageLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  stageLabelDone: { color: COLORS.text },
  progressBar: { height: 7, borderRadius: 999, backgroundColor: '#2E343D', overflow: 'hidden', marginBottom: 18 },
  progressFill: { height: '100%', backgroundColor: COLORS.green },
  detailsCard: { backgroundColor: '#101215', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: COLORS.line },
  vehicleId: { color: COLORS.green, fontSize: 34, fontWeight: '900', marginBottom: 8 },
  detailLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 10 },
  detailValue: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  primaryButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 18 },
  primaryButtonText: { color: '#08100A', fontWeight: '900', fontSize: 16 },
  airportBanner: { backgroundColor: COLORS.greenDark, borderWidth: 1, borderColor: COLORS.green, borderRadius: 18, padding: 18, alignItems: 'center', marginTop: 18 },
  airportBannerText: { color: COLORS.green, fontWeight: '900', fontSize: 18 },
  textRight: { textAlign: 'right' },
});

export default LiveTrackingScreen;
