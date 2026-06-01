// ============================================================
// FILE: src/screens/BookingEntryScreen.js
// SCREEN 3 — BOOKING ID ENTRY
// ============================================================
// User yahan apna booking number dalega
// Airline select karega
// Backend se verify hoga
// Sab sahi hone pe Passport Scan Screen pe jaayega
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,        // Text type karne ka field
  TouchableOpacity,
  StyleSheet,
  ScrollView,       // Content zyada hone pe scroll kar sake
  ActivityIndicator, // Loading spinner
  Alert,            // Popup message
  KeyboardAvoidingView, // Keyboard aane pe content upar shift ho
  Platform,         // iOS ya Android check karne ke liye
  StatusBar,
} from 'react-native';

import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import adminService from '../services/adminService';
import PassportScan from './PassportScanScreen'; // Hamara API helper
import BrandMark from '../components/BrandMark';
import FlagImage from '../components/FlagImage';
import theme from '../theme';

// ============================================================
// AIRLINES DATA — Dropdown mein dikhenge
// ============================================================
const AIRLINES = [
  { code: 'EK', name: 'Emirates', countryCode: 'ae' },
  { code: 'FZ', name: 'flydubai', countryCode: 'ae' },
  { code: 'QR', name: 'Qatar Airways', countryCode: 'qa' },
  { code: 'EY', name: 'Etihad Airways', countryCode: 'ae' },
  { code: 'SV', name: 'Saudi Arabian Airlines', countryCode: 'sa' },
  { code: 'AI', name: 'Air India', countryCode: 'in' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
const BookingEntryScreen = ({ navigation }) => {

  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  // ─── STATES ───────────────────────────────────────────────
  // bookingId → User jo number type karega
  const [bookingId, setBookingId] = useState('');

  // selectedAirline → Kaun sa airline choose kiya
  const [selectedAirline, setSelectedAirline] = useState(null);

  // isLoading → API call chal raha hai toh true
  const [isLoading, setIsLoading] = useState(false);

  // error → Koi error hai toh message yahan store hoga
  const [error, setError] = useState('');

  // showAirlineList → Airline dropdown open/close
  const [showAirlineList, setShowAirlineList] = useState(false);

  const isCompletedBooking = (bookingData = {}) => {
    const status = String(bookingData.vehicle_status || bookingData.status || '').toLowerCase();
    const vehicleVerified = bookingData.vehicle_verified === true || bookingData.vehicleVerified === true;
    const hasBarcode = Boolean(bookingData.barcode_data || bookingData.barcodeData);
    return Boolean(vehicleVerified && hasBarcode) ||
      ['barcode_issued', 'en_route_airport', 'at_airport'].includes(status);
  };

  // ─── VALIDATION ───────────────────────────────────────────
  // Check karo ki user ne sab sahi dala hai ya nahi
  const validateInputs = () => {

    // Booking ID khali hai?
    if (!bookingId.trim()) {
      setError(t('bookingEntry.errBookingRequired'));
      return false; // Validation fail
    }

    // Booking ID 6 characters se kam hai?
    if (bookingId.trim().length < 6) {
      setError(t('bookingEntry.errBookingLength'));
      return false;
    }

    // Airline select nahi ki?
    if (!selectedAirline) {
      setError(t('bookingEntry.errAirlineRequired'));
      return false;
    }

    // Sab sahi hai!
    setError(''); // Error clear karo
    return true;  // Validation pass
  };

  // ─── VERIFY BOOKING ──────────────────────────────────────
  // Jab Continue button dabaye — API call karenge
  const handleVerifyBooking = async () => {

    // Pehle validate karo
    if (!validateInputs()) return;

    // Loading start karo — spinner dikhega
    setIsLoading(true);
    setError('');

    try {
      // ── API CALL ──────────────────────────────────────────
      // apiService.verifyBooking → backend ko request bhejta hai
      // Backend PostgreSQL mein check karta hai kya yeh booking valid hai
      const result = await apiService.verifyBooking({
        bookingId: bookingId.trim().toUpperCase(), // Capital letters mein bhejo
        airlineCode: selectedAirline.code,
      });

      // ── SUCCESS ───────────────────────────────────────────
      if (result.valid) {
        const nextBookingId = bookingId.trim().toUpperCase();
        await adminService.saveCurrentBookingId(nextBookingId);

        if (isCompletedBooking(result.bookingData)) {
          navigation.replace('UserProfile', {
            bookingData: result.bookingData,
            bookingId: nextBookingId,
            airline: selectedAirline,
            notice: 'already_boarded',
          });
          return;
        }

        navigation.navigate('PassportScan', {
          bookingData: result.bookingData, // Yahan flight details hain
          bookingId: nextBookingId,
          airline: selectedAirline,
        });
      }

    } catch (err) {
      // ── ERROR ─────────────────────────────────────────────
      // Network error ya invalid booking
      setError(err.message || t('bookingEntry.errBookingNotFound'));

    } finally {
      // ── ALWAYS CHALEGA ────────────────────────────────────
      // Success ho ya fail — loading band karo
      setIsLoading(false);
    }
  };

  // ─── AIRLINE SELECT ───────────────────────────────────────
  const handleAirlineSelect = (airline) => {
    setSelectedAirline(airline);    // Selected airline save karo
    setShowAirlineList(false);      // Dropdown band karo
    setError('');                   // Error clear karo
  };

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    // KeyboardAvoidingView → Keyboard aane pe form upar shift ho
    // iOS pe 'padding', Android pe 'height' use hota hai
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ScrollView → Content zyada ho toh scroll karo */}
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" // Keyboard open ho tab bhi tap kaam kare
      >
        <StatusBar barStyle="dark-content" backgroundColor={theme.colors.white} />

        {/* UAE / Dubai inspired decorative background */}
        <View pointerEvents="none" style={styles.themeBackdrop}>
          <View style={styles.flagStripeRed} />
          <View style={styles.flagStripeGreen} />
          <View style={styles.flagStripeWhite} />
          <View style={styles.flagStripeBlack} />
          <View style={styles.skylineWrap}>
            <View style={[styles.skylineTower, styles.towerShort]} />
            <View style={[styles.skylineTower, styles.towerMedium]} />
            <View style={[styles.skylineTower, styles.towerTall]} />
            <View style={[styles.skylineTower, styles.towerBurj]} />
            <View style={[styles.skylineTower, styles.towerMedium]} />
            <View style={[styles.skylineTower, styles.towerShort]} />
          </View>
        </View>


        {/* ── HEADER ── */}
        <View style={styles.header}>

          {/* Back button → Language Select pe wapas */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()} // Stack se previous screen
          >
            <Text style={styles.backArrow}>{isRTL ? '→' : '←'}</Text>
          </TouchableOpacity>

          {/* Step indicator — 1 of 5 */}
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>{t('bookingEntry.step')}</Text>
          </View>

        </View>

        {/* ── TITLE AREA ── */}
        <View style={styles.titleArea}>
          <BrandMark size="md" stacked={false} />
          <Text style={[styles.title, isRTL && styles.textRight]}>{t('bookingEntry.title')}</Text>
          <Text style={[styles.subtitle, isRTL && styles.textRight]}>
            {t('bookingEntry.subtitle')}
          </Text>
        </View>

        {/* ── FORM AREA ── */}
        <View style={styles.form}>

          {/* BOOKING ID INPUT */}
          <View style={styles.inputGroup}>

            <Text style={[styles.label, isRTL && styles.textRight]}>{t('bookingEntry.bookingLabel')}</Text>

            {/* TextInput → User type karega yahan */}
            <TextInput
              style={[
                styles.input,
                error && !selectedAirline ? styles.inputError : null, // Error pe red border
              ]}
              placeholder={t('bookingEntry.bookingPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={bookingId}            // State se value aati hai
              onChangeText={(text) => {    // Jab type kare tab state update karo
                setBookingId(text);
                setError(''); // Type karte time error clear ho
              }}
              autoCapitalize="characters"  // Automatic uppercase
              autoCorrect={false}          // Autocorrect band karo
              maxLength={10}               // Max 10 characters
              textAlign={isRTL ? 'right' : 'left'}
            />

            {/* Helper text */}
            <Text style={[styles.helperText, isRTL && styles.textRight]}>
              {t('bookingEntry.bookingHelper')}
            </Text>

          </View>

          {/* AIRLINE SELECTOR */}
          <View style={styles.inputGroup}>

            <Text style={[styles.label, isRTL && styles.textRight]}>{t('bookingEntry.airlineLabel')}</Text>

            {/* Dropdown trigger button */}
            <TouchableOpacity
              style={[
                styles.dropdown,
                showAirlineList && styles.dropdownOpen, // Open hone pe blue border
                isRTL && styles.rowReverse,
              ]}
              onPress={() => setShowAirlineList(!showAirlineList)} // Toggle
            >
              {selectedAirline ? (
                <View style={[styles.dropdownSelectedRow, isRTL && styles.rowReverse]}>
                  <FlagImage countryCode={selectedAirline.countryCode} size={28} />
                  <Text style={[styles.dropdownSelected, isRTL && styles.textRight]}>
                    {selectedAirline.name}
                  </Text>
                </View>
              ) : (
                // Kuch select nahi → placeholder
                <Text style={[styles.dropdownPlaceholder, isRTL && styles.textRight]}>
                  {t('bookingEntry.airlinePlaceholder')}
                </Text>
              )}

              {/* Arrow icon — open/close indicator */}
              <Text style={styles.dropdownArrow}>
                {showAirlineList ? '▲' : '▼'}
              </Text>

            </TouchableOpacity>

            {/* AIRLINE LIST — Sirf tab dikhega jab showAirlineList true ho */}
            {showAirlineList && (
              <View style={styles.airlineList}>
                {AIRLINES.map((airline) => (
                  <TouchableOpacity
                    key={airline.code} // Unique key
                    style={[
                      styles.airlineItem,
                      isRTL && styles.rowReverse,
                      // Selected airline ko highlight karo
                      selectedAirline?.code === airline.code &&
                        styles.airlineItemSelected,
                    ]}
                    onPress={() => handleAirlineSelect(airline)}
                  >
                    <FlagImage countryCode={airline.countryCode} size={30} />
                    <Text style={[styles.airlineName, isRTL && styles.textRight]}>{airline.name}</Text>
                    <Text style={styles.airlineCode}>{airline.code}</Text>
                    {/* Selected tick */}
                    {selectedAirline?.code === airline.code && (
                      <Text style={styles.airlineTick}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </View>

          {/* ERROR MESSAGE */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          ) : null}

          {/* CONTINUE BUTTON */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              // Loading chal raha ho ya inputs empty ho toh disabled
              (isLoading || !bookingId || !selectedAirline) &&
                styles.continueDisabled,
            ]}
            onPress={handleVerifyBooking}
            disabled={isLoading} // Loading time pe press nahi hoga
          >
            {isLoading ? (
              // Loading spinner dikhao
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.continueText}>
                {isRTL ? `← ${t('bookingEntry.verifyButton')}` : `${t('bookingEntry.verifyButton')} →`}
              </Text>
            )}
          </TouchableOpacity>

          {/* DEMO HELPER — Testing ke liye */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={() => {
              // Demo data fill karo automatically
              setBookingId('EK123456');
              setSelectedAirline(AIRLINES[0]); // Emirates
            }}
          >
            <Text style={styles.demoText}>{t('bookingEntry.demoButton')}</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({

  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },

  container: {
    flex: 1,
    paddingHorizontal: 24,
    position: 'relative',
  },

  themeBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  flagStripeRed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: theme.colors.careemGreen,
    borderRadius: 8,
  },
  flagStripeGreen: {
    position: 'absolute',
    top: 0,
    left: 18,
    right: 18,
    height: 3,
    backgroundColor: theme.colors.careemGreen,
    opacity: 0.95,
    borderRadius: 4,
  },
  flagStripeWhite: {
    position: 'absolute',
    top: 6,
    left: 18,
    right: 18,
    height: 2,
    backgroundColor: '#F8F8F8',
    opacity: 0.8,
    borderRadius: 4,
  },
  flagStripeBlack: {
    position: 'absolute',
    top: 10,
    left: 18,
    right: 18,
    height: 2,
    backgroundColor: theme.colors.black,
    opacity: 0.9,
    borderRadius: 4,
  },
  skylineWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    opacity: 0.23,
  },
  skylineTower: {
    width: 24,
    backgroundColor: '#E7EAEE',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  towerShort: {
    height: 54,
  },
  towerMedium: {
    height: 92,
  },
  towerTall: {
    height: 128,
  },
  towerBurj: {
    width: 18,
    height: 186,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: '#F2F4F7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    marginBottom: 32,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  backArrow: {
    fontSize: 20,
    color: theme.colors.black,
  },

  stepBadge: {
    backgroundColor: theme.colors.cardMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  stepText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.black,
  },

  // Title
  titleArea: {
    marginBottom: 32,
    gap: 18,
  },

  title: {
    fontSize: theme.fontSizes.title,
    fontWeight: '900',
    color: theme.colors.black,
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 20,
  },

  // Form
  form: {
    gap: 20,
    paddingBottom: 40,
  },

  inputGroup: {
    gap: 8,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.black,
  },

  input: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: theme.colors.black,
    borderWidth: 1.5,
    borderColor: 'transparent',
    fontWeight: '500',
    letterSpacing: 1,
  },

  inputError: {
    borderColor: '#EF4444',
  },

  helperText: {
    fontSize: 12,
    color: theme.colors.muted,
  },

  // Dropdown
  dropdown: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownOpen: {
    borderColor: theme.colors.careemGreen,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  dropdownSelectedRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownSelected: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },

  dropdownPlaceholder: {
    fontSize: 15,
    color: '#94A3B8',
  },

  dropdownArrow: {
    fontSize: 12,
    color: '#D1D5DB',
  },

  // Airline list
  airlineList: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: theme.colors.careemGreen,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },

  airlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: '#2B2F36',
    gap: 12,
  },

  airlineItemSelected: {
    backgroundColor: theme.colors.cardMuted,
  },

  airlineName: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '500',
  },

  airlineCode: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.muted,
    letterSpacing: 0.5,
  },

  airlineTick: {
    fontSize: 16,
    color: theme.colors.careemGreen,
    fontWeight: 'bold',
  },

  // Error box
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  errorText: {
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },

  // Buttons
  continueButton: {
    backgroundColor: theme.colors.careemGreen,
    borderRadius: theme.radii.button,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },

  continueDisabled: {
    backgroundColor: '#6B7280',
  },

  continueText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  demoButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },

  demoText: {
    fontSize: 13,
    color: theme.colors.black,
    textDecorationLine: 'underline',
  },
  textRight: {
    textAlign: 'right',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },

});

export default BookingEntryScreen;
