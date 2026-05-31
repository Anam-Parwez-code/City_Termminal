import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import { io } from 'socket.io-client';
import { fetchDriverTasks, apiErrorMessage } from '../api/driverClient';
import { SOCKET_OPTIONS, socketOrigin } from '../config';
import { loadDriverSession } from '../sessionStorage';
import { signOutDriver, restoreAuthSession } from '../services/driverAuth';
import { formatTaskStatus, statusBadgeColor } from '../utils/tripStatus';

const COLORS = {
  bg: '#F8FAF8',
  card: '#FFFFFF',
  line: '#E5E7EB',
  green: '#47d361',
  greenBg: '#163a1c',
  text: '#111111',
  muted: '#6b7280',
};

const formatTime = (value) => {
  if (!value) return 'Time pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

function TaskCard({ task, onOpen }) {
  const badge = statusBadgeColor(task.status);
  return (
    <TouchableOpacity style={styles.taskCard} onPress={() => onOpen(task)} activeOpacity={0.92}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskBooking}>{task.bookingId}</Text>
        <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusPillTxt, { color: badge.text }]}>
            {formatTaskStatus(task.status)}
          </Text>
        </View>
      </View>
      <Row label="Passenger" value={task.passengerName || 'Passenger'} />
      <Row label="Pickup" value={task.pickupAddress || task.pickup || '—'} />
      <Row label="Destination" value={task.destination || 'Airport terminal'} />
      <Row label="Pickup time" value={formatTime(task.pickupTime || task.flightTime)} />
      <Text style={styles.openHint}>Tap to open trip console →</Text>
    </TouchableOpacity>
  );
}

export default function DriverProfileScreen({ navigation }) {
  const [driverId, setDriverId] = useState('');
  const [email, setEmail] = useState('');
  const [driverName, setDriverName] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const socket = useMemo(() => io(socketOrigin, SOCKET_OPTIONS), []);

  const refresh = useCallback(async (isPull = false) => {
    await restoreAuthSession();
    const sess = await loadDriverSession();
    const did = String(sess.driverId || '').trim();
    const em = String(sess.email || '').trim();
    const name = String(sess.driverName || '').trim();
    setDriverId(did);
    setEmail(em);
    setDriverName(name);
    setError('');

    if (!did) {
      setTasks([]);
      setLoading(false);
      setRefreshing(false);
      setError('Driver ID missing. Please login again.');
      return;
    }

    if (!isPull) setLoading(true);
    try {
      const list = await fetchDriverTasks(did);
      setTasks(list);
    } catch (e) {
      setTasks([]);
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    socket.emit('join_dispatch');
    const handleUpdate = () => refresh(true);
    socket.on('status_update', handleUpdate);
    socket.on('vehicle_update', handleUpdate);
    socket.on('new_booking', handleUpdate);
    return () => {
      socket.emit('leave_dispatch');
      socket.off('status_update', handleUpdate);
      socket.off('vehicle_update', handleUpdate);
      socket.off('new_booking', handleUpdate);
      socket.disconnect();
    };
  }, [refresh, socket]);

  const openTask = (task) => {
    navigation.navigate('Trip', {
      bookingId: task.bookingId,
      vehicleId: task.vehicleId,
    });
  };

  const performLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOutDriver();
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        }),
      );
    } catch (err) {
      Alert.alert('Log out failed', err?.message || 'Could not sign out. Try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm('Sign out and return to the login screen?');
      if (ok) performLogout();
      return;
    }
    Alert.alert('Log out', 'Sign out and return to the login screen?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: performLogout },
    ]);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tasks</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => refresh(true)} hitSlop={14}>
          <Text style={styles.refreshTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refresh(true);
            }}
            tintColor={COLORS.green}
          />
        }
      >
        <View style={styles.profileCard}>
          <Text style={styles.eyebrow}>Logged in driver</Text>
          <Text style={styles.hero}>{driverName || 'Driver'}</Text>
          <Row label="Email" value={email || '—'} />
          <Row label="Driver ID" value={driverId || '—'} emphasis />
        </View>

        <TouchableOpacity style={styles.tripLinkBtn} onPress={() => navigation.navigate('Trip')}>
          <Text style={styles.tripLinkTxt}>Open Trip Console →</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Assigned bookings</Text>
        <Text style={styles.sectionHint}>
          Tasks linked to your Driver ID in Supabase (`vehicle_assignments.driver_id`).
        </Text>

        {loading ? (
          <ActivityIndicator color={COLORS.green} size="large" style={{ marginTop: 24 }} />
        ) : null}

        {error ? (
          <View style={styles.errBox}>
            <Text style={styles.errTitle}>Could not load tasks</Text>
            <Text style={styles.errBody}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error && tasks.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptySub}>
              When admin assigns bookings with your Driver ID (e.g. DR-104), they appear here.
            </Text>
          </View>
        ) : null}

        {tasks.map((task) => (
          <TaskCard key={task.bookingId} task={task} onOpen={openTask} />
        ))}

        <TouchableOpacity
          style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <Text style={styles.logoutTxt}>Log out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, emphasis }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    backgroundColor: COLORS.card,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  refreshTxt: { color: COLORS.green, fontSize: 22, fontWeight: '800' },
  headerTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  scroll: { padding: 18, paddingBottom: 48 },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    gap: 10,
  },
  eyebrow: { color: COLORS.green, fontWeight: '800', fontSize: 11, letterSpacing: 1.2 },
  hero: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  tripLinkBtn: {
    marginTop: 14,
    backgroundColor: COLORS.green,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tripLinkTxt: { color: COLORS.greenBg, fontWeight: '900', fontSize: 15 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', marginTop: 22 },
  sectionHint: { color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 16,
    marginTop: 12,
    gap: 8,
  },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  taskBooking: { color: COLORS.text, fontSize: 20, fontWeight: '900', flex: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillTxt: { fontSize: 11, fontWeight: '900' },
  openHint: { color: COLORS.green, fontWeight: '800', fontSize: 12, marginTop: 6 },
  row: { gap: 3 },
  rowLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  rowValue: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  rowEmphasis: { color: COLORS.greenBg, fontWeight: '900' },
  emptyBox: {
    marginTop: 16,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  emptyTitle: { color: COLORS.text, fontWeight: '900', fontSize: 16 },
  emptySub: { color: COLORS.muted, marginTop: 8, lineHeight: 20 },
  errBox: {
    marginTop: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errTitle: { color: '#DC2626', fontWeight: '900', marginBottom: 6 },
  errBody: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  logoutBtn: {
    marginTop: 28,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: COLORS.card,
  },
  logoutTxt: { color: '#DC2626', fontWeight: '900', fontSize: 16 },
  logoutBtnDisabled: { opacity: 0.6 },
});
