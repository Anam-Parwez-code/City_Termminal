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
  const vehicleId = confirmation.vehicleId || confirmation.vehicle_id || confirmation.vehicleNumber || '—';
  const [status, setStatus] = useState(params.statusData || null);
  const [startingTrip, setStartingTrip] = useState(false);

  const parsedPayload = useMemo(() => {
    const raw =
      confirmation.barcodeData ||
      confirmation.barcode_data ||
      status?.barcodeData ||
      status?.barcode_data;
    if (!raw || typeof raw !== 'string') return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, [confirmation, status]);

  const driverDisplayName =
    confirmation.driverName || confirmation.driver_name || parsedPayload.driverName || status?.driverName || '—';

  const driverDisplayPhone =
    confirmation.driverPhone || confirmation.driver_phone || parsedPayload.driverPhone || status?.driverPhone || '—';

  const barcodeValue =
    confirmation.barcodeData ||
    confirmation.barcode_data ||
    status?.barcodeData ||
    status?.barcode_data ||
    JSON.stringify({
      bookingId,
      vehicleId,
      driverName: driverDisplayName,
      driverPhone: driverDisplayPhone,
      issuedAt: new Date().toISOString(),
    });

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (!bookingId) return;
      try {
        const result = await apiService.getOTPStatus(bookingId);
        if (mounted) setStatus(result.status || result.assignment || null);
      } catch (_err) {
        //
      }
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [bookingId]);

  const goAirportTracking = async () => {
    if (!bookingId) return;
    setStartingTrip(true);
    try {
      await apiService.startAirportTrip({ bookingId });
      navigation.navigate('LiveTracking', {
        ...params,
        statusData: { ...(status || {}), status: 'en_route_airport' },
        confirmation: {
          ...confirmation,
          vehicleId,
          vehicleNumber: vehicleId,
        },
      });
    } catch (error) {
      Alert.alert('Could not start trip', error.message || 'Try again.');
    } finally {
      setStartingTrip(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, isRTL && styles.textRight]}>Luggage barcode</Text>
          <Text style={[styles.title, isRTL && styles.textRight]}>Synced with Operations</Text>
        </View>
      </View>

      <View style={styles.driverInfoCard}>
        <Text style={styles.driverHeading}>Assigned driver</Text>
        <Text style={styles.driverName}>{driverDisplayName}</Text>
        <Text style={styles.driverPhone}>{driverDisplayPhone}</Text>
        <Text style={styles.driverHint}>This matches the Operations dashboard baggage record.</Text>
      </View>

      <View style={styles.vehicleCard}>
        <Text style={styles.vehicleLabel}>Vehicle ID (confirm verbally)</Text>
        <Text style={styles.vehicleId}>{vehicleId}</Text>
      </View>

      <View style={styles.qrCard}>
        <QRCode value={String(barcodeValue)} size={230} backgroundColor="#FFFFFF" color="#0A0A0B" />
        <Text style={styles.qrCaption}>Admin dashboard barcode payload embedded</Text>
      </View>

      <View style={styles.instructions}>
        {[
          'Show this barcode to the ops desk / driver handset for RFID/luggage tagging.',
          `Barcode includes vehicle ${vehicleId} + driver contacts for audits.`,
          'When the van rolls toward DXB/DWC live GPS tracking unlocks.',
        ].map((text, index) => (
          <View key={text} style={styles.instructionRow}>
            <View style={styles.stepBubble}>
              <Text style={styles.stepText}>{index + 1}</Text>
            </View>
            <Text style={styles.instructionText}>{text}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.airportBtn}
        onPress={goAirportTracking}
        disabled={startingTrip}
      >
        {startingTrip ? (
          <ActivityIndicator color="#08100a" />
        ) : (
          <Text style={styles.airportBtnText}>Van heading to airport — live track →</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('LiveTracking', params)}>
        <Text style={styles.backLinkText}>Back to pickup tracking</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 16 },
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
  },
  backText: { color: COLORS.text, fontWeight: '900' },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '900', lineHeight: 34, marginTop: 6 },
  driverInfoCard: {
    backgroundColor: '#101215',
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  driverHeading: { color: COLORS.muted, fontWeight: '800', fontSize: 12 },
  driverName: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginTop: 6 },
  driverPhone: { color: COLORS.green, fontSize: 18, fontWeight: '900', marginTop: 4 },
  driverHint: { color: COLORS.muted, fontSize: 12, marginTop: 10, lineHeight: 18 },
  vehicleCard: { backgroundColor: COLORS.green, borderRadius: 24, padding: 22, marginBottom: 14 },
  vehicleLabel: { color: '#08100a', fontSize: 13, fontWeight: '900' },
  vehicleId: { color: '#08100a', fontSize: 44, fontWeight: '900', marginTop: 4 },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: 26, alignItems: 'center', padding: 24, marginBottom: 14 },
  qrCaption: { color: '#374151', fontSize: 12, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  instructions: { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  instructionRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 },
  stepBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: COLORS.green, fontWeight: '900' },
  instructionText: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  airportBtn: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 17, alignItems: 'center', marginTop: 14 },
  airportBtnText: { color: '#08100a', fontSize: 16, fontWeight: '900' },
  backLink: { alignItems: 'center', marginTop: 18, paddingVertical: 8 },
  backLinkText: { color: COLORS.muted, fontWeight: '700', fontSize: 14 },
  textRight: { textAlign: 'right' },
});

export default BarcodeScreen;
