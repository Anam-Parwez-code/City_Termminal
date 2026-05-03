// ============================================================
// FILE: mobile-app/src/screens/ConfirmationScreen.js
// SCREEN 7 — CONFIRMATION + QR CODE
// ============================================================
// Slot successfully book ho gaya!
// QR Code dikhao — yeh boarding pass ka kaam karega
// Vehicle details dikhao
// Pickup time + location dikhao
// Share / Download option
// ============================================================

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,        // Native share sheet
  Alert,
  Dimensions,
} from 'react-native';

import { useTranslation } from 'react-i18next';
import QRCodeBox from '../components/QRCodeBox';
import theme from '../theme';

const { width } = Dimensions.get('window');

// ============================================================
// TIME FORMAT HELPERS
// ============================================================
const formatTime = (dateString) => {
  if (!dateString) return '--';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return '--';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric',
  });
};

// ============================================================
// INFO ROW COMPONENT — Reusable detail row
// ============================================================
const InfoRow = ({ icon, label, value, highlight }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoIcon}>{icon}</Text>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>
        {value}
      </Text>
    </View>
  </View>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
const ConfirmationScreen = ({ navigation, route }) => {
  const { t } = useTranslation();

  // ── ROUTE PARAMS ─────────────────────────────────────────
  // Screen 6 (SlotBooking) se yeh sab aaya
  const {
    bookingId,
    airline,
    bookingData,
    confirmation, // Backend se aaya: { vehicleNumber, slotTime, locationName, qrCode }
  } = route.params;

  // QR Code ref — save ke liye
  const qrRef = useRef(null);

  // ── QR CODE DATA ─────────────────────────────────────────
  // Backend se aaya qrCode string
  // Isme sab details hain: bookingId, vehicle, time, location
  const qrData = confirmation?.qrCode || JSON.stringify({
    bookingId,
    vehicle: confirmation?.vehicleNumber,
    time: confirmation?.slotTime,
    location: confirmation?.locationName,
  });

  // ── SHARE HANDLER ────────────────────────────────────────
  const handleShare = async () => {
    try {
      // Native Share sheet khulega
      await Share.share({
        message:
          `🏙️ City Terminal Booking Confirmed!\n\n` +
          `📋 Booking ID: ${bookingId}\n` +
          `✈️ Flight: ${bookingData?.flightNumber}\n` +
          `📍 Pickup: ${confirmation?.locationName}\n` +
          `🕐 Time: ${formatTime(confirmation?.slotTime)}\n` +
          `🚗 Vehicle: ${confirmation?.vehicleNumber}\n\n` +
          `Please show QR code at pickup point.`,
        title: t('confirmation.successTitle'),
      });
    } catch (error) {
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
    }
  };

  // ── HOME HANDLER ─────────────────────────────────────────
  const handleGoHome = () => {
    // Stack ko reset karo — sab screens hata do
    // Pehle screen (Splash ya Language) pe wapas
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
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    >

      {/* ── SUCCESS HEADER ── */}
      <View style={styles.successHeader}>

        {/* Green checkmark circle */}
        <View style={styles.successCircle}>
          <Text style={styles.successIcon}>✓</Text>
        </View>

        <Text style={styles.successTitle}>{t('confirmation.successTitle')}</Text>
        <Text style={styles.successSubtitle}>
          {t('confirmation.successSubtitle')}
        </Text>

        {/* Booking ID badge */}
        <View style={styles.bookingBadge}>
          <Text style={styles.bookingBadgeLabel}>{t('confirmation.bookingId')}</Text>
          <Text style={styles.bookingBadgeId}>{bookingId}</Text>
        </View>

      </View>

      {/* ── QR CODE SECTION ── */}
      <View style={styles.qrSection}>

        <Text style={styles.sectionTitle}>{t('confirmation.qrPass')}</Text>
        <Text style={styles.sectionSubtitle}>
          {t('confirmation.qrSubtitle')}
        </Text>

        {/* QR Code card */}
        <View style={styles.qrCard}>

          {/* QR Code component */}
          {/* qrData = booking details as JSON string */}
          {/* Scanner is QR ko padhke sab details nikaal lega */}
          <QRCodeBox value={qrData} size={width * 0.55} />

          {/* QR Code ke neeche flight info */}
          <View style={styles.qrInfo}>
            <Text style={styles.qrFlightNo}>
              {airline?.flag} {bookingData?.flightNumber}
            </Text>
            <Text style={styles.qrDestination}>
              → {bookingData?.destination}
            </Text>
          </View>

        </View>

      </View>

      {/* ── PICKUP DETAILS ── */}
      <View style={styles.detailsSection}>

        <Text style={styles.sectionTitle}>{t('confirmation.pickupDetails')}</Text>

        <View style={styles.detailsCard}>

          <InfoRow
            icon="📍"
            label={t('confirmation.pickupLocation')}
            value={confirmation?.locationName || '--'}
            highlight={true}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="🕐"
            label={t('confirmation.pickupTime')}
            value={formatTime(confirmation?.slotTime)}
            highlight={true}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="📅"
            label={t('confirmation.date')}
            value={formatDate(confirmation?.slotTime)}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="🚗"
            label={t('confirmation.vehicleNumber')}
            value={confirmation?.vehicleNumber || '--'}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="OTP"
            label="Pickup OTP"
            value={confirmation?.pickupOtp || confirmation?.pickup_otp || '--'}
            highlight={true}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="DR"
            label="Driver"
            value={confirmation?.driverName || confirmation?.driver_name || 'City Terminal Driver'}
          />

          <View style={styles.divider} />

          <InfoRow
            icon="✈️"
            label={t('confirmation.yourFlight')}
            value={`${bookingData?.flightNumber} — ${t('confirmation.departs')} ${bookingData?.departureTime}`}
          />

        </View>

      </View>

      {/* ── INSTRUCTIONS ── */}
      <View style={styles.instructionsSection}>

        <Text style={styles.sectionTitle}>{t('confirmation.whatNext')}</Text>

        <View style={styles.instructionsList}>

          {[
            { step: '1', text: 'Be at the pickup location 10 mins before your slot time' },
            { step: '2', text: 'Show this QR code to the vehicle driver' },
            { step: '3', text: 'Your luggage will be checked in at the terminal' },
            { step: '4', text: 'Vehicle will take you directly to departure hall' },
          ].map((item) => (
            <View key={item.step} style={styles.instructionItem}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>{item.step}</Text>
              </View>
              <Text style={styles.instructionText}>{item.text}</Text>
            </View>
          ))}

        </View>

      </View>

      {/* ── ACTION BUTTONS ── */}
      <View style={styles.actions}>

        {/* Share button */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>📤 {t('confirmation.shareBooking')}</Text>

        </TouchableOpacity>
        <TouchableOpacity
  style={styles.trackButton}
  onPress={() => navigation.navigate('LiveTracking', {
    bookingId,
    airline,
    bookingData,
    confirmation,
  })}
>
  <Text style={styles.trackButtonText}>🚗 {t('confirmation.trackVehicle')}</Text>
</TouchableOpacity>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={() =>
            navigation.navigate('ChatSupport', {
              bookingId,
            })
          }
        >
          <Text style={styles.chatButtonText}>💬 Chat Support</Text>
        </TouchableOpacity>

        {/* Home button */}
        <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
          <Text style={styles.homeButtonText}>{t('confirmation.backHome')}</Text>
        </TouchableOpacity>

      </View>

    </ScrollView>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
  },

  contentContainer: {
    paddingBottom: 40,
  },

  // Success header — green background
  successHeader: {
    backgroundColor: '#121212',
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#009A44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#009A44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  successIcon: {
    fontSize: 40,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },

  successSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },

  // Booking ID badge
  bookingBadge: {
    backgroundColor: 'rgba(239,51,64,0.2)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,51,64,0.55)',
  },

  bookingBadgeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  bookingBadgeId: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 3,
  },

  // Sections
  qrSection: {
    padding: 24,
    alignItems: 'center',
  },

  detailsSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },

  instructionsSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: '#A7B0C0',
    marginBottom: 16,
  },

  // QR Card
  qrCard: {
    backgroundColor: '#191A1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    width: '100%',
  },

  qrInfo: {
    marginTop: 20,
    alignItems: 'center',
  },

  qrFlightNo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },

  qrDestination: {
    fontSize: 13,
    color: '#CBD5E1',
    marginTop: 4,
  },

  // Details card
  detailsCard: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 12,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },

  infoIcon: { fontSize: 20, width: 28, textAlign: 'center' },

  infoContent: { flex: 1 },

  infoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#F8FAFC',
  },

  infoValueHighlight: {
    color: '#7EE08D',
    fontWeight: '700',
    fontSize: 16,
  },

  divider: {
    height: 0.5,
    backgroundColor: '#2E3138',
  },

  // Instructions
  instructionsList: {
    marginTop: 12,
    gap: 12,
  },

  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#191A1E',
    borderRadius: 12,
    padding: 14,
  },

  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#009A44',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 18,
  },

  // Action buttons
  actions: {
    paddingHorizontal: 24,
    gap: 12,
  },

  shareButton: {
    backgroundColor: '#EF3340',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },

  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  homeButton: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2E3138',
  },

  homeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  trackButton: {
    backgroundColor: '#009A44',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  trackButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chatButton: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E3138',
  },
  chatButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },

});

export default ConfirmationScreen;
