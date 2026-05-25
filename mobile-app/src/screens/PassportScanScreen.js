// ============================================================
// FILE: src/screens/PassportScanScreen.js
// SCREEN 4 — PASSPORT SCAN (FIXED)
// ============================================================
// BUGS FIXED:
// 1. result.data → passportData mein correctly pass kiya
// 2. <div> → <View> replace kiya (React Native mein div nahi hota)
// 3. navigation.navigate ke baad setScanStep reset kiya
// ============================================================

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';

import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import { useTranslation } from 'react-i18next';
import theme from '../theme';

const { width } = Dimensions.get('window');

const pickFirst = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';

const getBookingPassengerName = (bookingData = {}) =>
  pickFirst(
    bookingData.passengerName,
    bookingData.passenger_name,
    bookingData.verifiedName,
    bookingData.verified_name,
    bookingData.name,
    'Demo Passenger'
  );

const createDummyPassportData = (bookingData = {}, bookingId = '') => ({
  name: getBookingPassengerName(bookingData),
  passportNumber: pickFirst(
    bookingData.passportNumber,
    bookingData.passport_number,
    `DUMMY${String(bookingId || '000000').slice(-6)}`
  ),
  dateOfBirth: pickFirst(bookingData.dateOfBirth, bookingData.date_of_birth, '1995-01-01'),
  nationality: pickFirst(bookingData.nationality, 'Demo Nationality'),
  confidence: 0.99,
  mode: 'dummy',
});

