import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import adminService from '../services/adminService';

const AuthScreen = ({ navigation }) => {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
      navigation.replace(currentBookingId ? 'AdminDashboard' : 'BookingEntry');
    } catch (err) {
      Alert.alert('Auth Failed', err?.response?.data?.message || err.message || 'Please try again');
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
      <View style={styles.card}>
      <Text style={styles.title}>City Terminal</Text>
      <Text style={styles.subtitle}>Login or signup to continue</Text>

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
          <Text style={[styles.switchTxt, mode === 'signup' && styles.switchTxtActive]}>Signup</Text>
        </TouchableOpacity>
      </View>

      {mode === 'signup' && (
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor="#94A3B8"
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#94A3B8"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#94A3B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.disabledBtn]}
        disabled={loading}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>{loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Login'}</Text>
      </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: '#0F0F10' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  card: { backgroundColor: '#191A1E', borderWidth: 1, borderColor: '#2E3138', borderRadius: 18, padding: 18 },
  title: { color: '#F8FAFC', fontSize: 30, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#CBD5E1', fontSize: 14, marginBottom: 22 },
  switchRow: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#1A1A1D', borderRadius: 12, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  switchBtnActive: { backgroundColor: '#EF3340' },
  switchTxt: { color: '#CBD5E1', fontWeight: '600' },
  switchTxtActive: { color: '#FFF' },
  input: {
    backgroundColor: '#1A1A1D',
    borderColor: '#2E3138',
    borderWidth: 1,
    borderRadius: 12,
    color: '#F8FAFC',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  submitButton: { backgroundColor: '#009A44', borderRadius: 12, paddingVertical: 14, marginTop: 6, alignItems: 'center' },
  disabledBtn: { opacity: 0.6 },
  submitText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

export default AuthScreen;
