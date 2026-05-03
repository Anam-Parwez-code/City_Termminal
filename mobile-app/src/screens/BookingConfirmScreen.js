import React from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  panel: '#191C20',
  line: '#2A2F36',
  green: '#47D361',
  greenDark: '#163A1C',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const formatTime = (dateString) => {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const DetailRow = ({ label, value, action }) => (
  <TouchableOpacity style={styles.detailRow} disabled={!action} onPress={action}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, action && styles.linkValue]} numberOfLines={2}>
      {value || '--'}
    </Text>
  </TouchableOpacity>
);

const BookingConfirmScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const assignment = params.vehicleAssignment || params.confirmation || {};
  const vehicleId = assignment.vehicleId || assignment.vehicle_id || assignment.vehicleNumber || 'CT-102';
  const driverPhone = assignment.driverPhone || assignment.driver_phone || '+971500000000';
  const driverName = assignment.driverName || assignment.driver_name || 'Mohammed Al-Ali';
  const pickupLocation = params.pickupLocation?.name || assignment.pickupLocation || assignment.pickup_location || params.confirmation?.locationName;
  const destinationTerminal = params.destinationTerminal || assignment.destinationTerminal || assignment.destination_terminal;
  const pickupTime = params.confirmation?.slotTime || assignment.pickupTime || assignment.slotTime;

  const callDriver = async () => {
    const url = `tel:${driverPhone}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Phone unavailable', `Driver phone: ${driverPhone}`);
      return;
    }
    Linking.openURL(url);
  };

  const trackingParams = {
    ...params,
    confirmation: {
      ...(params.confirmation || {}),
      ...assignment,
      vehicleNumber: vehicleId,
      vehicleId,
      driverName,
      driverPhone,
      locationName: pickupLocation,
      destinationTerminal,
    },
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '->' : '<-'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, isRTL && styles.textRight]}>Vehicle assigned</Text>
          <Text style={[styles.title, isRTL && styles.textRight]}>Your City Terminal pickup is ready</Text>
        </View>
      </View>

      <View style={styles.vehicleHero}>
        <Text style={styles.vehicleLabel}>Vehicle ID</Text>
        <Text style={styles.vehicleId}>{vehicleId}</Text>
        <Text style={styles.vehicleHint}>Share your Vehicle ID with driver when they arrive.</Text>
      </View>

      <View style={styles.detailsCard}>
        <DetailRow label="Driver Name" value={driverName} />
        <DetailRow label="Driver Phone" value={driverPhone} action={callDriver} />
        <DetailRow label="Pickup Location" value={pickupLocation} />
        <DetailRow label="Pickup Time" value={formatTime(pickupTime)} />
        <DetailRow label="Destination Terminal" value={destinationTerminal} />
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>What happens next</Text>
        <Text style={styles.noteText}>Track the driver. When they reach your pickup point, show the luggage barcode so it can be tagged securely.</Text>
      </View>

      <TouchableOpacity
        style={styles.trackButton}
        onPress={() => navigation.navigate('LiveTracking', trackingParams)}
      >
        <Text style={styles.trackText}>{isRTL ? '<- Live tracking' : 'Live tracking ->'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 58, paddingBottom: 40 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 24 },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  backText: { color: COLORS.text, fontWeight: '900' },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '900', lineHeight: 36, marginTop: 6 },
  vehicleHero: { backgroundColor: COLORS.green, borderRadius: 28, padding: 26, marginBottom: 18 },
  vehicleLabel: { color: '#08100A', fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  vehicleId: { color: '#08100A', fontSize: 58, fontWeight: '900', letterSpacing: 1, marginVertical: 6 },
  vehicleHint: { color: '#0B240F', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  detailsCard: { backgroundColor: COLORS.card, borderRadius: 24, paddingHorizontal: 18, borderWidth: 1, borderColor: COLORS.line },
  detailRow: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  detailLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  detailValue: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  linkValue: { color: COLORS.green, textDecorationLine: 'underline' },
  noteCard: { backgroundColor: COLORS.greenDark, borderRadius: 20, padding: 18, marginTop: 18, borderWidth: 1, borderColor: '#245F2E' },
  noteTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  noteText: { color: '#D7F6DF', fontSize: 14, lineHeight: 20 },
  trackButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 18 },
  trackText: { color: '#08100A', fontSize: 16, fontWeight: '900' },
  textRight: { textAlign: 'right' },
});

export default BookingConfirmScreen;