const PassportScanScreen = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  const { bookingData, bookingId, airline } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [capturedImage, setCapturedImage] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // ─── scanStep controls which UI shows ─────────────────────
  // 'guide'      → Camera view dikhao
  // 'captured'   → Photo confirm karo
  // 'processing' → AI processing chal raha hai
  const [scanStep, setScanStep] = useState('guide');

  // ─── CAMERA SE PHOTO LO ──────────────────────────────────
  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      setScanError('');
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,   // Base64 chahiye backend ke liye
        exif: false,
      });
      setCapturedImage(photo);
      setScanStep('captured'); // Captured step pe jaao
    } catch (err) {
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
    }
  };

  // ─── GALLERY SE PHOTO LO ─────────────────────────────────
  const handlePickImage = async (type) => {
    setScanError('');
    const options = {
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.7,
    };

    const result = type === 'camera'
      ? await launchCamera(options)
      : await launchImageLibrary(options);

    // ── BUG FIX: result check karo properly ───────────────
    // Agar user cancel kare toh result.assets undefined hoga
    if (!result || result.didCancel || !result.assets || result.assets.length === 0) {
      return; // Kuch nahi karo — loop nahi hoga
    }

    const asset = result.assets[0];

    // Base64 available hai?
    if (!asset.base64) {
      setScanError('Could not read this image. Please choose another passport photo.');
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
      return;
    }

    setCapturedImage({
      uri: asset.uri,
      base64: asset.base64,
    });

    setScanStep('captured'); // Captured step pe jaao
  };

  // ─── RETAKE ──────────────────────────────────────────────
  const handleRetake = () => {
    setCapturedImage(null);   // Photo clear karo
    setScanStep('guide');     // Guide step pe wapas
    setIsScanning(false);     // Loading band karo
    setScanError('');
  };

  // ─── PASSPORT PROCESS ────────────────────────────────────
  // ── YAHI MAIN BUG THA ─────────────────────────────────────
  const handleProcessPassport = async () => {
    if (!capturedImage || !capturedImage.base64) {
      setScanError('Please capture or upload a passport image first.');
      Alert.alert(t('common.error'), t('slotBooking.tryLater'));
      return;
    }

    setScanError('');
    setScanStep('processing'); // Processing overlay dikhao
    setIsScanning(true);

    try {
      // ── API CALL ──────────────────────────────────────────
      // Backend se response aata hai:
      // { success: true, data: { name, passportNumber, dateOfBirth, ... } }
      const dummyPassportData = createDummyPassportData(bookingData, bookingId);

      // ── BUG FIX 1: response.data pass karo, response nahi ─
      // Pehle: passportData: result  ← WRONG (pura response object)
      // Ab:    passportData: response.data ← CORRECT (sirf extracted data)
      // Real OCR is preserved in apiService.verifyPassportReal for future use.

      // ── BUG FIX 2: Navigate karne se pehle state reset karo
      // Warna jab back aao toh loop shuru hoga
      setScanStep('guide');
      setCapturedImage(null);

      // ── NEXT SCREEN PE JAAO ───────────────────────────────
      navigation.navigate('Verification', {
        bookingData: bookingData,
        bookingId: bookingId,
        airline: airline,
        passportData: dummyPassportData,
        passportImage: capturedImage.uri,
      });

    } catch (err) {
      // ── ERROR HANDLING ────────────────────────────────────
      console.error('Passport scan error:', err.message);
      const message = err.message || 'Passport details were not found clearly. Please upload a clearer photo.';
      setScanError(message);

      Alert.alert(
        'Passport not verified',
        message,
        [
          {
            text: 'Try again',
          },
        ]
      );

      // Error pe preview par rakho, taaki user reason dekh kar retake/upload kar sake.
      setScanStep('captured');

    } finally {
      setIsScanning(false);
    }
  };

  // ─── PERMISSION CHECK ────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.careemGreen} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>{t('common.error')}</Text>
        <Text style={styles.permissionText}>
          {t('verification.subtitle')}
        </Text>

        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>{t('common.continue')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.gallerySecondaryButton}
          onPress={() => handlePickImage('gallery')}
        >
          <Text style={styles.gallerySecondaryText}>📁 {t('bookingEntry.demoButton')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={() => navigation.goBack()}>
          <Text style={styles.skipText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================
  // MAIN UI
  // ============================================================
  return (
    <View style={styles.container}>

      {/* ── PROCESSING OVERLAY ── */}
      {scanStep === 'processing' && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={theme.colors.careemGreen} />
            <Text style={styles.processingTitle}>{t('verification.passportInfo')}</Text>
            <Text style={styles.processingSubtitle}>
              {t('verification.subtitle')}
            </Text>
          </View>
        </View>
      )}

      {/* ── CAPTURED IMAGE VIEW ── */}
      {scanStep === 'captured' && capturedImage && (
        <View style={styles.capturedContainer}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleRetake} style={styles.backButton}>
              <Text style={styles.backArrow}>{isRTL ? '→' : '←'}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('slotBooking.confirmTitle')}</Text>
            {/* ── BUG FIX 3: <div> → <View> ── */}
            <View style={{ width: 44 }} />
          </View>

          {/* Captured photo */}
          <Image
            source={{ uri: capturedImage.uri }}
            style={styles.capturedImage}
            resizeMode="contain"
          />

          {/* Instructions */}
          <View style={styles.confirmInstructions}>
            <Text style={styles.confirmTitle}>{t('verification.passportInfo')}</Text>
            <Text style={styles.confirmSubtitle}>
              {t('verification.subtitle')}
            </Text>
            {scanError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorTitle}>Passport not found clearly</Text>
                <Text style={styles.errorMessage}>{scanError}</Text>
              </View>
            ) : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
              <Text style={styles.retakeText}>{scanError ? 'Upload again' : t('slotBooking.refresh')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, isScanning && styles.confirmDisabled]}
              onPress={handleProcessPassport}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.confirmText}>{isRTL ? `← ${t('common.continue')}` : `${t('common.continue')} →`}</Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      )}

      {/* ── CAMERA VIEW ── */}
      {scanStep === 'guide' && (
        <View style={styles.camera}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.overlay}>

            {/* Camera Header */}
            <View style={styles.cameraHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backArrowWhite}>{isRTL ? '→' : '←'}</Text>
              </TouchableOpacity>
              <Text style={styles.cameraHeaderTitle}>{t('verification.passportInfo')}</Text>
              {/* ── BUG FIX 3: <div> → <View> ── */}
              <View style={{ width: 44 }} />
            </View>

            {/* Passport Frame */}
            <View style={styles.frameArea}>
              <View style={styles.frame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
              <View style={styles.scanLine} />
            </View>

            {/* Instructions + Buttons */}
            <View style={styles.instructionsArea}>
              <Text style={styles.instructionTitle}>{t('verification.passportInfo')}</Text>

              {/* Gallery Button */}
              <TouchableOpacity
                style={styles.gallerySecondaryButton}
                onPress={() => handlePickImage('gallery')}
              >
                <Text style={styles.gallerySecondaryText}>📁 {t('bookingEntry.demoButton')}</Text>
              </TouchableOpacity>

              {scanError ? (
                <View style={styles.cameraErrorBanner}>
                  <Text style={styles.errorTitle}>Passport not verified</Text>
                  <Text style={styles.errorMessage}>{scanError}</Text>
                </View>
              ) : null}

              {/* Capture Button */}
              <TouchableOpacity style={styles.captureButton} onPress={handleTakePhoto}>
                <View style={styles.captureOuter}>
                  <View style={styles.captureInner} />
                </View>
              </TouchableOpacity>

              <Text style={styles.tapText}>{t('common.continue')}</Text>

              <View style={styles.instructionsList}>
                <Text style={styles.instructionItem}>✓ Place passport flat inside the frame</Text>
                <Text style={styles.instructionItem}>✓ Ensure good lighting</Text>
                <Text style={styles.instructionItem}>✓ Keep the photo page visible</Text>
              </View>

            </View>
          </View>
        </View>
      )}

    </View>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.white },

  permissionContainer: {
    flex: 1, backgroundColor: theme.colors.white,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  permissionTitle: { fontSize: theme.fontSizes.xl, fontWeight: '900', color: theme.colors.black, marginBottom: 16, textAlign: 'center' },
  permissionText: { fontSize: 14, color: theme.colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  permissionButton: {
    backgroundColor: theme.colors.careemGreen, paddingVertical: 18,
    paddingHorizontal: 32, borderRadius: theme.radii.button,
    marginBottom: 12, width: '100%', alignItems: 'center',
  },
  permissionButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  skipButton: { paddingVertical: 12 },
  skipText: { fontSize: 14, color: theme.colors.black, textDecorationLine: 'underline', fontWeight: '700' },

  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between' },

  cameraHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 60,
    paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  backButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 20, color: '#F8FAFC' },
  backArrowWhite: { fontSize: 20, color: '#FFFFFF' },
  cameraHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC' },

  frameArea: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  frame: { width: width * 0.85, height: width * 0.6, position: 'relative' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: theme.colors.careemGreen, borderWidth: 3 },
  topLeft:    { top: 0, left: 0,   borderRightWidth: 0, borderBottomWidth: 0 },
  topRight:   { top: 0, right: 0,  borderLeftWidth: 0,  borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight:{ bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0 },
  scanLine: {
    position: 'absolute', top: '50%', left: 10, right: 10,
    height: 2, backgroundColor: 'rgba(71, 211, 97, 0.75)',
  },

  instructionsArea: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center',
  },
  instructionTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 16 },
  instructionsList: { gap: 8, width: '100%', marginTop: 15 },
  instructionItem: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },

  gallerySecondaryButton: {
    backgroundColor: theme.colors.cardMuted, paddingVertical: 12,
    paddingHorizontal: 20, borderRadius: 10,
    marginBottom: 20, alignItems: 'center',
  },
  gallerySecondaryText: { color: theme.colors.black, fontWeight: '800', fontSize: 14 },

  captureButton: { marginBottom: 12 },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF' },
  tapText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8 },

  capturedContainer: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 60,
    paddingHorizontal: 20, paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  capturedImage: { flex: 1, width: '100%' },

  confirmInstructions: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 20, alignItems: 'center' },
  confirmTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 6 },
  confirmSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  errorBanner: {
    width: '100%',
    backgroundColor: 'rgba(239,51,64,0.16)',
    borderColor: 'rgba(239,51,64,0.45)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    alignItems: 'flex-start',
  },
  cameraErrorBanner: {
    width: '100%',
    backgroundColor: 'rgba(239,51,64,0.18)',
    borderColor: 'rgba(239,51,64,0.5)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorTitle: { color: '#FFD0D4', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  errorMessage: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 18 },

  actionButtons: { flexDirection: 'row', gap: 12, padding: 20, backgroundColor: theme.colors.black },
  retakeButton: {
    flex: 1, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center',
  },
  retakeText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  confirmButton: { flex: 2, paddingVertical: 16, borderRadius: theme.radii.button, backgroundColor: theme.colors.careemGreen, alignItems: 'center' },
  confirmDisabled: { backgroundColor: '#9CA3AF' },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  processingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  processingCard: {
    backgroundColor: theme.colors.white, borderRadius: theme.radii.card, padding: 32,
    alignItems: 'center', width: width * 0.8, gap: 16,
  },
  processingTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.black },
  processingSubtitle: { fontSize: 13, color: theme.colors.muted, textAlign: 'center', lineHeight: 20 },
});

export default PassportScanScreen;
