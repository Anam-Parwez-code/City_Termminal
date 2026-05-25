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

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Animated,
  TextInput,
  Platform,
} from 'react-native';

import apiService from '../services/apiService';
import adminService from '../services/adminService';
import { useTranslation } from 'react-i18next';
import theme from '../theme';

// ============================================================
// HELPER — Time format karo
// "2026-04-30T14:30:00" → "2:30 PM"
// ============================================================
const formatTime = (dateString) => {
  if (!dateString) return '--';
  let date = new Date(dateString);
  if (isNaN(date.getTime())) date = new Date(dateString.replace(' ', 'T'));
  if (isNaN(date.getTime())) return String(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// "2026-04-30T14:30:00" → "Wed, Apr 30"
const formatDate = (dateString) => {
  if (!dateString) return '--';
  let date = new Date(dateString);
  if (isNaN(date.getTime())) date = new Date(dateString.replace(' ', 'T'));
  if (isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const parseDateTime = (value) => {
  if (!value) return null;
  let date = new Date(value);
  if (isNaN(date.getTime()) && typeof value === 'string') {
    date = new Date(value.replace(' ', 'T'));
  }
  if (isNaN(date.getTime()) && typeof value === 'string') {
    const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (match) {
      const [, dd, mm, yy, hh = '0', min = '0', meridian] = match;
      const fullYear = yy.length === 2 ? `20${yy}` : yy;
      let hour = Number(hh);
      if (meridian?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (meridian?.toLowerCase() === 'am' && hour === 12) hour = 0;
      date = new Date(Number(fullYear), Number(mm) - 1, Number(dd), hour, Number(min));
    }
  }
  return isNaN(date.getTime()) ? null : date;
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
  const { bookingId, airline, bookingData } = route.params || {};
  const resolvedBookingId = bookingId || bookingData?.bookingId || bookingData?.booking_id;

  // ── STATES ───────────────────────────────────────────────
  const [slots, setSlots] = useState([]);           // Available slots
  const [slotQuery, setSlotQuery] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null); // Chosen slot
  const [isLoadingSlots, setIsLoadingSlots] = useState(true); // Slots load ho raha
  const [isBooking, setIsBooking] = useState(false); // Booking API chal raha
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const filteredSlots = React.useMemo(() => {
    const departure = parseDateTime(
      bookingData?.departureTime ||
      bookingData?.departure_time ||
      bookingData?.flightTime ||
      bookingData?.flight_time,
    );
    const q = slotQuery.trim().toLowerCase();
    return slots.filter((slot) => {
      const slotDate = parseDateTime(slot.slot_time);
      const beforeFlight = !departure || (slotDate && slotDate <= departure);
      const matchesQuery = !q || `${slot.location_name} ${slot.location_address}`.toLowerCase().includes(q);
      return beforeFlight && matchesQuery;
    });
  }, [bookingData, slots, slotQuery]);

  // ── FETCH SLOTS — Screen load hone pe ───────────────────
  useEffect(() => {
    fetchAvailableSlots();
  }, []); // [] = sirf ek baar

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: selectedSlot ? 1 : 0,
      damping: 18,
      stiffness: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [selectedSlot, sheetAnim]);

  const fetchAvailableSlots = async () => {
    setIsLoadingSlots(true);
    try {
      // GET /api/slots/available
      const result = await apiService.getAvailableSlots({ bookingId: resolvedBookingId });
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

              navigation.navigate('LocationPick', {
                bookingId: resolvedBookingId,
                airline,
                bookingData,
                confirmation: result.confirmation,
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

      {/* ── UBER‑STYLE SEARCH (filters terminal / shuttle stops by name or address) ── */}
      {!isLoadingSlots && slots.length > 0 ? (
        <View style={[styles.searchCard, isRTL && styles.searchCardRtl]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={slotQuery}
            onChangeText={setSlotQuery}
            placeholder={t('slotBooking.searchPlaceholder')}
            placeholderTextColor="#6B7280"
            style={[styles.searchInput, isRTL && styles.textRight]}
          />
          {slotQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSlotQuery('')} hitSlop={12}>
              <Text style={styles.searchClear}>×</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!isLoadingSlots && slots.length > 0 ? (
        <Text style={[styles.searchHint, isRTL && styles.textRight]}>{t('slotBooking.searchHint')}</Text>
      ) : null}

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
          <ActivityIndicator size="large" color={theme.colors.careemGreen} />
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

      ) : filteredSlots.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>{t('slotBooking.noSlots')}</Text>
          <Text style={[styles.emptySubtitle, isRTL && styles.textRight]}>
            {t('slotBooking.noSearchMatches')} ({slotQuery})
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setSlotQuery('')}>
            <Text style={styles.retryText}>{t('slotBooking.refresh')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Slots list
        <FlatList
          data={filteredSlots}
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
      {!isLoadingSlots && filteredSlots.length > 0 && (
        <Animated.View
          style={[
            styles.bottomArea,
            {
              transform: [{
                translateY: sheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.sheetHandle} />

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

        </Animated.View>
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
    backgroundColor: '#0A0A0B',
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
    backgroundColor: '#15171B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  backArrow: { fontSize: 20, color: theme.colors.white },

  stepBadge: {
    backgroundColor: '#163A1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  stepText: { fontSize: 12, fontWeight: '800', color: '#D7F6DF' },

  titleArea: { marginBottom: 16 },

  title: {
    fontSize: theme.fontSizes.title, fontWeight: '900',
    color: theme.colors.white, marginBottom: 8,
  },

  subtitle: { fontSize: 14, color: '#A7B0C0', lineHeight: 20 },

  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15171B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2F36',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    marginBottom: 8,
    gap: 8,
  },

  searchCardRtl: {
    flexDirection: 'row-reverse',
  },

  searchIcon: { fontSize: 18, color: '#47D361' },

  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 8,
  },

  searchClear: { fontSize: 22, color: '#9CA3AF', fontWeight: '700', paddingHorizontal: 4 },

  searchHint: { fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 17 },

  // Flight reminder
  flightReminder: {
    backgroundColor: '#15171B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.careemGreen,
  },

  reminderText: { fontSize: 13, color: theme.colors.white },
  reminderBold: { fontWeight: '700' },
  reminderNote: { fontSize: 11, color: '#A7B0C0', marginTop: 4 },

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
  emptyTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.white },
  emptySubtitle: { fontSize: 14, color: '#A7B0C0' },

  retryButton: {
    marginTop: 16,
    backgroundColor: theme.colors.careemGreen,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },

  retryText: { color: '#FFFFFF', fontWeight: '600' },

  // Slot list
  slotList: { flex: 1 },
  listContent: { paddingBottom: 180 },

  // Slot card
  slotCard: {
    backgroundColor: '#15171B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  slotCardSelected: {
    borderColor: theme.colors.careemGreen,
    backgroundColor: '#101215',
  },

  slotCardFull: {
    backgroundColor: '#15171B',
    opacity: 0.6,
  },

  slotTime: { width: 70, marginRight: 12 },

  slotTimeText: {
    fontSize: 16, fontWeight: '900', color: theme.colors.white,
  },

  slotDateText: { fontSize: 11, color: '#A7B0C0', marginTop: 2 },

  slotLocation: { flex: 1, marginRight: 8 },

  slotLocationName: {
    fontSize: 14, fontWeight: '800', color: theme.colors.white,
  },

  slotLocationAddress: {
    fontSize: 11, color: '#A7B0C0', marginTop: 2,
  },

  slotSeats: {
    alignItems: 'center',
    width: 44,
  },

  seatCount: {
    fontSize: 22, fontWeight: '900', color: theme.colors.white,
  },

  seatCountLow: { color: '#EF4444' },

  seatLabel: { fontSize: 10, color: '#A7B0C0' },

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
    backgroundColor: theme.colors.careemGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkmarkText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  selectedText: { color: theme.colors.white },
  selectedSubText: { color: '#A7B0C0' },

  // Bottom
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111316',
    borderTopLeftRadius: theme.radii.sheet,
    borderTopRightRadius: theme.radii.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 22,
    gap: 10,
    ...theme.shadows.card,
  },

  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#2E3138',
    alignSelf: 'center',
    marginBottom: 4,
  },

  selectedSummary: {
    backgroundColor: '#191A1E',
    borderRadius: 12,
    padding: 12,
  },

  summaryText: { fontSize: 13, color: theme.colors.white, fontWeight: '800' },

  bookButton: {
    backgroundColor: theme.colors.careemGreen,
    borderRadius: theme.radii.button,
    paddingVertical: 18,
    alignItems: 'center',
  },

  bookButtonDisabled: { backgroundColor: '#9CA3AF' },

  bookButtonText: {
    fontSize: 16, fontWeight: '900', color: theme.colors.white,
  },
  textRight: {
    textAlign: 'right',
  },

});

export default SlotBookingScreen;
