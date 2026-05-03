import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  line: '#2A2F36',
  green: '#47D361',
  greenDark: '#163A1C',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const BarcodeScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
  const confirmation = params.confirmation || {};
  const vehicleId = confirmation.vehicleId || confirmation.vehicle_id || confirmation.vehicleNumber || 'CT-102';
  const [status, setStatus] = useState(params.statusData || null);
  const [isVerifying, setIsVerifying] = useState(false);

  const barcodeData = useMemo(() => JSON.stringify({
    bookingId,
    vehicleId,
    timestamp: new Date().toISOString(),
  }), [bookingId, vehicleId]);

  const luggageTagged = Boolean(status?.luggageTagged || status?.luggage_tagged || status?.barcodeScanned || status?.barcode_scanned);
  const vehicleVerified = Boolean(status?.vehicleVerified || status?.vehicle_verified);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (!bookingId) return;
      try {
        const result = await apiService.getOTPStatus(bookingId);
        if (mounted) setStatus(result.status || result.assignment || null);
      } catch (_err) {}
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [bookingId]);

  const handleSimulateScan = async () => {
    if (!bookingId) return;
    setIsVerifying(true);
    try {
      const result = await apiService.verifyVehicleId({ bookingId, vehicleId });
      setStatus(result.status || result.assignment || null);
    } catch (error) {
      Alert.alert('Scan failed', error.message || 'Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '->' : '<-'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, isRTL && styles.textRight]}>Luggage barcode</Text>
          <Text style={[styles.title, isRTL && styles.textRight]}>Show this to your driver</Text>
        </View>
      </View>

      <View style={styles.vehicleCard}>
        <Text style={styles.vehicleLabel}>Tell driver your Vehicle ID</Text>
        <Text style={styles.vehicleId}>{vehicleId}</Text>
      </View>

      <View style={styles.qrCard}>
        <QRCode value={barcodeData} size={230} backgroundColor="#FFFFFF" color="#0A0A0B" />
        <Text style={styles.qrCaption}>Barcode fallback: secure QR luggage tag</Text>
      </View>

      <View style={styles.instructions}>
        {[
          `Tell driver your Vehicle ID: ${vehicleId}`,
          'Driver will scan this barcode to confirm luggage.',
          'This barcode will be attached to your luggage.',
        ].map((text, index) => (
          <View key={text} style={styles.instructionRow}>
            <View style={styles.stepBubble}><Text style={styles.stepText}>{index + 1}</Text></View>
            <Text style={styles.instructionText}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.statusPanel}>
        <Text style={styles.statusTitle}>Vehicle ID verification</Text>
        <Text style={[styles.statusValue, vehicleVerified && styles.statusGood]}>
          {vehicleVerified ? 'Vehicle verified' : 'Waiting for driver scan'}
        </Text>
        <Text style={styles.statusTitle}>Airport tracking</Text>
        <Text style={[styles.statusValue, luggageTagged && styles.statusGood]}>
          {luggageTagged ? 'Luggage Tagged' : 'Not tagged yet'}
        </Text>
      </View>

      {!luggageTagged && (
        <TouchableOpacity style={styles.scanButton} onPress={handleSimulateScan} disabled={isVerifying}>
          {isVerifying ? <ActivityIndicator color="#08100A" /> : <Text style={styles.scanText}>Simulate Driver Scan</Text>}
        </TouchableOpacity>
      )}

      {luggageTagged && (
        <View style={styles.doneBanner}>
          <Text style={styles.doneText}>Luggage Tagged</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 20 },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  backText: { color: COLORS.text, fontWeight: '900' },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '900', lineHeight: 36, marginTop: 6 },
  vehicleCard: { backgroundColor: COLORS.green, borderRadius: 24, padding: 22, marginBottom: 16 },
  vehicleLabel: { color: '#08100A', fontSize: 13, fontWeight: '900' },
  vehicleId: { color: '#08100A', fontSize: 48, fontWeight: '900', marginTop: 4 },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: 26, alignItems: 'center', padding: 24, marginBottom: 16 },
  qrCaption: { color: '#374151', fontSize: 12, fontWeight: '700', marginTop: 14 },
  instructions: { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  instructionRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 },
  stepBubble: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.greenDark, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: COLORS.green, fontWeight: '900' },
  instructionText: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  statusPanel: { backgroundColor: '#101215', borderRadius: 22, padding: 18, marginTop: 16, borderWidth: 1, borderColor: COLORS.line },
  statusTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginTop: 4 },
  statusValue: { color: COLORS.text, fontSize: 17, fontWeight: '900', marginBottom: 12 },
  statusGood: { color: COLORS.green },
  scanButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 17, alignItems: 'center', marginTop: 16 },
  scanText: { color: '#08100A', fontSize: 16, fontWeight: '900' },
  doneBanner: { backgroundColor: COLORS.greenDark, borderColor: COLORS.green, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16, alignItems: 'center' },
  doneText: { color: COLORS.green, fontSize: 18, fontWeight: '900' },
  textRight: { textAlign: 'right' },
});

export default BarcodeScreen;
