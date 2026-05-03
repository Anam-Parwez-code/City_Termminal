// ============================================================
// FILE: src/screens/VerificationScreen.js
// FINAL FIX — Passport update completely hataya
// Seedha SlotBooking pe navigate karo
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const VerificationScreen = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const bookingData = params.bookingData || {};
  const bookingId = params.bookingId || '';
  const airline = params.airline || null;
  const passportData = params.passportData || {};
  const passportImage = params.passportImage || null;
  const [resolvedBookingData, setResolvedBookingData] = useState(bookingData || {});

  const [name, setName] = useState(passportData?.name || '');
  const [passportNo, setPassportNo] = useState(passportData?.passportNumber || '');
  const [dob, setDob] = useState(passportData?.dateOfBirth || '');
  const [nationality, setNationality] = useState(passportData?.nationality || '');
  const [editField, setEditField] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const enrichBookingData = async () => {
      if (!bookingId) return;
      if (bookingData?.destination && bookingData?.departureTime) return;
      try {
        const result = await apiService.getBookingDetails(bookingId);
        const booking = result?.booking || {};
        if (!mounted) return;
        setResolvedBookingData((prev) => ({
          ...prev,
          flightNumber: prev?.flightNumber || booking.flight_number || booking.flightNumber || '',
          destination: prev?.destination || booking.destination || booking.to_city || booking.arrival_city || '',
          departureTime: prev?.departureTime || booking.departure_time || booking.departureTime || '',
        }));
      } catch (_err) {
        // Keep existing booking data if details API fails.
      }
    };
    enrichBookingData();
    return () => {
      mounted = false;
    };
  }, [bookingId, bookingData]);

  const mergedBookingData = useMemo(
    () => ({ ...(bookingData || {}), ...(resolvedBookingData || {}) }),
    [bookingData, resolvedBookingData]
  );

  // ── CONFIRM — SEEDHA SLOT BOOKING PE JAO ─────────────────
  // Passport update backend call NAHI karein
  // Sirf data carry karein aur aage jaao
  const handleConfirm = async () => {
    setIsLoading(true);

    apiService.updatePassportData({
      bookingId,
      passportNumber: passportNo.trim(),
      verifiedName: name.trim(),
      dateOfBirth: dob.trim(),
      nationality: nationality.trim(),
    }).catch(() => {
      // Optional persistence should never block the booking flow.
    });

    // Chhota delay — loading dikhao — phir navigate
    setTimeout(() => {
      navigation.navigate('LocationPick', {
        bookingId,
        airline,
        bookingData: {
          ...mergedBookingData,
          passengerName: name.trim(),
          passportNumber: passportNo.trim(),
          dateOfBirth: dob.trim(),
          nationality: nationality.trim(),
        },
      });
    }, 500);
  };

  // ── INFO FIELD COMPONENT ──────────────────────────────────
  const InfoField = ({ label, value, field, onChangeText }) => {
    const isEditing = editField === field;
    return (
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldRow}>
          {isEditing ? (
            <TextInput
              style={styles.fieldInput}
              value={value}
              onChangeText={onChangeText}
              autoFocus
              onBlur={() => setEditField(null)}
            />
          ) : (
            <Text style={[styles.fieldValue, isRTL && styles.textRight]}>{value || t('verification.notDetected')}</Text>
          )}
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditField(isEditing ? null : field)}
          >
            <Text style={styles.editButtonText}>{isEditing ? '✓' : '✎'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.contentContainer}
    >

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>{t('verification.step')}</Text>
        </View>
      </View>

      {/* TITLE */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, isRTL && styles.textRight]}>{t('verification.title')}</Text>
        <Text style={[styles.subtitle, isRTL && styles.textRight]}>
          {t('verification.subtitle')}
        </Text>
      </View>

      {/* PASSPORT IMAGE */}
      {passportImage && (
        <View style={styles.passportImageContainer}>
          <Image
            source={{ uri: passportImage }}
            style={styles.passportThumbnail}
            resizeMode="cover"
          />
          <View style={styles.aiTag}>
            <Text style={styles.aiTagText}>🤖 AI Extracted</Text>
          </View>
        </View>
      )}

      {/* PASSPORT INFO */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t('verification.passportInfo')}</Text>
        <InfoField label={t('verification.fullName')} value={name} field="name" onChangeText={setName} />
        <InfoField label={t('verification.passportNumber')} value={passportNo} field="passportNo" onChangeText={setPassportNo} />
        <InfoField label={t('verification.dateOfBirth')} value={dob} field="dob" onChangeText={setDob} />
        <InfoField label={t('verification.nationality')} value={nationality} field="nationality" onChangeText={setNationality} />
      </View>

      {/* FLIGHT INFO */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>{t('verification.flightInfo')}</Text>
        <View style={styles.flightCard}>
          <View style={styles.flightRow}>
            <Text style={styles.flightLabel}>{t('verification.flight')}</Text>
            <Text style={styles.flightValue}>{airline?.flag} {mergedBookingData?.flightNumber}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.flightRow}>
            <Text style={styles.flightLabel}>{t('verification.destination')}</Text>
            <Text style={styles.flightValue}>{mergedBookingData?.destination || t('verification.na')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.flightRow}>
            <Text style={styles.flightLabel}>{t('verification.departure')}</Text>
            <Text style={styles.flightValue}>{mergedBookingData?.departureTime || t('verification.na')}</Text>
          </View>
        </View>
      </View>

      {/* CONFIRM BUTTON */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={[styles.confirmButton, isLoading && styles.confirmDisabled]}
          onPress={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>{isRTL ? `← ${t('verification.confirmAndBook')}` : `${t('verification.confirmAndBook')} →`}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rescanButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.rescanText}>{t('verification.rescan')}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: theme.colors.white },
  container: { flex: 1, backgroundColor: theme.colors.white, paddingHorizontal: 24 },
  contentContainer: { paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, marginBottom: 24 },
  backButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.cardMuted, alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  backArrow: { fontSize: 20, color: theme.colors.black },
  stepBadge: { backgroundColor: theme.colors.cardMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  stepText: { fontSize: 12, fontWeight: '600', color: theme.colors.black },
  titleArea: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: theme.colors.black, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.muted, lineHeight: 20 },
  passportImageContainer: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  passportThumbnail: { width: '100%', height: 160, borderRadius: 16 },
  aiTag: { position: 'absolute', top: 12, right: 12, backgroundColor: theme.colors.careemGreen, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  aiTagText: { fontSize: 11, color: theme.colors.white, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.black, marginBottom: 12 },
  fieldContainer: { backgroundColor: theme.colors.cardMuted, borderRadius: 14, padding: 16, marginBottom: 8, shadowColor: theme.colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: 'transparent' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  fieldValue: { flex: 1, fontSize: 16, fontWeight: '500', color: theme.colors.black },
  fieldInput: { flex: 1, fontSize: 16, fontWeight: '500', color: theme.colors.black, borderBottomWidth: 1.5, borderBottomColor: theme.colors.careemGreen, paddingVertical: 4 },
  editButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.white, alignItems: 'center', justifyContent: 'center' },
  editButtonText: { fontSize: 14, color: theme.colors.careemGreen },
  flightCard: { backgroundColor: theme.colors.cardMuted, borderRadius: 16, padding: 20, shadowColor: theme.colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: 'transparent' },
  flightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  flightLabel: { fontSize: 13, color: theme.colors.muted },
  flightValue: { fontSize: 15, fontWeight: '600', color: theme.colors.black },
  divider: { height: 0.5, backgroundColor: theme.colors.line },
  bottomArea: { gap: 12, paddingBottom: 40 },
  confirmButton: { backgroundColor: theme.colors.careemGreen, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  confirmDisabled: { backgroundColor: theme.colors.muted },
  confirmText: { fontSize: 17, fontWeight: '700', color: theme.colors.white },
  rescanButton: { alignItems: 'center', paddingVertical: 8 },
  rescanText: { fontSize: 14, color: theme.colors.careemGreen, textDecorationLine: 'underline' },
  textRight: { textAlign: 'right' },
});

export default VerificationScreen;
