// ============================================================
// FILE: src/screens/LiveTrackingScreen.js
// SCREEN 8 — LIVE VEHICLE TRACKING
// ============================================================
// Vehicle real-time map pe move karta dikhega
// WebSocket se live updates aayenge
// ETA countdown dikhega
// Driver details dikhenge
// Airport pahunch jaaye toh Screen 9 pe jaao
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient';

const { width, height } = Dimensions.get('window');

// ============================================================
// SIMULATED VEHICLE POSITIONS
// Dubai ke coordinates — vehicle move karta dikhega
// Real app mein WebSocket se aayega
// ============================================================
const ROUTE_POINTS = [
  { lat: 25.1972, lng: 55.2744, label: 'Mall of Emirates' },
  { lat: 25.1980, lng: 55.2700, label: 'Sheikh Zayed Road' },
  { lat: 25.1990, lng: 55.2650, label: 'Approaching Highway' },
  { lat: 25.2000, lng: 55.2600, label: 'On Highway' },
  { lat: 25.2010, lng: 55.2550, label: 'Near Airport' },
  { lat: 25.2050, lng: 55.2500, label: 'Airport Road' },
  { lat: 25.2523, lng: 55.3657, label: 'Dubai Airport' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
const LiveTrackingScreen = ({ navigation, route }) => {
  const { t } = useTranslation();

  const {
    bookingId,
    airline,
    bookingData,
    confirmation,
  } = route.params;

  // ── STATES ──────────────────────────────────────────────
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [eta, setEta] = useState(25); // minutes
  const [status, setStatus] = useState('En Route');
  const [vehiclePos, setVehiclePos] = useState({ x: 0.2, y: 0.7 }); // relative position on map
  const [liveVehicle, setLiveVehicle] = useState(null);

  // Animation for pulsing dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── PULSE ANIMATION ──────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── REALTIME VEHICLE UPDATES (Supabase Realtime) ─────────
  // Fallback simulation if realtime is not configured.
  useEffect(() => {
    if (supabase && bookingId) {
      const channel = supabase
        .channel(`vehicle-tracking-${bookingId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vehicle_tracking',
            filter: `booking_id=eq.${bookingId}`,
          },
          (payload) => {
            const row = payload.new || payload.old;
            if (!row) return;
            setLiveVehicle(row);
            if (typeof row.eta_minutes === 'number') setEta(Math.max(0, row.eta_minutes));
            if (row.status) setStatus(row.status);

            // Expected normalized map coordinates from backend table (0..1)
            if (typeof row.map_x === 'number' && typeof row.map_y === 'number') {
              setVehiclePos({ x: row.map_x, y: row.map_y });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const interval = setInterval(() => {
      setCurrentPointIndex((prev) => {
        const next = prev + 1;
        setEta((e) => Math.max(0, e - 3));
        const progress = next / (ROUTE_POINTS.length - 1);
        setVehiclePos({
          x: 0.1 + progress * 0.7,
          y: 0.7 - progress * 0.4,
        });

        if (next >= ROUTE_POINTS.length - 1) {
          clearInterval(interval);
          setStatus('Arrived at Airport');
          setEta(0);
          setTimeout(() => {
            navigation.replace('Arrived', {
              bookingId,
              airline,
              bookingData,
              confirmation,
            });
          }, 2000);
          return prev;
        }

        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [bookingId, airline, bookingData, confirmation, navigation]);

  // Current location
  const currentPoint = ROUTE_POINTS[currentPointIndex];
  const isArrived = eta === 0;

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    <View style={styles.container}>

      {/* ── MAP AREA (Simulated) ── */}
      <View style={styles.mapContainer}>

        {/* Map background */}
        <View style={styles.mapBg}>

          {/* Road lines — simulated */}
          <View style={styles.road1} />
          <View style={styles.road2} />
          <View style={styles.road3} />

          {/* Destination marker — Airport */}
          <View style={[styles.destMarker, { left: '78%', top: '28%' }]}>
            <Text style={styles.destIcon}>✈️</Text>
            <Text style={styles.destLabel}>DXB</Text>
          </View>

          {/* Origin marker — Pickup */}
          <View style={[styles.originMarker, { left: '12%', top: '68%' }]}>
            <Text style={styles.originIcon}>📍</Text>
          </View>

          {/* Route line */}
          <View style={styles.routeLine} />

          {/* Vehicle dot — animated */}
          <Animated.View
            style={[
              styles.vehicleDotContainer,
              {
                left: `${vehiclePos.x * 100}%`,
                top: `${vehiclePos.y * 100}%`,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <View style={styles.vehicleDotOuter}>
              <View style={styles.vehicleDotInner} />
            </View>
          </Animated.View>

          {/* Current location label */}
          <View style={[styles.locationLabel, { left: `${vehiclePos.x * 100 - 10}%`, top: `${vehiclePos.y * 100 - 8}%` }]}>
            <Text style={styles.locationLabelText}>🚗</Text>
          </View>

        </View>

        {/* Map header overlay */}
        <View style={styles.mapHeader}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('liveTracking.live')}</Text>
          </View>
          <Text style={styles.mapTitle}>{t('liveTracking.title')}</Text>
        </View>

      </View>

      {/* ── BOTTOM PANEL ── */}
      <View style={styles.bottomPanel}>

        {/* ETA + Status */}
        <View style={styles.etaRow}>
          <View style={styles.etaBox}>
            <Text style={styles.etaNumber}>{eta}</Text>
            <Text style={styles.etaLabel}>{t('liveTracking.min')}</Text>
          </View>
          <View style={styles.etaInfo}>
            <Text style={[
              styles.statusText,
              isArrived && styles.statusArrived,
            ]}>
              {isArrived ? `✅ ${t('liveTracking.arrived')}` : `🚗 ${t('liveTracking.enRoute')}`}
            </Text>
            <Text style={styles.currentLocation}>
              📍 {liveVehicle?.current_location || currentPoint?.label || t('liveTracking.locationFallback')}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Vehicle + Driver info */}
        <View style={styles.vehicleInfo}>

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🚗</Text>
            <View>
              <Text style={styles.infoLabel}>{t('liveTracking.vehicle')}</Text>
              <Text style={styles.infoValue}>
                {confirmation?.vehicleNumber || 'CT-456'}
                {liveVehicle?.vehicle_number ? ` (${liveVehicle.vehicle_number})` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📍</Text>
            <View>
              <Text style={styles.infoLabel}>{t('liveTracking.pickup')}</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {confirmation?.locationName || 'Mall of Emirates'}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>✈️</Text>
            <View>
              <Text style={styles.infoLabel}>{t('liveTracking.flight')}</Text>
              <Text style={styles.infoValue}>
                {bookingData?.flightNumber}
              </Text>
            </View>
          </View>

        </View>

        <View style={styles.divider} />

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>{t('liveTracking.journeyProgress')}</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(currentPointIndex / (ROUTE_POINTS.length - 1)) * 100}%`,
                },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressStart}>
              {confirmation?.locationName || 'Pickup'}
            </Text>
            <Text style={styles.progressEnd}>Dubai Airport ✈️</Text>
          </View>
        </View>

        {/* Help button */}
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => Alert.alert(
            t('liveTracking.needHelp'),
            t('liveTracking.helpMessage'),
            [{ text: t('liveTracking.ok') }]
          )}
        >
          <Text style={styles.helpButtonText}>{t('liveTracking.helpButton')}</Text>
        </TouchableOpacity>

      </View>

    </View>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F10' },

  // Map
  mapContainer: { height: height * 0.45, position: 'relative' },

  mapBg: {
    flex: 1,
    backgroundColor: '#16181D',
    position: 'relative',
    overflow: 'hidden',
  },

  // Simulated roads
  road1: {
    position: 'absolute',
    width: '100%', height: 3,
    backgroundColor: '#FFFFFF',
    top: '50%', opacity: 0.6,
    transform: [{ rotate: '-15deg' }],
  },

  road2: {
    position: 'absolute',
    width: '100%', height: 2,
    backgroundColor: '#FFFFFF',
    top: '30%', opacity: 0.4,
    transform: [{ rotate: '-8deg' }],
  },

  road3: {
    position: 'absolute',
    height: '100%', width: 3,
    backgroundColor: '#FFFFFF',
    left: '60%', opacity: 0.4,
  },

  // Route line
  routeLine: {
    position: 'absolute',
    width: '65%', height: 3,
    backgroundColor: '#EF3340',
    left: '13%', top: '52%',
    opacity: 0.8,
    transform: [{ rotate: '-25deg' }],
  },

  // Markers
  destMarker: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#191A1E',
    borderRadius: 8,
    padding: 6,
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  destIcon: { fontSize: 20 },
  destLabel: { fontSize: 10, fontWeight: '700', color: '#F8FAFC' },

  originMarker: {
    position: 'absolute',
    alignItems: 'center',
  },
  originIcon: { fontSize: 24 },

  // Vehicle dot
  vehicleDotContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  vehicleDotOuter: {
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 51, 64, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  vehicleDotInner: {
    width: 14, height: 14,
    borderRadius: 7,
    backgroundColor: '#EF3340',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  locationLabel: {
    position: 'absolute',
  },

  locationLabelText: { fontSize: 20 },

  // Map header
  mapHeader: {
    position: 'absolute',
    top: 50, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF3340',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },

  liveDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },

  liveText: {
    fontSize: 11, fontWeight: '800',
    color: '#FFFFFF', letterSpacing: 1,
  },

  mapTitle: {
    fontSize: 16, fontWeight: '700',
    color: '#F8FAFC',
    backgroundColor: 'rgba(25,26,30,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },

  // Bottom panel
  bottomPanel: {
    flex: 1,
    backgroundColor: '#191A1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -24,
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },

  // ETA
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },

  etaBox: {
    backgroundColor: '#EF3340',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    minWidth: 64,
  },

  etaNumber: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  etaLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

  etaInfo: { flex: 1 },

  statusText: { fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginBottom: 4 },
  statusArrived: { color: '#7EE08D' },

  currentLocation: { fontSize: 13, color: '#A7B0C0' },

  divider: { height: 0.5, backgroundColor: '#2E3138', marginVertical: 16 },

  // Vehicle info
  vehicleInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  infoItem: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', gap: 8,
  },

  infoDivider: { width: 0.5, backgroundColor: '#2E3138', marginHorizontal: 8 },

  infoIcon: { fontSize: 18 },
  infoLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#F8FAFC' },

  // Progress
  progressSection: { gap: 8 },

  progressLabel: { fontSize: 13, fontWeight: '600', color: '#E2E8F0' },

  progressBar: {
    height: 6, backgroundColor: '#2E3138',
    borderRadius: 3, overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#009A44',
    borderRadius: 3,
  },

  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  progressStart: { fontSize: 11, color: '#94A3B8' },
  progressEnd: { fontSize: 11, color: '#94A3B8' },

  // Help button
  helpButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E3138',
  },

  helpButtonText: { fontSize: 13, color: '#CBD5E1' },
});

export default LiveTrackingScreen;