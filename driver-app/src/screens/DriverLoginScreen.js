import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { saveDriverSession, loadDriverSession } from '../sessionStorage';

const DriverLoginScreen = ({ navigation }) => {
  const [driverId, setDriverId] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already logged in (mock)
    loadDriverSession().then(({ vehicleId }) => {
      if (vehicleId) {
        setDriverId(vehicleId);
      }
    });
  }, []);

  const handleLogin = async () => {
    if (!driverId.trim()) {
      Alert.alert('Error', 'Please enter your Driver / Vehicle ID.');
      return;
    }

    setLoading(true);
    try {
      // Mocked login API call
      // await driverClient.post('/otp/driver-login', { driverId, isAvailable });
      
      // Save session
      await saveDriverSession('', driverId.trim().toUpperCase());
      
      navigation.replace('Trip');
    } catch (error) {
      Alert.alert('Login Failed', 'Could not authenticate driver.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.brandEyebrow}>City Terminal</Text>
        <Text style={styles.title}>Driver Portal</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Driver / Vehicle ID</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. CT-102"
          placeholderTextColor="#6b7280"
          value={driverId}
          onChangeText={setDriverId}
          autoCapitalize="characters"
        />

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Shift Status</Text>
            <Text style={styles.toggleSub}>
              {isAvailable ? 'Available for assignments' : 'Unavailable (Off Duty)'}
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={setIsAvailable}
            trackColor={{ false: '#374151', true: '#163a1c' }}
            thumbColor={isAvailable ? '#47d361' : '#9ca3af'}
          />
        </View>

        <TouchableOpacity 
          style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#08100a" />
          ) : (
            <Text style={styles.loginBtnText}>Login →</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>City Terminal Logistics © 2026</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060708',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  brandEyebrow: { color: '#47d361', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 32, fontWeight: '900' },
  form: {
    backgroundColor: '#0f1216',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  label: { color: '#d1d5db', fontWeight: '800', marginBottom: 10, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 24,
  },
  toggleLabel: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  toggleSub: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  loginBtn: {
    backgroundColor: '#47d361',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#08100a', fontSize: 16, fontWeight: '900' },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: { color: '#4b5563', fontSize: 12, fontWeight: '600' },
});

export default DriverLoginScreen;
