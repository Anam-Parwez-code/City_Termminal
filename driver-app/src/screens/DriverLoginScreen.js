import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { loadDriverSession, saveDriverSession } from '../sessionStorage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DriverLoginScreen = ({ navigation }) => {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [driverId, setDriverId] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    loadDriverSession().then(({ vehicleId }) => {
      if (vehicleId) setDriverId(vehicleId);
    });
  }, []);

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

  const handleLogin = async () => {
    if (!validateEmail()) return;
    if (!password.trim()) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (!driverId.trim()) {
      Alert.alert('Required', 'Please enter your Driver ID.');
      return;
    }

    setLoading(true);
    try {
      // Vehicle ID abhi khali bhej rahe hain
     await saveDriverSession(driverId.trim().toUpperCase());
      navigation.replace('Trip');
      
    } catch (_error) {
      Alert.alert('Login Failed', 'Invalid Driver ID or credentials.');
    } finally {
      setLoading(false);
    }
};
    /*try {
      await saveDriverSession('', driverId.trim().toUpperCase());
      navigation.replace('Trip');
    } catch (_error) {
      Alert.alert('Login failed', 'Could not authenticate driver.');
    } finally {
      setLoading(false);
    }
  };*/

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
              placeholder="Driver full name"
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
          placeholder="your driver ID, e.g. DR-102"
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
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#08100a" />
          ) : (
            <Text style={styles.loginBtnText}>
              {mode === 'signup' ? 'Create Account ->' : 'Login ->'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 28,
    alignItems: 'center',
  },
  brandEyebrow: { color: '#47d361', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  title: { color: '#0A0A0B', fontSize: 32, fontWeight: '900' },
  form: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchRow: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  switchBtnActive: { backgroundColor: '#0A0A0B' },
  switchTxt: { color: '#0A0A0B', fontWeight: '800' },
  switchTxtActive: { color: '#FFFFFF' },
  label: { color: '#111827', fontWeight: '800', marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
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
});

export default DriverLoginScreen;
