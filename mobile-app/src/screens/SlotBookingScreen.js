// ============================================================
// FILE: mobile-app/src/screens/SlotBookingScreen.js
// SCREEN 6 — SLOT BOOKING
// ============================================================
// User yahan apna time slot choose karega
// Backend se available slots fetch honge
// User slot select karega → Confirm karega
// Backend mein slot book hoga
// QR Code + Confirmation Screen pe jaayega
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';

import apiService from '../services/apiService';
import adminService from '../services/adminService';
import { useTranslation } from 'react-i18next';

// ============================================================
// HELPER — Time format karo
// "2026-04-30T14:30:00" → "2:30 PM"
// ============================================================
const formatTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// "2026-04-30T14:30:00" → "Wed, Apr 30"
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// ============================================================
// SLOT CARD COMPONENT — Har slot ke liye card
// ============================================================
const SlotCard = ({ slot, isSelected, onSelect, t }) => {

  // Available seats calculate karo
  const availableSeats = slot.total_capacity - slot.booked_count;
  const isFull = availableSeats === 0;
  const isAlmostFull = availableSeats <= 2;

  return (
    <TouchableOpacity
      style={[
        styles.slotCard,
        isSelected && styles.slotCardSelected,  // Selected → blue border
        isFull && styles.slotCardFull,          // Full → gray
      ]}
      onPress={() => !isFull && onSelect(slot)} // Full hone pe press nahi
      disabled={isFull}
      activeOpacity={0.8}
    >

      {/* LEFT — Time + Date */}
      <View style={styles.slotTime}>
        <Text style={[styles.slotTimeText, isSelected && styles.selectedText]}>
          {formatTime(slot.slot_time)}
        </Text>
        <Text style={[styles.slotDateText, isSelected && styles.selectedSubText]}>
          {formatDate(slot.slot_time)}
        </Text>
      </View>

      {/* MIDDLE — Location */}
      <View style={styles.slotLocation}>
        <Text style={[styles.slotLocationName, isSelected && styles.selectedText]}
          numberOfLines={1}>
          {slot.location_name}
        </Text>
        <Text style={[styles.slotLocationAddress, isSelected && styles.selectedSubText]}
          numberOfLines={1}>
          {slot.location_address}
        </Text>
      </View>

      {/* RIGHT — Seats + Status */}
      <View style={styles.slotSeats}>

        {isFull ? (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>{t('slotBooking.full')}</Text>
          </View>
        ) : (
          <>
            <Text style={[
              styles.seatCount,
              isAlmostFull && styles.seatCountLow,
              isSelected && styles.selectedText,
            ]}>
              {availableSeats}
            </Text>
            <Text style={[styles.seatLabel, isSelected && styles.selectedSubText]}>
              {t('slotBooking.seats')}
            </Text>
          </>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}

      </View>

    </TouchableOpacity>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const SlotBookingScreen = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  // ── ROUTE PARAMS ─────────────────────────────────────────
  const { bookingId, airline, bookingData } = route.params;
  const resolvedBookingId = bookingData?.bookingId || bookingId;

  // ── STATES ───────────────────────────────────────────────
  const [slots, setSlots] = useState([]);           // Available slots
  const [selectedSlot, setSelectedSlot] = useState(null); // Chosen slot
  const [isLoadingSlots, setIsLoadingSlots] = useState(true); // Slots load ho raha
  const [isBooking, setIsBooking] = useState(false); // Booking API chal raha

  // ── FETCH SLOTS — Screen load hone pe ───────────────────
  useEffect(() => {
    fetchAvailableSlots();
  }, []); // [] = sirf ek baar

  const fetchAvailableSlots = async () => {
    setIsLoadingSlots(true);
    try {
      // GET /api/slots/available
      const result = await apiService.getAvailableSlots();
      setSlots(result.slots || []);
    } catch (error) {
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // ── BOOK SLOT HANDLER ────────────────────────────────────
  const handleBookSlot = async () => {

    if (!selectedSlot) {
      Alert.alert(t('slotBooking.selectSlotTitle'), t('slotBooking.selectSlotMessage'));
      return;
    }

    // Confirm karo
    Alert.alert(
      t('slotBooking.confirmTitle'),
      `${t('slotBooking.confirmMessagePrefix')} ${selectedSlot.location_name} ${t('slotBooking.confirmMessageMid')} ${formatTime(selectedSlot.slot_time)}?`,
      [
        { text: t('slotBooking.cancel'), style: 'cancel' },
        {
          text: t('slotBooking.confirm'),
          onPress: async () => {

            setIsBooking(true);

            try {
              // POST /api/slots/book
              const result = await apiService.bookSlot({
                bookingId: resolvedBookingId,
                slotId: selectedSlot.id,
              });

              if (!result?.success || !result?.confirmation) {
                throw new Error(result?.message || 'Booking completed but confirmation data was missing.');
              }

              await adminService.saveCurrentBookingId(resolvedBookingId);

              // Confirmation + QR Screen pe jaao
              navigation.navigate('Confirmation', {
                bookingId: resolvedBookingId,
                airline,
                bookingData,
                confirmation: result.confirmation, // Vehicle, QR, slot details
              });

            } catch (error) {
              Alert.alert(
                t('slotBooking.bookingFailed'),
                error.message || t('slotBooking.bookingFailedMessage'),
              );
            } finally {
              setIsBooking(false);
            }
          },
        },
      ]
    );
  };

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    <View style={styles.container}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>{t('slotBooking.step')}</Text>
        </View>
      </View>

      {/* ── TITLE ── */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, isRTL && styles.textRight]}>{t('slotBooking.title')}</Text>
        <Text style={[styles.subtitle, isRTL && styles.textRight]}>
          {t('slotBooking.subtitle')}
        </Text>
      </View>

      {/* ── FLIGHT REMINDER ── */}
      <View style={styles.flightReminder}>
        <Text style={styles.reminderText}>
          ✈ {t('slotBooking.reminderPrefix')} {bookingData?.flightNumber} {t('slotBooking.reminderSuffix')}{' '}
          <Text style={styles.reminderBold}>{bookingData?.departureTime}</Text>
        </Text>
        <Text style={styles.reminderNote}>
          {t('slotBooking.reminderNote')}
        </Text>
      </View>

      {/* ── SLOTS LIST ── */}
      {isLoadingSlots ? (
        // Loading state
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#EF3340" />
          <Text style={styles.loadingText}>{t('slotBooking.loadingSlots')}</Text>
        </View>

      ) : slots.length === 0 ? (
        // Empty state
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🚗</Text>
          <Text style={styles.emptyTitle}>{t('slotBooking.noSlots')}</Text>
          <Text style={styles.emptySubtitle}>{t('slotBooking.tryLater')}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchAvailableSlots}
          >
            <Text style={styles.retryText}>{t('slotBooking.refresh')}</Text>
          </TouchableOpacity>
        </View>

      ) : (
        // Slots list
        <FlatList
          data={slots}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <SlotCard
              slot={item}
              isSelected={selectedSlot?.id === item.id}
              onSelect={setSelectedSlot}
              t={t}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          style={styles.slotList}
        />
      )}

      {/* ── BOTTOM BUTTON ── */}
      {!isLoadingSlots && slots.length > 0 && (
        <View style={styles.bottomArea}>

          {/* Selected slot summary */}
          {selectedSlot && (
            <View style={styles.selectedSummary}>
              <Text style={styles.summaryText}>
                📍 {selectedSlot.location_name} {t('slotBooking.selectedAt')} {formatTime(selectedSlot.slot_time)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.bookButton,
              (!selectedSlot || isBooking) && styles.bookButtonDisabled,
            ]}
            onPress={handleBookSlot}
            disabled={!selectedSlot || isBooking}
          >
            {isBooking ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.bookButtonText}>
                {isRTL ? `← ${t('slotBooking.confirmButton')}` : `${t('slotBooking.confirmButton')} →`}
              </Text>
            )}
          </TouchableOpacity>

        </View>
      )}

    </View>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    paddingHorizontal: 24,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    marginBottom: 24,
  },

  backButton: {
    width: 44, height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1D',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  backArrow: { fontSize: 20, color: '#F8FAFC' },

  stepBadge: {
    backgroundColor: '#163A1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  stepText: { fontSize: 12, fontWeight: '600', color: '#D7F6DF' },

  titleArea: { marginBottom: 16 },

  title: {
    fontSize: 26, fontWeight: '800',
    color: '#F8FAFC', marginBottom: 8,
  },

  subtitle: { fontSize: 14, color: '#CBD5E1', lineHeight: 20 },

  // Flight reminder
  flightReminder: {
    backgroundColor: '#1F2A21',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#009A44',
  },

  reminderText: { fontSize: 13, color: '#D1FAE5' },
  reminderBold: { fontWeight: '700' },
  reminderNote: { fontSize: 11, color: '#A7F3D0', marginTop: 4 },

  // Loading
  loadingContainer: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', gap: 12,
  },

  loadingText: { fontSize: 14, color: '#A7B0C0' },

  // Empty
  emptyContainer: {
    flex: 1, alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },

  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },
  emptySubtitle: { fontSize: 14, color: '#A7B0C0' },

  retryButton: {
    marginTop: 16,
    backgroundColor: '#EF3340',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },

  retryText: { color: '#FFFFFF', fontWeight: '600' },

  // Slot list
  slotList: { flex: 1 },
  listContent: { paddingBottom: 16 },

  // Slot card
  slotCard: {
    backgroundColor: '#191A1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2E3138',
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  slotCardSelected: {
    borderColor: '#009A44',
    backgroundColor: '#1F2A21',
  },

  slotCardFull: {
    backgroundColor: '#252830',
    opacity: 0.6,
  },

  slotTime: { width: 70, marginRight: 12 },

  slotTimeText: {
    fontSize: 16, fontWeight: '700', color: '#F8FAFC',
  },

  slotDateText: { fontSize: 11, color: '#A7B0C0', marginTop: 2 },

  slotLocation: { flex: 1, marginRight: 8 },

  slotLocationName: {
    fontSize: 14, fontWeight: '600', color: '#F8FAFC',
  },

  slotLocationAddress: {
    fontSize: 11, color: '#94A3B8', marginTop: 2,
  },

  slotSeats: {
    alignItems: 'center',
    width: 44,
  },

  seatCount: {
    fontSize: 22, fontWeight: '800', color: '#F8FAFC',
  },

  seatCountLow: { color: '#EF4444' },

  seatLabel: { fontSize: 10, color: '#94A3B8' },

  fullBadge: {
    backgroundColor: '#2B2F36',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },

  fullBadgeText: { fontSize: 11, color: '#D1D5DB', fontWeight: '600' },

  checkmark: {
    marginTop: 4,
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: '#009A44',
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkmarkText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  selectedText: { color: '#7EE08D' },
  selectedSubText: { color: '#B4F5C4' },

  // Bottom
  bottomArea: {
    paddingVertical: 16,
    gap: 10,
  },

  selectedSummary: {
    backgroundColor: '#1F2A21',
    borderRadius: 12,
    padding: 12,
  },

  summaryText: { fontSize: 13, color: '#D1FAE5', fontWeight: '500' },

  bookButton: {
    backgroundColor: '#EF3340',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },

  bookButtonDisabled: { backgroundColor: '#9CA3AF' },

  bookButtonText: {
    fontSize: 16, fontWeight: '700', color: '#FFFFFF',
  },
  textRight: {
    textAlign: 'right',
  },

});

export default SlotBookingScreen;
