import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import {
  signInDriver,
  signUpDriver,
  restoreAuthSession,
  hasActiveDriverSession,
} from '../services/driverAuth';
import { useFocusEffect } from '@react-navigation/native';
import { loadDriverSession } from '../sessionStorage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DriverLoginScreen({ navigation }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [driverId, setDriverId] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [supabaseReady, setSupabaseReady] = useState(isSupabaseConfigured());
  const [savedSession, setSavedSession] = useState(null);
  const [continuing, setContinuing] = useState(false);

  const refreshSavedSessionBanner = useCallback(async () => {
    const ready = isSupabaseConfigured();
    setSupabaseReady(ready);
    if (!ready) {
      setSavedSession(null);
      return;
    }
    const active = await hasActiveDriverSession();
    if (!active) {
      setSavedSession(null);
      setPassword('');
      return;
    }
    const local = await loadDriverSession();
    if (local.email) setEmail(local.email);
    let previewId = local.driverId || '';
    try {
      const { data } = await supabase.auth.getUser();
      previewId =
        local.lastEnteredDriverId ||
        local.driverId ||
        data.user?.user_metadata?.driver_id ||
        previewId;
    } catch (_e) {
      /* use local */
    }
    setSavedSession({
      email: local.email,
      driverId: String(previewId || '').toUpperCase().replace(/^DRV-/, 'DR-'),
      name: local.driverName,
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStatusMessage(
        'Supabase key missing. Add driver-app/.env with EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart: npx expo start -c',
      );
      return;
    }
    refreshSavedSessionBanner();
  }, [refreshSavedSessionBanner]);

  useFocusEffect(
    useCallback(() => {
      refreshSavedSessionBanner();
    }, [refreshSavedSessionBanner]),
  );

  const continueWithSavedSession = async () => {
    setContinuing(true);
    setStatusMessage('Loading your session…');
    try {
      await restoreAuthSession();
      navigation.replace('Profile');
    } catch (err) {
      setStatusMessage(err?.message || 'Could not restore session.');
    } finally {
      setContinuing(false);
    }
  };

  const validateEmail = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Email is required');
      return false;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleSubmit = async () => {
    setStatusMessage('');
    if (!validateEmail()) {
      setStatusMessage('Please enter a valid email address.');
      return;
    }
    if (!password.trim()) {
      setStatusMessage('Please enter your password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setStatusMessage('Please enter your full name.');
      return;
    }
    if (!driverId.trim()) {
      setStatusMessage('Please enter your Driver ID (e.g. DR-104).');
      return;
    }
    if (!isSupabaseConfigured()) {
      setStatusMessage(
        'Supabase not configured. Create driver-app/.env with EXPO_PUBLIC_SUPABASE_ANON_KEY from your Supabase dashboard, then run: npx expo start -c',
      );
      Alert.alert('Setup required', 'Add Supabase anon key to driver-app/.env and restart Expo.');
      return;
    }

    setLoading(true);
    setStatusMessage(mode === 'signup' ? 'Creating account…' : 'Signing in…');
    try {
      if (mode === 'signup') {
        const result = await signUpDriver({
          email,
          password,
          name,
          driverId: driverId.trim().toUpperCase(),
        });
        if (!result.session) {
          setStatusMessage(
            'Account created. Check your email to confirm, then switch to Login and sign in.',
          );
          Alert.alert(
            'Check your email',
            'Account created. Confirm your email if required, then login with the same credentials.',
          );
          setMode('login');
          return;
        }
      } else {
        await signInDriver({
          email,
          password,
          driverIdFallback: driverId.trim().toUpperCase(),
        });
      }
      setStatusMessage('');
      navigation.replace('Profile');
    } catch (err) {
      const msg = err?.message || 'Could not authenticate driver.';
      setStatusMessage(msg);
      Alert.alert(mode === 'signup' ? 'Sign up failed' : 'Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandEyebrow}>City Terminal</Text>
          <Text style={styles.title}>Driver Portal</Text>
          <Text style={styles.subtitle}>Login with email to see your assigned tasks</Text>
        </View>

        <View style={styles.form}>
          {!supabaseReady ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Supabase not connected</Text>
              <Text style={styles.warnBody}>
                Add EXPO_PUBLIC_SUPABASE_ANON_KEY in driver-app/.env and restart Expo with -c.
              </Text>
            </View>
          ) : null}

          {statusMessage ? (
            <View style={[styles.warnBox, statusMessage.includes('created') ? styles.okBox : null]}>
              <Text style={styles.warnBody}>{statusMessage}</Text>
            </View>
          ) : null}

          {savedSession ? (
            <View style={styles.savedBox}>
              <Text style={styles.savedTitle}>Saved session on this device</Text>
              <Text style={styles.savedBody}>
                {savedSession.name || 'Driver'} · {savedSession.email}
                {'\n'}Driver ID: {savedSession.driverId || '—'}
              </Text>
              <Text style={styles.savedHint}>
                To use a different ID (e.g. DR-105), enter it below and tap Login — not Continue.
              </Text>
              <TouchableOpacity
                style={[styles.continueBtn, continuing && styles.loginBtnDisabled]}
                onPress={continueWithSavedSession}
                disabled={continuing || loading}
              >
                {continuing ? (
                  <ActivityIndicator color="#08100a" />
                ) : (
                  <Text style={styles.continueBtnText}>Continue to My Tasks →</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.switchRow}>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'login' && styles.switchBtnActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.switchTxt, mode === 'login' && styles.switchTxtActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'signup' && styles.switchBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.switchTxt, mode === 'signup' && styles.switchTxtActive]}>Create</Text>
            </TouchableOpacity>
          </View>

          {mode === 'signup' && (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Gul Hassan"
                placeholderTextColor="#6b7280"
                value={name}
                onChangeText={setName}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailError && styles.inputError]}
            placeholder="driver@cityterminal.ae"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Driver ID</Text>
          <TextInput
            style={styles.input}
            placeholder="DR-104"
            placeholderTextColor="#6b7280"
            value={driverId}
            onChangeText={setDriverId}
            autoCapitalize="characters"
          />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Shift Status</Text>
              <Text style={styles.toggleSub}>
                {isAvailable ? 'Available for assignments' : 'Unavailable'}
              </Text>
            </View>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              trackColor={{ false: '#d1d5db', true: '#163a1c' }}
              thumbColor={isAvailable ? '#47d361' : '#f3f4f6'}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#08100a" />
            ) : (
              <Text style={styles.loginBtnText}>
                {mode === 'signup' ? 'Create Account →' : 'Login →'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { marginBottom: 24, alignItems: 'center' },
  brandEyebrow: {
    color: '#47d361',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: { color: '#0A0A0B', fontSize: 32, fontWeight: '900' },
  subtitle: { color: '#6B7280', marginTop: 8, textAlign: 'center' },
  form: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchRow: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
  },
  switchBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  switchBtnActive: { backgroundColor: '#0A0A0B' },
  switchTxt: { color: '#0A0A0B', fontWeight: '800' },
  switchTxtActive: { color: '#FFFFFF' },
  label: {
    color: '#111827',
    fontWeight: '800',
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 15 : 12,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  inputError: { borderColor: '#EF4444' },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginTop: -6, marginBottom: 10 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  toggleLabel: { color: '#111827', fontWeight: '800', fontSize: 15 },
  toggleSub: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  loginBtn: {
    backgroundColor: '#47d361',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#08100a', fontSize: 16, fontWeight: '900' },
  warnBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  okBox: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  warnTitle: { color: '#DC2626', fontWeight: '900', marginBottom: 4, fontSize: 13 },
  warnBody: { color: '#374151', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  savedBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  savedTitle: { color: '#1D4ED8', fontWeight: '900', fontSize: 13, marginBottom: 6 },
  savedBody: { color: '#374151', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  savedHint: { color: '#6B7280', fontSize: 11, lineHeight: 16, marginTop: 8, fontStyle: 'italic' },
  continueBtn: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  continueBtnText: { color: '#1D4ED8', fontWeight: '900', fontSize: 14 },
});
