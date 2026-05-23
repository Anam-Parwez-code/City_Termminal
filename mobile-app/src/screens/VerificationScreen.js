// ============================================================
// FILE: src/screens/VerificationScreen.js
// FINAL FIX — Passport update completely hataya
// Seedha SlotBooking pe navigate karo
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  panel: '#101215',
  line: '#2A2F36',
  green: '#47D361',
  amber: '#F5A623',
  red: '#EF3340',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const normalizeName = (value) =>
  String(value || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const namesMatch = (passportName, bookingName) => {
  const pass = normalizeName(passportName);
  const book = normalizeName(bookingName);
  if (!pass || !book) return false;
  if (pass === book) return true;
  const passParts = pass.split(' ').filter((part) => part.length > 1);
  const bookParts = book.split(' ').filter((part) => part.length > 1);
  const matches = bookParts.filter((part) => passParts.includes(part)).length;
  return matches >= Math.min(2, bookParts.length);
};

const ConfidenceMeter = ({ score = 0, isRTL }) => {
  const pct = Math.max(0, Math.min(1, Number(score) || 0));
  const level = pct > 0.85 ? 'high' : pct >= 0.6 ? 'medium' : 'low';
  const color = level === 'high' ? COLORS.green : level === 'medium' ? COLORS.amber : COLORS.red;
  const message = {
    high: isRTL ? 'ثقة عالية - تم التحقق من البيانات' : 'High confidence - data verified',
    medium: isRTL ? 'ثقة متوسطة - يرجى المراجعة' : 'Medium confidence - please review',
    low: isRTL ? 'ثقة منخفضة - يفضل إعادة التصوير' : 'Low confidence - retake recommended',
  }[level];

  return (
    <View style={styles.confidenceCard}>
      <View style={styles.confidenceTop}>
        <Text style={[styles.confidenceLabel, isRTL && styles.textRight]}>{message}</Text>
        <Text style={[styles.confidenceScore, { color }]}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={styles.confidenceTrack}>
        <View style={[styles.confidenceFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

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
  const bookingPassengerName =
    mergedBookingData?.passengerName ||
    mergedBookingData?.passenger_name ||
    mergedBookingData?.name ||
    '';
  const hasVisibleRequiredData = Boolean(name?.trim() && passportNo?.trim() && dob?.trim() && nationality?.trim());
  const nameMatchesBooking = bookingPassengerName ? namesMatch(name, bookingPassengerName) : true;
  const canVerifyPassport = hasVisibleRequiredData && nameMatchesBooking;

  // ── CONFIRM — SEEDHA SLOT BOOKING PE JAO ─────────────────
  // Passport update backend call NAHI karein
  // Sirf data carry karein aur aage jaao
  const handleConfirm = async () => {
    if (!hasVisibleRequiredData) {
      Alert.alert('Passport not found', 'Name, passport number, date of birth and nationality must be visible before verification.');
      return;
    }
    if (!nameMatchesBooking) {
      Alert.alert('Passport not matched', 'Passport name does not match the booking passenger name.');
      return;
    }

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

      <ConfidenceMeter score={passportData?.confidence} isRTL={isRTL} />

      {!canVerifyPassport ? (
        <View style={styles.warningBox}>
          <Text style={[styles.warningText, isRTL && styles.textRight]}>
            {!hasVisibleRequiredData
              ? 'Passport details not found clearly. Please retake or edit only after checking the document.'
              : 'Passport name does not match the booking passenger name.'}
          </Text>
        </View>
      ) : null}

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
          style={[styles.confirmButton, (!canVerifyPassport || isLoading) && styles.confirmDisabled]}
          onPress={handleConfirm}
          disabled={!canVerifyPassport || isLoading}
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
  keyboardView: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 24 },
  contentContainer: { paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, marginBottom: 24 },
  backButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  backArrow: { fontSize: 20, color: COLORS.text },
  stepBadge: { backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line },
  stepText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  titleArea: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.muted, lineHeight: 20 },
  confidenceCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.line, marginBottom: 14 },
  confidenceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  confidenceLabel: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '800' },
  confidenceScore: { fontSize: 16, fontWeight: '900' },
  confidenceTrack: { height: 8, borderRadius: 999, backgroundColor: '#2E3138', overflow: 'hidden' },
  confidenceFill: { height: '100%', borderRadius: 999 },
  warningBox: { backgroundColor: 'rgba(239,51,64,0.12)', borderWidth: 1, borderColor: 'rgba(239,51,64,0.35)', borderRadius: 14, padding: 14, marginBottom: 18 },
  warningText: { color: '#FFD0D4', fontSize: 13, fontWeight: '700', lineHeight: 19 },
  passportImageContainer: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  passportThumbnail: { width: '100%', height: 160, borderRadius: 16 },
  aiTag: { position: 'absolute', top: 12, right: 12, backgroundColor: COLORS.green, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  aiTagText: { fontSize: 11, color: '#08100A', fontWeight: '800' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  fieldContainer: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: COLORS.line },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  fieldValue: { flex: 1, fontSize: 16, fontWeight: '500', color: COLORS.text },
  fieldInput: { flex: 1, fontSize: 16, fontWeight: '500', color: COLORS.text, borderBottomWidth: 1.5, borderBottomColor: COLORS.green, paddingVertical: 4 },
  editButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.panel, alignItems: 'center', justifyContent: 'center' },
  editButtonText: { fontSize: 14, color: COLORS.green },
  flightCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.line },
  flightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  flightLabel: { fontSize: 13, color: COLORS.muted },
  flightValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  divider: { height: 0.5, backgroundColor: COLORS.line },
  bottomArea: { gap: 12, paddingBottom: 40 },
  confirmButton: { backgroundColor: COLORS.green, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  confirmDisabled: { backgroundColor: '#2E3138' },
  confirmText: { fontSize: 17, fontWeight: '700', color: '#08100A' },
  rescanButton: { alignItems: 'center', paddingVertical: 8 },
  rescanText: { fontSize: 14, color: COLORS.green, textDecorationLine: 'underline' },
  textRight: { textAlign: 'right' },
});

export default VerificationScreen;
