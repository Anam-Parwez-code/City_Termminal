// ============================================================
// FILE: mobile-app/src/screens/TimeSlotScreen.js
// FIXED — Pickup location display + real countdown timer support
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const COLORS = {
  bg:    '#0A0A0B',
  card:  '#15171B',
  line:  '#2A2F36',
  green: theme?.colors?.careemGreen || '#47D361',
  amber: '#F5A623',
  text:  '#FFFFFF',
  muted: '#A7B0C0',
};

// ── Real dynamic dates ────────────────────────────────────
const generateDates = () => {
  const dates = [];
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');

    dates.push({
      id:      String(i),
      label:   i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[d.getDay()],
      date:    `${yyyy}-${mm}-${dd}`,
      display: `${dd} ${monthNames[d.getMonth()]}`,
      dateObj: d,
    });
  }
  return dates;
};

// ── Format slot time from DB ──────────────────────────────
const formatSlotTime = (dateString) => {
  if (!dateString) return '--';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString).substring(0, 5);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Dubai',
    });
  } catch { return String(dateString); }
};

const formatSlotDate = (dateString) => {
  if (!dateString) return '--';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'Asia/Dubai',
    });
  } catch { return '--'; }
};

const isSlotOnDate = (slotTime, selectedDate) => {
  if (!slotTime || !selectedDate) return true;
  try {
    const slotDate = new Date(slotTime);
    const selDate  = new Date(selectedDate);
    return (
      slotDate.getFullYear() === selDate.getFullYear() &&
      slotDate.getMonth()    === selDate.getMonth() &&
      slotDate.getDate()     === selDate.getDate()
    );
  } catch { return true; }
};

// ── Pickup label extract karo params se ──────────────────
const getPickupLabel = (params) => {
  // LocationPickScreen se aata hai: pickupLocation: { name, lat, lng }
  const pl = params?.pickupLocation;
  if (!pl) return null;

  if (pl.name && pl.name.trim().length > 0) {
    // "Jebel Ali, Dubai (25.01234, 55.12345)" jaisa format
    const clean = pl.name.replace(/\s*\(\d+\.\d+,\s*\d+\.\d+\)$/, '').trim();
    return clean || pl.name;
  }
  if (pl.lat && pl.lng) {
    return `${Number(pl.lat).toFixed(4)}, ${Number(pl.lng).toFixed(4)}`;
  }
  return null;
};

