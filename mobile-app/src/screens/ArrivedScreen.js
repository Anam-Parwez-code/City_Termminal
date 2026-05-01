// ============================================================
// FILE: src/screens/ArrivedScreen.js
// SCREEN 9 — ARRIVED AT AIRPORT!
// ============================================================
// Vehicle airport pahunch gaya!
// Gate number dikhao
// Terminal info dikhao
// Success animation
// New booking ka option
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';

const { width } = Dimensions.get('window');

const ArrivedScreen = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  const {
    bookingId,
    airline,
    bookingData,
    confirmation,
  } = route.params || {};
  const [liveData, setLiveData] = useState(null);

  // ── ANIMATIONS ───────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Checkmark pop in animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const fetchLiveData = async () => {
      if (!bookingId) return;
      try {
        const res = await apiService.getLiveTripStatus({ bookingId });
        setLiveData(res.live || null);
      } catch (_err) {
        // Keep UI resilient: if live endpoint fails, fallback to route params.
        setLiveData(null);
      }
    };
    fetchLiveData();
  }, [bookingId]);

  const liveFlight = liveData?.flight || {};
  const liveVehicle = liveData?.vehicle || {};
  const liveBooking = liveData?.booking || {};
  const currentGate = liveFlight.gate || liveBooking.gate || `A${Math.floor(Math.random() * 30) + 1}`;
  const terminalName = liveFlight.terminal || liveBooking.terminal || 'Terminal 3';

  // ── NEW BOOKING ──────────────────────────────────────────
  const handleNewBooking = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'LanguageSelect' }],
    });
  };

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >

      {/* ── SUCCESS ANIMATION ── */}
      <View style={styles.successArea}>

        {/* Animated checkmark */}
        <Animated.View style={[
          styles.checkCircle,
          { transform: [{ scale: scaleAnim }] }
        ]}>
          <Text style={styles.checkIcon}>✓</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
          <Text style={styles.arrivedTitle}>{t('arrived.title')}</Text>
          <Text style={styles.arrivedSubtitle}>
            {t('arrived.subtitle')}
          </Text>
        </Animated.View>

      </View>

      {/* ── FLIGHT INFO CARD ── */}
      <Animated.View style={[styles.flightCard, { opacity: fadeAnim }]}>

        <View style={styles.flightHeader}>
          <Text style={styles.flightFlag}>{airline?.flag || '✈️'}</Text>
          <View>
            <Text style={styles.flightNumber}>{bookingData?.flightNumber}</Text>
            <Text style={styles.flightDest}>{isRTL ? `← ${bookingData?.destination}` : `→ ${bookingData?.destination}`}</Text>
          </View>
          <View style={styles.onTimeBadge}>
            <Text style={styles.onTimeText}>{t('arrived.onTime')}</Text>
          </View>
        </View>

        <View style={styles.flightDivider} />

        <View style={styles.flightDetails}>
          <View style={styles.flightDetail}>
            <Text style={styles.detailLabel}>{t('arrived.terminal')}</Text>
            <Text style={styles.detailValue}>{terminalName}</Text>
          </View>
          <View style={styles.flightDetail}>
            <Text style={styles.detailLabel}>{t('arrived.gate')}</Text>
            <Text style={styles.detailValue}>{currentGate}</Text>
          </View>
          <View style={styles.flightDetail}>
            <Text style={styles.detailLabel}>{t('arrived.departure')}</Text>
            <Text style={styles.detailValue}>{bookingData?.departureTime || '--'}</Text>
          </View>
        </View>

      </Animated.View>

      {/* ── NEXT STEPS ── */}
      <Animated.View style={[styles.stepsSection, { opacity: fadeAnim }]}>

        <Text style={styles.stepsTitle}>{t('arrived.whatsNext')}</Text>

        {[
          { icon: '🛂', step: t('arrived.immigration'), desc: t('arrived.immigrationDesc') },
          { icon: '🔐', step: t('arrived.security'), desc: t('arrived.securityDesc') },
          { icon: '🛍️', step: t('arrived.dutyFree'), desc: t('arrived.dutyFreeDesc') },
          { icon: '✈️', step: t('arrived.gateStep'), desc: t('arrived.gateDesc') },
        ].map((item, index) => (
          <View key={index} style={styles.stepItem}>
            <View style={styles.stepIconBox}>
              <Text style={styles.stepIcon}>{item.icon}</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>{item.step}</Text>
              <Text style={styles.stepDesc}>{item.desc}</Text>
            </View>
            <Text style={styles.stepArrow}>{isRTL ? '‹' : '›'}</Text>
          </View>
        ))}

      </Animated.View>

      {/* ── VEHICLE SUMMARY ── */}
      <Animated.View style={[styles.vehicleCard, { opacity: fadeAnim }]}>
        <Text style={styles.vehicleCardTitle}>{t('arrived.tripSummary')}</Text>
        <View style={styles.vehicleRow}>
          <Text style={styles.vehicleLabel}>{t('arrived.bookingId')}</Text>
          <Text style={styles.vehicleValue}>{bookingId}</Text>
        </View>
        <View style={styles.vehicleRow}>
          <Text style={styles.vehicleLabel}>{t('arrived.vehicle')}</Text>
          <Text style={styles.vehicleValue}>{liveVehicle?.vehicle_number || confirmation?.vehicleNumber || '--'}</Text>
        </View>
        <View style={styles.vehicleRow}>
          <Text style={styles.vehicleLabel}>{t('arrived.pickupFrom')}</Text>
          <Text style={styles.vehicleValue}>{liveVehicle?.current_location || confirmation?.locationName || '--'}</Text>
        </View>
      </Animated.View>

      {/* ── ACTIONS ── */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>

        <TouchableOpacity style={styles.newBookingButton} onPress={handleNewBooking}>
          <Text style={styles.newBookingText}>{t('arrived.newBooking')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate('ChatSupport', { bookingId })}
        >
          <Text style={styles.chatButtonText}>💬 AI Help</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          {t('arrived.thankYou')} 🏙️{'\n'}
          {t('arrived.safeFlight')}
        </Text>

      </Animated.View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F10' },
  content: { paddingBottom: 40 },

  // Success area
  successArea: {
    backgroundColor: '#121212',
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
  },

  checkCircle: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: '#009A44',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#009A44',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },

  checkIcon: { fontSize: 50, color: '#FFFFFF', fontWeight: 'bold' },

  arrivedTitle: {
    fontSize: 32, fontWeight: '900',
    color: '#FFFFFF', textAlign: 'center',
  },

  arrivedSubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },

  // Flight card
  flightCard: {
    backgroundColor: '#191A1E',
    margin: 24,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },

  flightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },

  flightFlag: { fontSize: 32 },

  flightNumber: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  flightDest: { fontSize: 13, color: '#CBD5E1' },

  onTimeBadge: {
    marginLeft: 'auto',
    backgroundColor: '#163A1C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  onTimeText: { fontSize: 12, fontWeight: '600', color: '#7EE08D' },

  flightDivider: { height: 0.5, backgroundColor: '#2E3138', marginBottom: 16 },

  flightDetails: { flexDirection: 'row', justifyContent: 'space-between' },

  flightDetail: { alignItems: 'center' },
  detailLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
  detailValue: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },

  // Steps
  stepsSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },

  stepsTitle: {
    fontSize: 18, fontWeight: '700',
    color: '#F8FAFC', marginBottom: 12,
  },

  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#191A1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },

  stepIconBox: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: '#1F2A21',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepIcon: { fontSize: 20 },

  stepInfo: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  stepDesc: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  stepArrow: { fontSize: 20, color: '#94A3B8' },

  // Vehicle card
  vehicleCard: {
    backgroundColor: '#191A1E',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 16,
    padding: 16,
  },

  vehicleCardTitle: {
    fontSize: 14, fontWeight: '700',
    color: '#F8FAFC', marginBottom: 12,
  },

  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2E3138',
  },

  vehicleLabel: { fontSize: 13, color: '#94A3B8' },
  vehicleValue: { fontSize: 13, fontWeight: '600', color: '#F8FAFC' },

  // Actions
  actions: {
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },

  newBookingButton: {
    width: '100%',
    backgroundColor: '#EF3340',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },

  newBookingText: {
    fontSize: 16, fontWeight: '700', color: '#FFFFFF',
  },
  chatButton: {
    width: '100%',
    backgroundColor: '#191A1E',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E3138',
  },
  chatButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },

  footerText: {
    fontSize: 13, color: '#A7B0C0',
    textAlign: 'center', lineHeight: 20,
  },
});

export default ArrivedScreen;