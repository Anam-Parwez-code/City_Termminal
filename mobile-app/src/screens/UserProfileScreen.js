import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  line: '#2A2F36',
  green: theme.colors.careemGreen || '#47D361',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const UserProfileScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  // State to hold the latest booking / status data
  const [latestBooking, setLatestBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  // Poll for the latest barcode status if we have a recent booking
  useEffect(() => {
    let mounted = true;
    
    // In a real app, you might fetch user's active bookings from the backend
    // Here we'll check if a booking ID was passed or fallback to recent memory (mocked)
    const bookingId = route?.params?.bookingId || 'EK123456'; 

    const fetchStatus = async () => {
      try {
        const result = await apiService.getOTPStatus(bookingId);
        if (mounted && result && result.status) {
          setLatestBooking({
            bookingId,
            status: result.status.status,
            driverName: result.status.driverName || result.assignment?.driverName || '—',
            vehicleId: result.status.vehicleId || result.assignment?.vehicleId || '—',
            barcodeData: result.status.barcodeData || result.status.barcode_data || null,
          });
        }
      } catch (err) {
        console.log('Error fetching status for profile:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Poll every 10s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [route]);

  // Determine if the barcode should be shown
  // The barcode is generated when the status reaches "Arrived at Pickup" and the driver confirms the vehicle ID
  const shouldShowBarcode = latestBooking && latestBooking.barcodeData;

  const getBarcodeValue = () => {
    if (!latestBooking) return '';
    if (latestBooking.barcodeData) return String(latestBooking.barcodeData);
    // Fallback just in case
    return JSON.stringify({
      bookingId: latestBooking.bookingId,
      vehicleId: latestBooking.vehicleId,
      driverName: latestBooking.driverName,
      issuedAt: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, isRTL && styles.textRight]}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Info Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Passenger Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>Mohammed Al Fayed</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>+971 50 123 4567</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Active Ride Section */}
            {latestBooking && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Active Booking: {latestBooking.bookingId}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Vehicle Assigned</Text>
                  <Text style={styles.infoValue}>{latestBooking.vehicleId}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Driver</Text>
                  <Text style={styles.infoValue}>{latestBooking.driverName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text style={[styles.infoValue, { color: COLORS.green }]}>
                    {latestBooking.status || 'Scheduled'}
                  </Text>
                </View>
              </View>
            )}

            {/* Barcode Section (Proof of verification) */}
            {shouldShowBarcode ? (
              <View style={styles.barcodeCard}>
                <Text style={styles.barcodeTitle}>Luggage Tag Barcode</Text>
                <Text style={styles.barcodeDesc}>
                  Your driver verified the Vehicle ID. Show this barcode as proof of tagging.
                </Text>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={getBarcodeValue()}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#0A0A0B"
                  />
                </View>
                <Text style={styles.qrCaption}>Scan at Airport Counter</Text>
              </View>
            ) : (
              <View style={styles.pendingCard}>
                <Text style={styles.pendingText}>
                  Barcode will appear here once the driver arrives and confirms the Vehicle ID.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingTop: 60, 
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    marginRight: 16,
  },
  backText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  textRight: { textAlign: 'right', marginRight: 0, marginLeft: 16 },
  
  content: { padding: 24, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  sectionTitle: { color: COLORS.muted, fontSize: 13, fontWeight: '800', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  infoLabel: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  infoValue: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  
  barcodeCard: {
    backgroundColor: COLORS.green,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
  },
  barcodeTitle: { color: '#08100A', fontSize: 20, fontWeight: '900', marginBottom: 6 },
  barcodeDesc: { color: '#163A1C', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  qrWrapper: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 16 },
  qrCaption: { color: '#08100A', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  
  pendingCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: 'dashed',
  },
  pendingText: { color: COLORS.muted, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
});

export default UserProfileScreen;
