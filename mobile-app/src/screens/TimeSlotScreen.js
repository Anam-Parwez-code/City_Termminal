import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  line: '#2A2F36',
  green: theme.colors.careemGreen || '#47D361',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const DATES = [
  { id: '1', label: 'Today', date: '2026-05-05' },
  { id: '2', label: 'Tomorrow', date: '2026-05-06' },
  { id: '3', label: 'Thursday', date: '2026-05-07' },
];

const TIME_SLOTS = [
  { id: '1', time: '09:00 AM - 10:00 AM' },
  { id: '2', time: '10:30 AM - 11:30 AM' },
  { id: '3', time: '12:00 PM - 01:00 PM' },
  { id: '4', time: '02:00 PM - 03:00 PM' },
  { id: '5', time: '04:30 PM - 05:30 PM' },
];

const TimeSlotScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};

  const [selectedDate, setSelectedDate] = useState(DATES[0].date);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isBooking, setIsBooking] = useState(false);

  const handleConfirm = async () => {
    if (!selectedSlot) {
      Alert.alert('Selection Required', 'Please select a time slot.');
      return;
    }

    setIsBooking(true);
    try {
      // Mocked slot reservation call
      // await apiService.reserveSlot({ bookingId: params.bookingId, date: selectedDate, slot: selectedSlot.time });

      // After booking slot, proceed to BookingConfirm screen to assign vehicle
      navigation.navigate('BookingConfirm', {
        ...params,
        selectedDate,
        selectedTimeSlot: selectedSlot.time,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not reserve slot.');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, isRTL && styles.textRight]}>Pick a Slot</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
          {DATES.map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[
                styles.dateBubble,
                selectedDate === d.date && styles.dateBubbleSelected
              ]}
              onPress={() => setSelectedDate(d.date)}
            >
              <Text style={[
                styles.dateLabel,
                selectedDate === d.date && styles.dateLabelSelected
              ]}>{d.label}</Text>
              <Text style={[
                styles.dateValue,
                selectedDate === d.date && styles.dateValueSelected
              ]}>{d.date}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionHeading}>Available Times</Text>
        <View style={styles.slotGrid}>
          {TIME_SLOTS.map((slot) => {
            const isSelected = selectedSlot?.id === slot.id;
            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.slotCard,
                  isSelected && styles.slotCardSelected
                ]}
                onPress={() => setSelectedSlot(slot)}
              >
                <Text style={[
                  styles.slotText,
                  isSelected && styles.slotTextSelected
                ]}>{slot.time}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Our driver will arrive at your pickup location within the selected time window. 
            Please ensure your luggage is ready for tagging.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, (!selectedSlot || isBooking) && styles.disabledBtn]}
          disabled={!selectedSlot || isBooking}
          onPress={handleConfirm}
        >
          {isBooking ? (
            <ActivityIndicator color="#0A0A0B" />
          ) : (
            <Text style={styles.confirmBtnText}>Confirm Slot →</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingTop: 60, 
    paddingBottom: 20,
  },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    marginRight: 16,
  },
  backText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  textRight: { textAlign: 'right', marginRight: 0, marginLeft: 16 },
  
  content: { padding: 24, paddingBottom: 40 },
  sectionHeading: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 16, marginTop: 10 },
  
  dateScroll: { flexDirection: 'row', marginBottom: 30 },
  dateBubble: {
    backgroundColor: COLORS.card,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  dateBubbleSelected: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  dateLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  dateLabelSelected: { color: '#08100A' },
  dateValue: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  dateValueSelected: { color: '#08100A' },

  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slotCard: {
    backgroundColor: COLORS.card,
    width: '48%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  slotCardSelected: {
    backgroundColor: '#163A1C',
    borderColor: COLORS.green,
  },
  slotText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  slotTextSelected: { color: COLORS.green, fontWeight: '900' },

  infoBox: {
    backgroundColor: 'rgba(71, 211, 97, 0.1)',
    borderRadius: 14,
    padding: 16,
    marginTop: 30,
    borderWidth: 1,
    borderColor: 'rgba(71, 211, 97, 0.2)',
  },
  infoText: { color: COLORS.green, fontSize: 13, lineHeight: 20, fontWeight: '600' },

  footer: {
    padding: 24,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderColor: COLORS.line,
    paddingBottom: 40,
  },
  confirmBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.5 },
  confirmBtnText: { color: '#0A0A0B', fontWeight: '900', fontSize: 16 },
});

export default TimeSlotScreen;
