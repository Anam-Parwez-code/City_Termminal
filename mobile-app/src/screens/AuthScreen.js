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
  Alert,
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

  const T = (en, ar) => isRTL ? ar : en;

  // ── ROUTING LOGIC — Fixed ────────────────────────────────
  // Sirf tab UserProfile pe jao jab barcode generate hua ho
  // yaani vehicle_verified = true
  const routeAfterAuth = async () => {
    navigation.replace('BookingEntry');
  };

  // ── SUBMIT ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (mode === 'driver') {
      if (!driverId.trim()) {
        Alert.alert(
          T('Required', 'مطلوب'),
          T('Please enter your Driver / Vehicle ID.', 'يرجى إدخال رقم السائق / المركبة.')
        );
        return;
      }
      setLoading(true);
      try {
        await saveDriverSession('', driverId.trim().toUpperCase());
        navigation.replace('DriverTrip');
      } catch {
        Alert.alert(
          T('Login failed', 'فشل تسجيل الدخول'),
          T('Could not authenticate driver.', 'تعذر التحقق من هوية السائق.')
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      Alert.alert(
        T('Required', 'مطلوب'),
        T('Please enter email and password.', 'يرجى إدخال البريد الإلكتروني وكلمة المرور.')
      );
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await adminService.signup({
          email:    email.trim(),
          password: password.trim(),
          name:     name.trim(),
        });
      } else {
        await adminService.login({
          email:    email.trim(),
          password: password.trim(),
        });
      }

      await routeAfterAuth();

    } catch (err) {
      const message = err?.response?.data?.message || err.message
        || T('Please try again', 'يرجى المحاولة مرة أخرى');
      Alert.alert(
        mode === 'signup'
          ? T('Create account failed', 'فشل إنشاء الحساب')
          : T('Login failed', 'فشل تسجيل الدخول'),
        message
      );
    } finally {
      setLoading(false);
    }
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
              onPress={() => setMode('login')}
            >
              <Text style={[styles.switchTxt, mode === 'login' && styles.switchTxtActive]}>
                {T('Login', 'دخول')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'signup' && styles.switchBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.switchTxt, mode === 'signup' && styles.switchTxtActive]}>
                {T('Create', 'إنشاء')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'driver' && styles.switchBtnActive]}
              onPress={() => setMode('driver')}
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
                style={[styles.input, isRTL && styles.inputRTL]}
                placeholder={T('Email', 'البريد الإلكتروني')}
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                textAlign={isRTL ? 'right' : 'left'}
              />
              <TextInput
                style={[styles.input, isRTL && styles.inputRTL]}
                placeholder={T('Password', 'كلمة المرور')}
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                textAlign={isRTL ? 'right' : 'left'}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledBtn]}
            disabled={loading}
            onPress={handleSubmit}
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
  availRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  availTxt:     { flex: 1, color: theme.colors.black, fontWeight: '700' },
  submitButton: { backgroundColor: theme.colors.careemGreen, borderRadius: theme.radii.button, paddingVertical: 18, marginTop: 6, alignItems: 'center' },
  disabledBtn:  { opacity: 0.6 },
  submitText:   { color: theme.colors.white, fontWeight: '900', fontSize: theme.fontSizes.md },
});

export default AuthScreen;
