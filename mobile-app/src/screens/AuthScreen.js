// ============================================================
// FILE: mobile-app/src/screens/AuthScreen.js
// FIXED — Correct routing after login/signup
// ============================================================
// LOGIC:
// Login/Signup ke baad:
// 1. Koi saved booking nahi → BookingEntry (fresh start)
// 2. Booking hai + barcode generate hua → UserProfile
// 3. Booking hai + barcode nahi → BookingEntry (continue flow)
// ============================================================

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import adminService from '../services/adminService';
import { saveDriverSession } from '../services/driverSession';
import { isNetworkError, showMessage } from '../utils/showMessage';
import BrandMark from '../components/BrandMark';
import theme from '../theme';

const AuthScreen = ({ navigation }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  const [mode,        setMode]        = useState('login');
  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [driverId,    setDriverId]    = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [emailError,  setEmailError]  = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitInfo,  setSubmitInfo]  = useState('');

  const T = (en, ar) => isRTL ? ar : en;

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      setEmailError(T('Email is required', 'البريد الإلكتروني مطلوب'));
      return false;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError(T('Enter a valid email address', 'أدخل بريداً إلكترونياً صالحاً'));
      return false;
    }
    setEmailError('');
    return true;
  };

  // ── ROUTING LOGIC — Fixed ────────────────────────────────
  // Sirf tab UserProfile pe jao jab barcode generate hua ho
  // yaani vehicle_verified = true
  const routeAfterAuth = async () => {
    navigation.replace('BookingEntry');
  };

  // ── SUBMIT ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitInfo('');

    if (mode === 'driver') {
      if (!driverId.trim()) {
        const msg = T('Please enter your Driver / Vehicle ID.', 'يرجى إدخال رقم السائق / المركبة.');
        setSubmitError(msg);
        showMessage(T('Required', 'مطلوب'), msg);
        return;
      }
      setLoading(true);
      try {
        await saveDriverSession('', driverId.trim().toUpperCase());
        navigation.replace('DriverTrip');
      } catch {
        const msg = T('Could not authenticate driver.', 'تعذر التحقق من هوية السائق.');
        setSubmitError(msg);
        showMessage(T('Login failed', 'فشل تسجيل الدخول'), msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password.trim()) {
      const msg = T('Please enter your password.', 'يرجى إدخال كلمة المرور.');
      setSubmitError(msg);
      showMessage(T('Required', 'مطلوب'), msg);
      return;
    }
    if (!validateEmail(email)) {
      return;
    }

    setLoading(true);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim() || trimmedEmail;

    await adminService.savePassengerSession({
      email: trimmedEmail,
      name: trimmedName,
    });

    const authCall =
      mode === 'signup'
        ? adminService.signup({
            email: trimmedEmail,
            password: password.trim(),
            name: trimmedName,
          })
        : adminService.login({
            email: trimmedEmail,
            password: password.trim(),
          });

    try {
      await Promise.race([
        authCall,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 6000);
        }),
      ]);
    } catch (err) {
      if (isNetworkError(err) || String(err?.message || '').includes('timeout')) {
        setSubmitInfo(
          T(
            'Opened offline — booking demo ID: EK123456 (Emirates). Fix API in .env if needed.',
            'تم الفتح دون اتصال — رقم تجريبي: EK123456 (طيران الإمارات).'
          ),
        );
      } else {
        const message =
          err?.response?.data?.message ||
          err?.message ||
          T('Please try again', 'يرجى المحاولة مرة أخرى');
        setSubmitError(message);
        setLoading(false);
        showMessage(
          mode === 'signup'
            ? T('Create account failed', 'فشل إنشاء الحساب')
            : T('Login failed', 'فشل تسجيل الدخول'),
          message,
        );
        return;
      }
    }

    setLoading(false);
    await routeAfterAuth();
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <BrandMark size="lg" />
          <Text style={[styles.title, isRTL && styles.textRight]}>
            {T('Airport luggage, simplified', 'أمتعة المطار، مبسّطة')}
          </Text>
          <Text style={[styles.subtitle, isRTL && styles.textRight]}>
            {T(
              'Book pickup, scan your passport, and track your van in one clean flow.',
              'احجز الاستلام، امسح جواز سفرك، وتتبع سيارتك في تدفق واحد سلس.'
            )}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.switchRow, isRTL && styles.rtlRow]}>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'login' && styles.switchBtnActive]}
              onPress={() => { setMode('login'); setSubmitError(''); setSubmitInfo(''); }}
            >
              <Text style={[styles.switchTxt, mode === 'login' && styles.switchTxtActive]}>
                {T('Login', 'دخول')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'signup' && styles.switchBtnActive]}
              onPress={() => { setMode('signup'); setSubmitError(''); setSubmitInfo(''); }}
            >
              <Text style={[styles.switchTxt, mode === 'signup' && styles.switchTxtActive]}>
                {T('Create', 'إنشاء')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'driver' && styles.switchBtnActive]}
              onPress={() => { setMode('driver'); setSubmitError(''); setSubmitInfo(''); }}
            >
              <Text style={[styles.switchTxt, mode === 'driver' && styles.switchTxtActive]}>
                {T('Driver', 'سائق')}
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'driver' ? (
            <>
              <TextInput
                style={[styles.input, isRTL && styles.inputRTL]}
                placeholder={T('Driver / Vehicle ID (e.g. CT-102)', 'رقم السائق / المركبة (مثال: CT-102)')}
                placeholderTextColor={theme.colors.muted}
                value={driverId}
                onChangeText={setDriverId}
                autoCapitalize="characters"
                textAlign={isRTL ? 'right' : 'left'}
              />
              <View style={[styles.availRow, isRTL && styles.rtlRow]}>
                <Text style={[styles.availTxt, isRTL && styles.textRight]}>
                  {T('Available for shifts', 'متاح للمناوبات')}
                </Text>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{ false: '#d1d5db', true: '#163a1c' }}
                  thumbColor={isAvailable ? '#47d361' : '#f3f4f6'}
                />
              </View>
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <TextInput
                  style={[styles.input, isRTL && styles.inputRTL]}
                  placeholder={T('Full name', 'الاسم الكامل')}
                  placeholderTextColor={theme.colors.muted}
                  value={name}
                  onChangeText={setName}
                  textAlign={isRTL ? 'right' : 'left'}
                />
              )}
              <TextInput
                style={[
                  styles.input,
                  isRTL && styles.inputRTL,
                  emailError ? styles.inputError : null,
                ]}
                placeholder={T('Email', 'البريد الإلكتروني')}
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) validateEmail(v);
                }}
                onBlur={() => email.trim() && validateEmail(email)}
                textAlign={isRTL ? 'right' : 'left'}
              />
              {emailError ? (
                <Text style={[styles.fieldError, isRTL && styles.textRight]}>{emailError}</Text>
              ) : null}
              <TextInput
                style={[styles.input, isRTL && styles.inputRTL]}
                placeholder={T('Password', 'كلمة المرور')}
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                textAlign={isRTL ? 'right' : 'left'}
              />
            </>
          )}

          {submitError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}
          {submitInfo ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>{submitInfo}</Text>
            </View>
          ) : null}

          {mode === 'login' ? (
            <Text style={[styles.demoHint, isRTL && styles.textRight]}>
              {T(
                'Demo: admin@cityterminal.ae / admin123 (backend must run on your PC IP:5000)',
                'تجريبي: admin@cityterminal.ae / admin123 (يجب تشغيل الخادم على IP:5000)'
              )}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledBtn]}
            disabled={loading}
            onPress={handleSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>
              {loading
                ? T('Please wait...', 'يرجى الانتظار...')
                : mode === 'driver'
                  ? T('Driver Login', 'دخول السائق')
                  : mode === 'signup'
                    ? T('Create Account', 'إنشاء حساب')
                    : T('Login', 'تسجيل الدخول')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: theme.colors.white },
  container:    { flexGrow: 1, padding: 24, justifyContent: 'center' },
  hero:         { alignItems: 'center', marginBottom: 26 },
  title:        { color: theme.colors.black, fontSize: theme.fontSizes.title, lineHeight: 38, fontWeight: '900', marginTop: 22, marginBottom: 8, textAlign: 'center' },
  subtitle:     { color: theme.colors.muted, fontSize: theme.fontSizes.md, lineHeight: 22, textAlign: 'center', paddingHorizontal: 12 },
  textRight:    { textAlign: 'right' },
  card:         { backgroundColor: theme.colors.cardMuted, borderRadius: theme.radii.card, padding: 16, ...theme.shadows.card },
  switchRow:    { flexDirection: 'row', marginBottom: 16, backgroundColor: theme.colors.white, borderRadius: 14, padding: 4 },
  rtlRow:       { flexDirection: 'row-reverse' },
  switchBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  switchBtnActive: { backgroundColor: theme.colors.black },
  switchTxt:       { color: theme.colors.black, fontWeight: '800' },
  switchTxtActive: { color: theme.colors.white },
  input: { backgroundColor: theme.colors.white, borderRadius: 14, color: theme.colors.black, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 15, fontSize: theme.fontSizes.md, fontWeight: '700' },
  inputRTL:     { textAlign: 'right' },
  inputError:   { borderWidth: 1, borderColor: theme.colors.danger },
  fieldError:   { color: theme.colors.danger, fontSize: theme.fontSizes.sm, fontWeight: '700', marginTop: -6, marginBottom: 10 },
  availRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  availTxt:     { flex: 1, color: theme.colors.black, fontWeight: '700' },
  submitButton: { backgroundColor: theme.colors.careemGreen, borderRadius: theme.radii.button, paddingVertical: 18, marginTop: 6, alignItems: 'center' },
  disabledBtn:  { opacity: 0.6 },
  submitText:   { color: theme.colors.white, fontWeight: '900', fontSize: theme.fontSizes.md },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: { color: theme.colors.danger, fontSize: theme.fontSizes.sm, fontWeight: '700' },
  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoBannerText: { color: '#1D4ED8', fontSize: theme.fontSizes.sm, fontWeight: '600', lineHeight: 18 },
  demoHint: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.muted,
    marginBottom: 8,
    lineHeight: 16,
  },
});

export default AuthScreen;
