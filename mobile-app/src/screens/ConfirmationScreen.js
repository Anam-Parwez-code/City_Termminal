// ============================================================
// Confirmation — pre-trip (track vehicle) OR boarding pass (at airport)
// ============================================================

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { formatPickupDate, formatPickupTime, getPickupTimeFromParams } from '../utils/slotTime';
import { clearPassengerTrip, savePassengerTrip } from '../services/passengerTripStorage';
import theme from '../theme';

const { width } = Dimensions.get('window');

const pick = (...values) =>
  values.find((v) => v != null && String(v).trim() !== '' && String(v).trim() !== '--');

const pickupNameFrom = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return pick(value.name, value.label, value.locationName, value.pickupLocation);
};

const normalizeStatus = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '_');

const InfoRow = ({ icon, label, value, highlight }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoIcon}>{icon}</Text>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  </View>
);

const ConfirmationScreen = ({ navigation, route }) => {
  const { t } = useTranslation();
  const params = route?.params || {};
  const {
    bookingId,
    airline,
    bookingData,
    confirmation = {},
    statusData,
    isBoardingPass: forceBoarding,
  } = params;

  const statusNorm = normalizeStatus(statusData?.status || confirmation?.status);
  const isBoardingPass =
    forceBoarding === true ||
    confirmation?.reachedAirport === true ||
    statusNorm === 'at_airport' ||
    statusNorm.includes('at_airport');

  const pickupLocation =
    pick(
      confirmation?.locationName,
      confirmation?.pickupLocation,
      pickupNameFrom(params?.pickupLocation),
      params?.pickupLocationName,
      statusData?.pickupLocation,
    ) || '--';

  const destinationTerminal =
    pick(
      confirmation?.destinationTerminal,
      params?.destinationTerminal,
      bookingData?.terminal,
      statusData?.destinationTerminal,
    ) || '--';

  const slotTimeRaw = getPickupTimeFromParams({ ...params, confirmation, statusData });
  const slotTimeLabel = formatPickupTime(slotTimeRaw);
  const slotDateLabel = formatPickupDate(slotTimeRaw);

  const vehicleNumber =
    pick(confirmation?.vehicleNumber, confirmation?.vehicleId, confirmation?.vehicle_id, statusData?.vehicleId) ||
    '--';

  const boardingPassData = pick(
    confirmation?.barcodeData,
    confirmation?.barcode_data,
    confirmation?.qrCode,
    statusData?.barcodeData,
    statusData?.barcode_data,
  );

  const qrData = useMemo(() => {
    if (boardingPassData) {
      if (typeof boardingPassData === 'string') {
        try {
          return JSON.stringify(JSON.parse(boardingPassData));
        } catch {
          return boardingPassData;
        }
      }
      try {
        return JSON.stringify(boardingPassData);
      } catch {
        return String(bookingId);
      }
    }
    return JSON.stringify({
      type: 'digital_boarding_pass',
      bookingId,
      vehicle: vehicleNumber,
      time: slotTimeRaw,
      location: pickupLocation,
      destinationTerminal,
    });
  }, [boardingPassData, bookingId, destinationTerminal, pickupLocation, slotTimeRaw, vehicleNumber]);

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          `City Terminal — ${isBoardingPass ? 'Boarding Pass' : 'Booking Confirmed'}\n\n` +
          `Booking: ${bookingId}\n` +
          `Pickup: ${pickupLocation}\n` +
          `Time: ${slotTimeLabel}\n` +
          `Vehicle: ${vehicleNumber}\n` +
          `Terminal: ${destinationTerminal}`,
        title: t('confirmation.successTitle'),
      });
    } catch {
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
    }
  };

  const handleGoHome = async () => {
    if (isBoardingPass) {
      await clearPassengerTrip();
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'LanguageSelect' }],
    });
  };

  const goToLiveTracking = async () => {
    const tripParams = {
      ...params,
      bookingId,
      airline,
      bookingData,
      statusData,
      confirmation: {
        ...confirmation,
        vehicleNumber,
        vehicleId: vehicleNumber,
        locationName: pickupLocation,
        pickupLocation,
        destinationTerminal,
        slotTime: slotTimeRaw,
      },
    };
    await savePassengerTrip({
      bookingId,
      params: tripParams,
      phase: 'tracking',
      status: statusData?.status || confirmation?.status,
      vehicleId: vehicleNumber,
    });
    navigation.navigate('LiveTracking', tripParams);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
      <View style={styles.successHeader}>
        <View style={[styles.successCircle, isBoardingPass && styles.successCircleBoarding]}>
          <Text style={styles.successIcon}>{isBoardingPass ? '✈' : '✓'}</Text>
        </View>
        <Text style={styles.successTitle}>
          {isBoardingPass ? 'Boarding Pass Ready' : t('confirmation.successTitle')}
        </Text>
        <Text style={styles.successSubtitle}>
          {isBoardingPass
            ? 'Your luggage has reached the airport terminal. Use the QR below at check-in.'
            : t('confirmation.successSubtitle')}
        </Text>
        <View style={styles.bookingBadge}>
          <Text style={styles.bookingBadgeLabel}>{t('confirmation.bookingId')}</Text>
          <Text style={styles.bookingBadgeId}>{bookingId}</Text>
        </View>
      </View>

      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>
          {isBoardingPass ? 'Digital Boarding Pass QR' : t('confirmation.qrPass')}
        </Text>
        <Text style={styles.sectionSubtitle}>
          {isBoardingPass
            ? 'Show this at the airport counter — same as your profile barcode'
            : t('confirmation.qrSubtitle')}
        </Text>
        <View style={styles.qrCard}>
          <View style={styles.qrWhite}>
            <QRCode value={qrData} size={Math.min(width * 0.62, 240)} backgroundColor="#FFFFFF" color="#0A0A0B" />
          </View>
          <View style={styles.qrInfo}>
            <Text style={styles.qrFlightNo}>
              {airline?.flag ? `${airline.flag} ` : ''}
              {bookingData?.flightNumber || confirmation?.flightNumber || bookingId}
            </Text>
            <Text style={styles.qrDestination}>→ {bookingData?.destination || destinationTerminal}</Text>
            <Text style={styles.qrVehicle}>Vehicle {vehicleNumber}</Text>
          </View>
        </View>
      </View>

      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>{t('confirmation.pickupDetails')}</Text>
        <View style={styles.detailsCard}>
          <InfoRow icon="📍" label={t('confirmation.pickupLocation')} value={pickupLocation} highlight />
          <View style={styles.divider} />
          <InfoRow icon="🕐" label={t('confirmation.pickupTime')} value={slotTimeLabel} highlight />
          <View style={styles.divider} />
          <InfoRow icon="📅" label={t('confirmation.date')} value={slotDateLabel} />
          <View style={styles.divider} />
          <InfoRow icon="🚗" label={t('confirmation.vehicleNumber')} value={vehicleNumber} />
          <View style={styles.divider} />
          <InfoRow icon="✈️" label="Destination Terminal" value={destinationTerminal} />
          <View style={styles.divider} />
          <InfoRow
            icon="👤"
            label="Driver"
            value={confirmation?.driverName || confirmation?.driver_name || 'City Terminal Driver'}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>📤 {t('confirmation.shareBooking')}</Text>
        </TouchableOpacity>

        {!isBoardingPass ? (
          <TouchableOpacity style={styles.trackButton} onPress={goToLiveTracking}>
            <Text style={styles.trackButtonText}>🚗 {t('confirmation.trackVehicle')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
          <Text style={styles.homeButtonText}>{t('confirmation.backHome')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F10' },
  contentContainer: { paddingBottom: 48 },
  successHeader: {
    backgroundColor: '#121212',
    paddingTop: 72,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.careemGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successCircleBoarding: { backgroundColor: '#163A1C', borderWidth: 2, borderColor: theme.colors.careemGreen },
  successIcon: { fontSize: 36, color: '#08100A', fontWeight: '900' },
  successTitle: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  bookingBadge: {
    backgroundColor: 'rgba(71,211,97,0.12)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(71,211,97,0.35)',
  },
  bookingBadgeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bookingBadgeId: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  qrSection: { padding: 24, alignItems: 'center' },
  detailsSection: { paddingHorizontal: 24, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#94A3B8', marginBottom: 16, textAlign: 'center', lineHeight: 19 },
  qrCard: {
    backgroundColor: '#191A1E',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#2E3138',
  },
  qrWhite: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 18,
  },
  qrInfo: { marginTop: 18, alignItems: 'center', gap: 4 },
  qrFlightNo: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  qrDestination: { fontSize: 13, color: '#94A3B8' },
  qrVehicle: { fontSize: 13, color: theme.colors.careemGreen, fontWeight: '800', marginTop: 4 },
  detailsCard: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2E3138',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  infoIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#F8FAFC' },
  infoValueHighlight: { color: theme.colors.careemGreen, fontWeight: '800', fontSize: 16 },
  divider: { height: 0.5, backgroundColor: '#2E3138' },
  actions: { paddingHorizontal: 24, gap: 12 },
  shareButton: {
    backgroundColor: theme.colors.careemGreen,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  shareButtonText: { fontSize: 16, fontWeight: '800', color: '#08100A' },
  trackButton: {
    backgroundColor: '#EF3340',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  trackButtonText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  homeButton: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2E3138',
  },
  homeButtonText: { fontSize: 16, fontWeight: '700', color: '#CBD5E1' },
});

export default ConfirmationScreen;
