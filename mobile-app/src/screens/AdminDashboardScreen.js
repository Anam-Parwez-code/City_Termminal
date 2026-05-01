import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import adminService from '../services/adminService';

const AdminDashboardScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [passengers, setPassengers] = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, vehiclesRes, passengersRes] = await Promise.all([
        adminService.fetchStats(),
        adminService.fetchVehicles(),
        adminService.fetchPassengers(),
      ]);
      setStats(statsRes?.data || null);
      setVehicles(vehiclesRes?.data || []);
      setPassengers((passengersRes?.data || []).slice(0, 10));
    } catch (err) {
      Alert.alert('Session Expired', 'Please login again for admin dashboard access.');
      await adminService.logout();
      navigation.replace('Auth');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#EF3340" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}><Text style={styles.statLabel}>Passengers Today</Text><Text style={styles.statValue}>{stats?.totalPassengersToday ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Active Vehicles</Text><Text style={styles.statValue}>{stats?.activeVehicles ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Available Slots</Text><Text style={styles.statValue}>{stats?.availableSlots ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Avg Wait (min)</Text><Text style={styles.statValue}>{stats?.avgWaitTimeMinutes ?? 0}</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Live Vehicle Status</Text>
      <FlatList
        data={vehicles.slice(0, 4)}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listGap}
        renderItem={({ item }) => (
          <View style={styles.listCard}>
            <Text style={styles.cardTitle}>{item.id}</Text>
            <Text style={styles.cardText}>Driver: {item.driver || 'N/A'}</Text>
            <Text style={styles.cardText}>Status: {item.status || 'Unknown'}</Text>
            <Text style={styles.cardText}>Location: {item.current_location || 'Unknown'}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No live vehicles found.</Text>}
      />

      <Text style={styles.sectionTitle}>Passenger Boarding QR</Text>
      {!!passengers[0]?.booking_id ? (
        <View style={styles.qrCard}>
          <QRCode value={String(passengers[0].booking_id)} size={120} />
          <Text style={styles.qrLabel}>Booking: {passengers[0].booking_id}</Text>
          <Text style={styles.qrSub}>{passengers[0].name || 'Passenger'}</Text>
        </View>
      ) : (
        <Text style={styles.emptyText}>No passenger booking available for QR.</Text>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={async () => {
          await adminService.logout();
          navigation.replace('Auth');
        }}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    paddingHorizontal: 24,
    paddingTop: 70,
  },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 14,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { width: '48%', backgroundColor: '#191A1E', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#2E3138' },
  statLabel: { color: '#94A3B8', fontSize: 11 },
  statValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  listGap: { gap: 8, paddingBottom: 8 },
  listCard: { backgroundColor: '#191A1E', borderRadius: 10, borderWidth: 1, borderColor: '#2E3138', padding: 10 },
  cardTitle: { color: '#F8FAFC', fontWeight: '700', marginBottom: 3 },
  cardText: { color: '#CBD5E1', fontSize: 12 },
  emptyText: { color: '#94A3B8', marginBottom: 8 },
  qrCard: { backgroundColor: '#191A1E', borderColor: '#2E3138', borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 14 },
  qrLabel: { color: '#F8FAFC', marginTop: 8, fontWeight: '700' },
  qrSub: { color: '#CBD5E1', fontSize: 12, marginTop: 3 },
  button: {
    backgroundColor: '#EF3340',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default AdminDashboardScreen;
