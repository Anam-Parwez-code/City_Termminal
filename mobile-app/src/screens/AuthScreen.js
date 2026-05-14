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
import adminService from '../services/adminService';
import { saveDriverSession } from '../services/driverSession';
import BrandMark from '../components/BrandMark';
import theme from '../theme';

const AuthScreen = ({ navigation }) => {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [driverId, setDriverId] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (mode === 'driver') {
      if (!driverId.trim()) {
        Alert.alert('Required', 'Please enter your Driver / Vehicle ID.');
        return;
      }
      setLoading(true);
      try {
        await saveDriverSession('', driverId.trim().toUpperCase());
        navigation.replace('DriverTrip');
      } catch (err) {
        Alert.alert('Login failed', 'Could not authenticate driver.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await adminService.signup({ email: email.trim(), password: password.trim(), name: name.trim() });
      } else {
        await adminService.login({ email: email.trim(), password: password.trim() });
      }

      const currentBookingId = await adminService.getCurrentBookingId();
      navigation.replace('BookingEntry');
    } catch (err) {
      const message = err?.response?.data?.message || err.message || 'Please try again';
      Alert.alert(mode === 'signup' ? 'Create account failed' : 'Login failed', message);
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
          <Text style={styles.title}>Airport luggage, simplified</Text>
          <Text style={styles.subtitle}>
            Book pickup, scan your passport, and track your van in one clean flow.
          </Text>
        </View>

        <View style={styles.card}>
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
            <TouchableOpacity
              style={[styles.switchBtn, mode === 'driver' && styles.switchBtnActive]}
              onPress={() => setMode('driver')}
            >
              <Text style={[styles.switchTxt, mode === 'driver' && styles.switchTxtActive]}>Driver</Text>
            </TouchableOpacity>
          </View>

          {mode === 'driver' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Driver / Vehicle ID (e.g. CT-102)"
                placeholderTextColor={theme.colors.muted}
                value={driverId}
                onChangeText={setDriverId}
                autoCapitalize="characters"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 }}>
                 <Text style={{ flex: 1, color: theme.colors.black, fontWeight: '700' }}>Available for shifts</Text>
                 <Switch value={isAvailable} onValueChange={setIsAvailable} trackColor={{ false: '#d1d5db', true: '#163a1c' }} thumbColor={isAvailable ? '#47d361' : '#f3f4f6'} />
              </View>
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor={theme.colors.muted}
                  value={name}
                  onChangeText={setName}
                />
              )}
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={theme.colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledBtn]}
            disabled={loading}
            onPress={handleSubmit}
          >
            <Text style={styles.submitText}>
              {loading ? 'Please wait...' : mode === 'driver' ? 'Driver Login' : mode === 'signup' ? 'Create Account' : 'Login'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 26,
  },
  title: {
    color: theme.colors.black,
    fontSize: theme.fontSizes.title,
    lineHeight: 38,
    fontWeight: '900',
    marginTop: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radii.card,
    padding: 16,
    ...theme.shadows.card,
  },
  switchRow: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    padding: 4,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  switchBtnActive: {
    backgroundColor: theme.colors.black,
  },
  switchTxt: {
    color: theme.colors.black,
    fontWeight: '800',
  },
  switchTxtActive: {
    color: theme.colors.white,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderRadius: 14,
    color: theme.colors.black,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: theme.colors.careemGreen,
    borderRadius: theme.radii.button,
    paddingVertical: 18,
    marginTop: 6,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitText: {
    color: theme.colors.white,
    fontWeight: '900',
    fontSize: theme.fontSizes.md,
  },
});

export default AuthScreen;
