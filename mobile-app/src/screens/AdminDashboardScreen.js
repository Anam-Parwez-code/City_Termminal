import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import adminService from '../services/adminService';
import QRCodeBox from '../components/QRCodeBox';

const AdminDashboardScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [currentBookingId, setCurrentBookingId] = useState('');
  const [myTrip, setMyTrip] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const savedBookingId = await adminService.getCurrentBookingId();
      const [statsRes, vehiclesRes, passengersRes] = await Promise.all([
        adminService.fetchStats(),
        adminService.fetchVehicles(),
        adminService.fetchPassengers(savedBookingId || ''),
      ]);
      const passengerRows = passengersRes?.data || [];
      setStats(statsRes?.data || null);
      setVehicles(vehiclesRes?.data || []);
      setPassengers(passengerRows.slice(0, 10));
      setCurrentBookingId(savedBookingId || '');
      setMyTrip(
        savedBookingId
          ? passengerRows.find((p) => String(p.booking_id).toUpperCase() === String(savedBookingId).toUpperCase()) || passengerRows[0] || null
          : passengerRows.find((p) => p.qr_code || p.vehicle_number) || null
      );
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>{currentBookingId ? 'Your city terminal journey' : 'Operations overview'}</Text>

      {myTrip && (
        <View style={styles.tripCard}>
          <View style={styles.tripHeader}>
            <View>
              <Text style={styles.tripEyebrow}>Boarding QR</Text>
              <Text style={styles.tripBooking}>{myTrip.booking_id}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{myTrip.vehicle_status || myTrip.status || 'Pending'}</Text>
            </View>
          </View>
          <View style={styles.qrHero}>
            {myTrip.proof_qr_code ? (
              <QRCodeBox value={String(myTrip.proof_qr_code)} size={148} />
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#94A3B8', textAlign: 'center' }}>QR available after driver verifies vehicle</Text>
              </View>
            )}
          </View>
          <View style={styles.tripGrid}>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Vehicle</Text><Text style={styles.tripValue}>{myTrip.vehicle_number || 'Not assigned'}</Text></View>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Flight</Text><Text style={styles.tripValue}>{myTrip.flight || '--'}</Text></View>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Destination</Text><Text style={styles.tripValue}>{myTrip.destination || '--'}</Text></View>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Departure</Text><Text style={styles.tripValue}>{myTrip.departure_time || '--'}</Text></View>
            <View style={styles.tripInfoWide}><Text style={styles.tripLabel}>Vehicle Location</Text><Text style={styles.tripValue}>{myTrip.current_location || 'Status will update after dispatch'}</Text></View>
            <View style={styles.tripInfoWide}><Text style={styles.tripLabel}>Flight Status</Text><Text style={styles.tripValue}>{myTrip.flight_status || myTrip.status || 'Scheduled'}</Text></View>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Pickup OTP</Text><Text style={styles.tripValue}>{myTrip.pickup_otp || '--'}</Text></View>
            <View style={styles.tripInfo}><Text style={styles.tripLabel}>Proof QR</Text><Text style={styles.tripValue}>{myTrip.proof_qr_code ? 'Generated' : 'Pending OTP'}</Text></View>
          </View>
        </View>
      )}

      <View style={styles.statsGrid}>
        <View style={styles.statCard}><Text style={styles.statLabel}>Passengers Today</Text><Text style={styles.statValue}>{stats?.totalPassengersToday ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Active Vehicles</Text><Text style={styles.statValue}>{stats?.activeVehicles ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Available Slots</Text><Text style={styles.statValue}>{stats?.availableSlots ?? 0}</Text></View>
        <View style={styles.statCard}><Text style={styles.statLabel}>Avg Wait (min)</Text><Text style={styles.statValue}>{stats?.avgWaitTimeMinutes ?? 0}</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Live Vehicle Status</Text>
      <View style={styles.listGap}>
        {vehicles.slice(0, 4).map((item) => (
          <View key={`${item.id}-${item.updated_at || item.booking_id || ''}`} style={styles.listCard}>
            <Text style={styles.cardTitle}>{item.id}</Text>
            <Text style={styles.cardText}>Booking: {item.booking_id || 'N/A'}</Text>
            <Text style={styles.cardText}>Driver: {item.driver || 'N/A'}</Text>
            <Text style={styles.cardText}>Status: {item.status || 'Unknown'}</Text>
            <Text style={styles.cardText}>Location: {item.current_location || 'Unknown'}</Text>
          </View>
        ))}
        {vehicles.length === 0 && <Text style={styles.emptyText}>No live vehicles found.</Text>}
      </View>

      {!myTrip && <Text style={styles.sectionTitle}>Passenger Boarding QR</Text>}
      {!myTrip && passengers.filter((p) => p.proof_qr_code).length > 0 ? (
        <View style={styles.qrList}>
          {passengers.filter((p) => p.proof_qr_code).slice(0, 3).map((item) => (
            <View key={item.booking_id} style={styles.qrCard}>
              <QRCodeBox value={String(item.proof_qr_code)} size={112} />
              <Text style={styles.qrLabel}>Booking: {item.booking_id}</Text>
              <Text style={styles.qrSub}>{item.name || 'Passenger'}</Text>
              <Text style={styles.qrSub}>Vehicle: {item.vehicle_number || 'Not assigned'}</Text>
              <Text style={styles.qrSub}>Trip: {item.vehicle_status || item.status || 'Pending'}</Text>
            </View>
          ))}
        </View>
      ) : !myTrip ? (
        <Text style={styles.emptyText}>No passenger boarding QR available yet.</Text>
      ) : null}

      <TouchableOpacity
        style={styles.button}
        onPress={async () => {
          await adminService.logout();
          navigation.replace('Auth');
        }}
      >
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    paddingHorizontal: 18,
    paddingTop: 58,
  },
  contentContainer: { paddingBottom: 24 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: { color: '#94A3B8', marginBottom: 14 },
  tripCard: { backgroundColor: '#191A1E', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#2E3138', marginBottom: 16 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tripEyebrow: { color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', fontWeight: '700' },
  tripBooking: { color: '#F8FAFC', fontSize: 20, fontWeight: '800', marginTop: 2 },
  statusPill: { backgroundColor: '#163A1C', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { color: '#B4F5C4', fontSize: 11, fontWeight: '700' },
  qrHero: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripInfo: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#111318', borderRadius: 10, padding: 10 },
  tripInfoWide: { width: '100%', backgroundColor: '#111318', borderRadius: 10, padding: 10 },
  tripLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 3 },
  tripValue: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#191A1E', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#2E3138' },
  statLabel: { color: '#94A3B8', fontSize: 11 },
  statValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  listGap: { gap: 8, paddingBottom: 8 },
  listCard: { backgroundColor: '#191A1E', borderRadius: 10, borderWidth: 1, borderColor: '#2E3138', padding: 10 },
  cardTitle: { color: '#F8FAFC', fontWeight: '700', marginBottom: 3 },
  cardText: { color: '#CBD5E1', fontSize: 12 },
  emptyText: { color: '#94A3B8', marginBottom: 8 },
  qrList: { gap: 10, paddingBottom: 10 },
  qrCard: { width: '100%', backgroundColor: '#191A1E', borderColor: '#2E3138', borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 10 },
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
