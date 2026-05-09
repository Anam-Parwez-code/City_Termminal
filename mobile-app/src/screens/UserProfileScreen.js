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
  amber: '#F5A623',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const EMPTY = '-';

/** Return first non-null, non-empty string from args. */
const pick = (...values) =>
  values.find((v) => v != null && String(v).trim() !== '');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string or Date object to a readable time + date. */
const formatDeparture = (raw) => {
  if (!raw) return EMPTY;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_e) {
    return String(raw);
  }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const InfoRow = ({ label, value, valueStyle }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, valueStyle]}>{value || EMPTY}</Text>
  </View>
);

const SectionCard = ({ title, children }) => (
  <View style={styles.card}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const UserProfileScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';

  const params = route?.params || {};
  const bookingData = params.bookingData || {};
  const statusParam = params.statusData || params.status || {};
  const confirmation = params.confirmation || {};

  // ── Booking ID ──────────────────────────────────────────────────────────
  const bookingId = pick(
    params.bookingId,
    bookingData.bookingId,
    bookingData.booking_id,
    confirmation.bookingId,
    confirmation.booking_id,
    statusParam.bookingId,
    statusParam.booking_id,
  ) || '';

  // ── Passenger info (falls back to route params; server may enrich) ─────
  const passengerName = pick(
    params.passengerName,
    confirmation.passengerName,
    confirmation.passenger_name,
    bookingData.passengerName,
    bookingData.passenger_name,
    bookingData.name,
    bookingData.fullName,
    bookingData.full_name,
    bookingData.passenger?.name,
    params.passportData?.name,
    bookingData.verifiedName,
    bookingData.verified_name,
    'Passenger',
  );

  const passengerPhone = pick(
    params.passengerPhone,
    confirmation.passengerPhone,
    confirmation.passenger_phone,
    bookingData.passengerPhone,
    bookingData.passenger_phone,
    bookingData.phone,
    bookingData.phoneNumber,
    bookingData.phone_number,
    bookingData.mobile,
    bookingData.passenger?.phone,
    params.phone,
    EMPTY,
  );

  // ── Booking state ────────────────────────────────────────────────────────
  const [latestBooking, setLatestBooking] = useState(() => {
    const initial = { ...confirmation, ...statusParam };
    if (!bookingId && Object.keys(initial).length === 0) return null;
    return {
      bookingId,
      status: initial.status,
      vehicleVerified: initial.vehicleVerified ?? initial.vehicle_verified ?? false,
      driverName: pick(initial.driverName, initial.driver_name, EMPTY),
      driverPhone: pick(initial.driverPhone, initial.driver_phone, ''),
      vehicleId: pick(initial.vehicleId, initial.vehicle_id, initial.vehicleNumber, EMPTY),
      barcodeData: pick(initial.barcodeData, initial.barcode_data, null),
    };
  });

  // ── Flight block ─────────────────────────────────────────────────────────
  const [flight, setFlight] = useState(
    // Pre-fill from route params if the booking screen already has this data.
    params.flight || null,
  );

  const [loading, setLoading] = useState(!!bookingId);

  // ── Derived flags ─────────────────────────────────────────────────────────
  /**
   * Barcode is shown ONLY when:
   *   1. vehicleVerified === true  (server flipped after driver OTP step)
   *   2. status is one of the post-verification statuses
   */
  const isPostVerification = latestBooking &&
    ['barcode_issued', 'en_route_airport', 'at_airport'].includes(latestBooking.status);

  const shouldShowBarcode =
    isPostVerification && latestBooking.vehicleVerified === true;

  /**
   * Show the "Barcode Locked" card when a booking exists but the barcode is
   * not yet unlocked — driver hasn't confirmed the OTP step yet.
   */
  const shouldShowLocked =
    latestBooking && !shouldShowBarcode;

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    if (!bookingId) { setLoading(false); return () => { mounted = false; }; }

    const fetchStatus = async () => {
      try {
        const result = await apiService.getOTPStatus(bookingId);
        if (!mounted) return;

        // Server shape: { status: {...}, flight: {...} }
        const statusObj = result?.status || {};
        const assignmentObj = result?.assignment || {};

        if (statusObj.status || assignmentObj.status) {
          setLatestBooking({
            bookingId,
            status: statusObj.status || assignmentObj.status,
            vehicleVerified:
              statusObj.vehicleVerified ??
              statusObj.vehicle_verified ??
              assignmentObj.vehicleVerified ??
              assignmentObj.vehicle_verified ??
              false,
            driverName: pick(statusObj.driverName, statusObj.driver_name,
              assignmentObj.driverName, assignmentObj.driver_name, EMPTY),
            driverPhone: pick(statusObj.driverPhone, statusObj.driver_phone,
              assignmentObj.driverPhone, assignmentObj.driver_phone, ''),
            vehicleId: pick(statusObj.vehicleId, statusObj.vehicle_id,
              assignmentObj.vehicleId, assignmentObj.vehicle_id, EMPTY),
            barcodeData: pick(statusObj.barcodeData, statusObj.barcode_data,
              assignmentObj.barcodeData, assignmentObj.barcode_data, null),
          });
        }

        // Merge flight block — prefer server data over stale route params.
        const serverFlight = result?.flight || statusObj.flight || null;
        if (serverFlight) setFlight(serverFlight);
      } catch (err) {
        console.log('Poll error UserProfile', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [bookingId]);

  // ── QR value ──────────────────────────────────────────────────────────────
  const getBarcodeValue = () => {
    if (!latestBooking) return '';
    if (latestBooking.barcodeData) return String(latestBooking.barcodeData);
    return JSON.stringify({
      bookingId: latestBooking.bookingId,
      vehicleId: latestBooking.vehicleId,
      driverName: latestBooking.driverName,
      issuedAt: new Date().toISOString(),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '->' : '<-'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, isRTL && styles.textRight]}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Passenger Info */}
        <SectionCard title="Passenger Info">
          <InfoRow label="Name" value={passengerName} />
          <InfoRow label="Phone" value={passengerPhone} />
        </SectionCard>

        {/* Flight Details — shown as soon as we have any flight data */}
        {flight && (
          <SectionCard title="Flight Details">
            {flight.flightNumber && <InfoRow label="Flight" value={flight.flightNumber} />}
            {flight.airline && <InfoRow label="Airline" value={flight.airline} />}
            {flight.destination && <InfoRow label="Destination" value={flight.destination} />}
            {flight.terminal && <InfoRow label="Terminal" value={flight.terminal} />}
            {flight.departureTime && (
              <InfoRow
                label="Departure"
                value={formatDeparture(flight.departureTime)}
                valueStyle={{ color: COLORS.amber }}
              />
            )}
          </SectionCard>
        )}

        {/* Booking / Driver block */}
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.green} style={{ marginTop: 40 }} />
        ) : (
          <>
            {latestBooking && (
              <SectionCard title={`Active Booking: ${latestBooking.bookingId || EMPTY}`}>
                <InfoRow label="Vehicle Assigned" value={latestBooking.vehicleId} />
                <InfoRow label="Driver" value={latestBooking.driverName} />
                <InfoRow
                  label="Status"
                  value={latestBooking.status || 'Scheduled'}
                  valueStyle={{ color: COLORS.green }}
                />
              </SectionCard>
            )}

            {/* ── Barcode unlocked ── */}
            {shouldShowBarcode && (
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
            )}

            {/* ── Barcode locked — driver hasn't confirmed OTP step yet ── */}
            {shouldShowLocked && (
              <View style={styles.lockedCard}>
                {/* Lock icon (text fallback — swap for an icon library if desired) */}
                <Text style={styles.lockIcon}>🔒</Text>

                <Text style={styles.lockedTitle}>Barcode Locked</Text>

                {latestBooking.vehicleId && latestBooking.vehicleId !== EMPTY ? (
                  <>
                    <Text style={styles.lockedInstruction}>
                      Tell the driver your Vehicle ID to unlock the barcode:
                    </Text>
                    <View style={styles.vehicleIdPill}>
                      <Text style={styles.vehicleIdText}>{latestBooking.vehicleId}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.lockedInstruction}>
                    Waiting for a vehicle to be assigned to your booking…
                  </Text>
                )}

                <Text style={styles.lockedSub}>
                  Once the driver confirms your Vehicle ID in the driver app, the QR barcode will appear here automatically.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
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
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.line,
    marginRight: 16,
  },
  backText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  title: { color: COLORS.text, fontSize: 24, fontWeight: '900' },
  textRight: { textAlign: 'right', marginRight: 0, marginLeft: 16 },

  // Layout
  content: { padding: 24, paddingBottom: 40 },

  // Generic card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  sectionTitle: {
    color: COLORS.muted, fontSize: 13, fontWeight: '800',
    marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12,
  },
  infoLabel: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  infoValue: { color: COLORS.text, fontSize: 15, fontWeight: '800' },

  // Barcode unlocked
  barcodeCard: {
    backgroundColor: COLORS.green,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
  },
  barcodeTitle: { color: '#08100A', fontSize: 20, fontWeight: '900', marginBottom: 6 },
  barcodeDesc: {
    color: '#163A1C', fontSize: 14, fontWeight: '700',
    textAlign: 'center', marginBottom: 20,
  },
  qrWrapper: {
    backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginBottom: 16,
  },
  qrCaption: {
    color: '#08100A', fontSize: 13, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Barcode locked
  lockedCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 28,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: 'dashed',
  },
  lockIcon: { fontSize: 36, marginBottom: 12 },
  lockedTitle: {
    color: COLORS.text, fontSize: 18, fontWeight: '900', marginBottom: 10,
  },
  lockedInstruction: {
    color: COLORS.muted, fontSize: 14, fontWeight: '600',
    textAlign: 'center', lineHeight: 22, marginBottom: 16,
  },
  vehicleIdPill: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: COLORS.amber,
    marginBottom: 16,
  },
  vehicleIdText: {
    color: COLORS.amber, fontSize: 22, fontWeight: '900', letterSpacing: 2,
  },
  lockedSub: {
    color: COLORS.muted, fontSize: 12, fontWeight: '600',
    textAlign: 'center', lineHeight: 20, opacity: 0.8,
  },
});

export default UserProfileScreen;