// ════════════════════════════════════════════════════════
const TimeSlotScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL  = i18n.dir() === 'rtl';
  const params = route?.params || {};

  // ── Pickup info (LocationPickScreen se pass hoti hai) ──
  const pickupLabel     = getPickupLabel(params);
  const pickupCoords    = params?.pickupLocation;
  const destTerminal    = params?.destinationTerminal || 'Airport Terminal';

  const DATES = generateDates();

  const [selectedDate,  setSelectedDate]  = useState(DATES[0].date);
  const [selectedSlot,  setSelectedSlot]  = useState(null);
  const [isBooking,     setIsBooking]     = useState(false);
  const [allSlots,      setAllSlots]      = useState([]);
  const [loadingSlots,  setLoadingSlots]  = useState(true);
  const [slotError,     setSlotError]     = useState(null);

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    setLoadingSlots(true);
    setSlotError(null);
    try {
      const res   = await apiService.getAvailableSlots();
      const slots = res?.slots || res?.data || [];
      setAllSlots(slots);

      if (slots.length === 0) {
        setSlotError('No slots available right now. Please try again later.');
      }
    } catch (err) {
      console.error('Fetch slots error:', err.message);
      setSlotError('Could not load slots. Check your connection.');
    } finally {
      setLoadingSlots(false);
    }
  };

  // ── Filter slots by selected date ─────────────────────
  const filteredSlots = allSlots.filter(slot =>
    isSlotOnDate(slot.slot_time, selectedDate)
  );

  const getAvailableSeats = (slot) => {
    const total  = slot.total_capacity || 10;
    const booked = slot.booked_count   || 0;
    return total - booked;
  };

  const handleConfirm = async () => {
    if (!selectedSlot) {
      Alert.alert('Select a Slot', 'Please select a time slot to continue.');
      return;
    }

    setIsBooking(true);
    try {
      const bookingId =
        params.bookingId ||
        params.bookingData?.bookingId ||
        params.bookingData?.booking_id;

      if (bookingId && selectedSlot.id) {
        try {
          await apiService.bookSlot({
            bookingId: bookingId.trim().toUpperCase(),
            slotId: selectedSlot.id,
          });
        } catch (bookErr) {
          console.warn('Slot booking error:', bookErr.message);
        }
      }

      navigation.navigate('BookingConfirm', {
        ...params,
        selectedDate,
        selectedTimeSlot:  formatSlotTime(selectedSlot.slot_time),
        selectedSlotId:    selectedSlot.id,
        slotDetails: {
          slotTime:        selectedSlot.slot_time,
          locationName:    selectedSlot.location_name,
          locationAddress: selectedSlot.location_address,
        },
      });
    } catch (err) {
      Alert.alert('Error', 'Could not reserve slot. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* ── HEADER ── */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, isRTL && styles.textRight]}>Pick a Slot</Text>
          <Text style={styles.subtitle}>Select your pickup date and time</Text>
        </View>
      </View>

      {/* ── PICKUP + DESTINATION SUMMARY CARD ── */}
      {(pickupLabel || destTerminal) && (
        <View style={styles.summaryCard}>
          {pickupLabel ? (
            <View style={styles.summaryRow}>
              <View style={styles.dotGreen} />
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryLabel}>Pickup Location</Text>
                <Text style={styles.summaryValue} numberOfLines={2}>{pickupLabel}</Text>
              </View>
            </View>
          ) : null}

          {pickupLabel && destTerminal ? (
            <View style={styles.summaryDivider} />
          ) : null}

          {destTerminal ? (
            <View style={styles.summaryRow}>
              <View style={styles.dotAmber} />
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryLabel}>Airport Destination</Text>
                <Text style={styles.summaryValue} numberOfLines={2}>{destTerminal}</Text>
              </View>
            </View>
          ) : null}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── DATE SELECTOR ── */}
        <Text style={styles.sectionHeading}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {DATES.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[styles.dateBubble, selectedDate === d.date && styles.dateBubbleSelected]}
              onPress={() => { setSelectedDate(d.date); setSelectedSlot(null); }}
            >
              <Text style={[styles.dateLabel, selectedDate === d.date && styles.dateLabelSelected]}>
                {d.label}
              </Text>
              <Text style={[styles.dateValue, selectedDate === d.date && styles.dateValueSelected]}>
                {d.display}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── TIME SLOTS ── */}
        <View style={styles.slotHeader}>
          <Text style={styles.sectionHeading}>Available Times</Text>
          <TouchableOpacity onPress={fetchSlots}>
            <Text style={styles.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        {loadingSlots ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.green} />
            <Text style={styles.loadingText}>Loading available slots...</Text>
          </View>
        ) : slotError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{slotError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchSlots}>
              <Text style={styles.retryTxt}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredSlots.length === 0 ? (
          <View style={styles.errorBox}>
            <Text style={styles.emptyIcon}>🚗</Text>
            <Text style={styles.errorText}>No slots available for this date.</Text>
            <Text style={styles.errorSub}>Try selecting another date.</Text>
          </View>
        ) : (
          <View style={styles.slotGrid}>
            {filteredSlots.map((slot) => {
              const isSelected = selectedSlot?.id === slot.id;
              const availSeats = getAvailableSeats(slot);
              const isFull     = availSeats <= 0;
              const isLow      = availSeats <= 3 && !isFull;

              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[
                    styles.slotCard,
                    isSelected && styles.slotCardSelected,
                    isFull     && styles.slotCardFull,
                  ]}
                  onPress={() => !isFull && setSelectedSlot(slot)}
                  disabled={isFull}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotTime, isSelected && styles.slotTimeSelected]}>
                    {formatSlotTime(slot.slot_time)}
                  </Text>

                  {/* Slot location — pickup area ke paas wala dikhao */}
                  <Text
                    style={[styles.slotLocation, isSelected && styles.slotLocationSelected]}
                    numberOfLines={1}
                  >
                    {slot.location_name || 'City Terminal'}
                  </Text>

                  {/* Pickup label bhi dikhao agar available hai */}
                  {pickupLabel ? (
                    <Text style={styles.slotPickupHint} numberOfLines={1}>
                      📍 {pickupLabel}
                    </Text>
                  ) : null}

                  <View style={styles.slotBottom}>
                    {isFull ? (
                      <Text style={styles.fullText}>Full</Text>
                    ) : (
                      <Text style={[
                        styles.seatsText,
                        isLow      && styles.seatsLow,
                        isSelected && styles.seatsSelected,
                      ]}>
                        {availSeats} seat{availSeats !== 1 ? 's' : ''} left
                      </Text>
                    )}
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Fallback — all slots if filtered empty */}
        {!loadingSlots && filteredSlots.length === 0 && allSlots.length > 0 && (
          <View style={styles.allSlotsHint}>
            <Text style={styles.allSlotsText}>
              Showing all available slots across dates:
            </Text>
            {allSlots.slice(0, 3).map(slot => (
              <Text key={slot.id} style={styles.allSlotsItem}>
                📅 {formatSlotDate(slot.slot_time)} — {formatSlotTime(slot.slot_time)} ({slot.location_name})
              </Text>
            ))}
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🚗 Our driver will arrive at your pickup location within the selected time window.
            Please ensure your luggage is ready for tagging.
          </Text>
        </View>

      </ScrollView>

      {/* ── FOOTER CTA ── */}
      <View style={styles.footer}>
        {selectedSlot && (
          <View style={styles.selectedSummary}>
            <Text style={styles.selectedSummaryText}>
              {pickupLabel ? `📍 ${pickupLabel}  •  ` : ''}
              🕐 {formatSlotTime(selectedSlot.slot_time)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.confirmBtn, (!selectedSlot || isBooking) && styles.disabledBtn]}
          disabled={!selectedSlot || isBooking}
          onPress={handleConfirm}
        >
          {isBooking ? (
            <ActivityIndicator color="#0A0A0B" />
          ) : (
            <Text style={styles.confirmBtnText}>
              {selectedSlot ? 'Confirm Slot →' : 'Select a Time Slot'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
};

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16, gap: 14,
  },
  rtlRow:    { flexDirection: 'row-reverse' },
  headerText: { flex: 1 },
  backButton: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.line,
  },
  backText:  { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  title:     { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  subtitle:  { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  textRight: { textAlign: 'right' },

  // ── Pickup/Dest summary card ──
  summaryCard: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  dotGreen: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.green,
    marginTop: 4,
    flexShrink: 0,
  },
  dotAmber: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.amber,
    marginTop: 4,
    flexShrink: 0,
  },
  summaryTextWrap: { flex: 1 },
  summaryLabel: {
    color: COLORS.muted, fontSize: 11,
    fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 2,
  },
  summaryValue: { color: COLORS.text, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  summaryDivider: {
    height: 1, backgroundColor: COLORS.line,
    marginVertical: 2, marginLeft: 22,
  },

  content: { padding: 24, paddingBottom: 20 },

  sectionHeading: {
    color: COLORS.text, fontSize: 17, fontWeight: '800',
    marginBottom: 14, marginTop: 8,
  },
  slotHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  refreshText: { color: COLORS.green, fontWeight: '700', fontSize: 14 },

  dateScroll:  { flexDirection: 'row', marginBottom: 28 },
  dateBubble: {
    backgroundColor: COLORS.card,
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 16, marginRight: 10,
    borderWidth: 1, borderColor: COLORS.line,
    minWidth: 80, alignItems: 'center',
  },
  dateBubbleSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  dateLabel:    { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  dateLabelSelected: { color: '#08100A' },
  dateValue:    { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  dateValueSelected: { color: '#08100A' },

  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { color: COLORS.muted, fontSize: 14 },
  errorBox: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  errorText: { color: COLORS.muted, fontSize: 14, textAlign: 'center' },
  errorSub:  { color: COLORS.muted, fontSize: 12, opacity: 0.7 },
  retryBtn:  {
    backgroundColor: COLORS.green, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 24, marginTop: 8,
  },
  retryTxt:  { color: '#08100A', fontWeight: '800', fontSize: 14 },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  slotCard: {
    backgroundColor: COLORS.card,
    width: '48%', borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: COLORS.line,
  },
  slotCardSelected: { backgroundColor: '#163A1C', borderColor: COLORS.green },
  slotCardFull:     { opacity: 0.4 },
  slotTime:     { color: COLORS.text, fontWeight: '800', fontSize: 15, marginBottom: 4 },
  slotTimeSelected: { color: COLORS.green },
  slotLocation: { color: COLORS.muted, fontSize: 11, marginBottom: 4 },
  slotLocationSelected: { color: '#A7F3B8' },
  slotPickupHint: {
    color: COLORS.muted, fontSize: 10, fontWeight: '600',
    marginBottom: 8, opacity: 0.7,
  },
  slotBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seatsText:  { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  seatsLow:   { color: COLORS.amber },
  seatsSelected: { color: COLORS.green },
  fullText:   { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  checkmark:  { color: COLORS.green, fontSize: 16, fontWeight: '900' },

  allSlotsHint: {
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.line,
  },
  allSlotsText: { color: COLORS.muted, fontSize: 12, marginBottom: 8 },
  allSlotsItem: { color: COLORS.text, fontSize: 12, marginBottom: 4 },

  infoBox: {
    backgroundColor: 'rgba(71,211,97,0.08)',
    borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(71,211,97,0.2)',
  },
  infoText: { color: COLORS.green, fontSize: 13, lineHeight: 20, fontWeight: '600' },

  footer: {
    padding: 20, paddingBottom: 36,
    backgroundColor: COLORS.card,
    borderTopWidth: 1, borderColor: COLORS.line,
    gap: 10,
  },
  selectedSummary: {
    backgroundColor: '#163A1C', borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  selectedSummaryText: { color: COLORS.green, fontWeight: '700', fontSize: 13 },
  confirmBtn: {
    backgroundColor: COLORS.green, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
  },
  disabledBtn: { opacity: 0.4 },
  confirmBtnText: { color: '#0A0A0B', fontWeight: '900', fontSize: 16 },
});

export default TimeSlotScreen;