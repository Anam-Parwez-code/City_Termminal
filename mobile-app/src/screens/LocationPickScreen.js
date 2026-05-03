import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  card2: '#191C20',
  line: '#2A2F36',
  green: '#47D361',
  greenDark: '#163A1C',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const PICKUP_LOCATIONS = [
  { name: 'Mall of Emirates', lat: 25.1972, lng: 55.2744 },
  { name: 'Dubai Mall', lat: 25.1975, lng: 55.2796 },
  { name: 'JBR Beach Walk', lat: 25.0782, lng: 55.1305 },
  { name: 'Ibn Battuta Mall', lat: 25.0449, lng: 55.1252 },
  { name: 'City Walk', lat: 25.2085, lng: 55.2562 },
  { name: 'Palm Jumeirah', lat: 25.1124, lng: 55.139 },
];

const TERMINALS = [
  'Dubai International Airport T1 (DXB T1)',
  'Dubai International Airport T2 (DXB T2)',
  'Dubai International Airport T3 (DXB T3)',
  'Al Maktoum International Airport (DWC)',
];

const LocationPickScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  const [search, setSearch] = useState('');
  const [pickup, setPickup] = useState(null);
  const [terminal, setTerminal] = useState(TERMINALS[0]);
  const [isAssigning, setIsAssigning] = useState(false);

  const filteredLocations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return PICKUP_LOCATIONS;
    return PICKUP_LOCATIONS.filter((item) => item.name.toLowerCase().includes(needle));
  }, [search]);

  const handleContinue = async () => {
    if (!pickup) {
      Alert.alert('Select pickup', 'Please choose a pickup location first.');
      return;
    }

    const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
    if (!bookingId) {
      Alert.alert('Missing booking', 'Booking ID is missing. Please go back and try again.');
      return;
    }

    setIsAssigning(true);
    try {
      const result = await apiService.assignVehicle({
        bookingId,
        pickupLocation: pickup.name,
        destinationTerminal: terminal,
        pickupCoordinates: { lat: pickup.lat, lng: pickup.lng },
      });

      navigation.navigate('BookingConfirm', {
        ...params,
        bookingId,
        pickupLocation: pickup,
        destinationTerminal: terminal,
        vehicleAssignment: result.assignment,
        confirmation: {
          ...(params.confirmation || {}),
          ...(result.assignment || {}),
          locationName: pickup.name,
          destinationTerminal: terminal,
        },
      });
    } catch (error) {
      Alert.alert('Vehicle assignment failed', error.message || 'Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.header, isRTL && styles.rtlRow]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>{isRTL ? '->' : '<-'}</Text>
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, isRTL && styles.textRight]}>Pickup setup</Text>
            <Text style={[styles.title, isRTL && styles.textRight]}>Where should we meet you?</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>PIN</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pickup location"
            placeholderTextColor="#6F7785"
            style={[styles.searchInput, isRTL && styles.textRight]}
          />
        </View>

        <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>Popular pickup locations</Text>
        <FlatList
          data={filteredLocations}
          keyExtractor={(item) => item.name}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const selected = pickup?.name === item.name;
            return (
              <TouchableOpacity
                style={[styles.locationCard, selected && styles.selectedCard]}
                onPress={() => setPickup(item)}
                activeOpacity={0.86}
              >
                <View style={styles.pinBubble}>
                  <Text style={styles.pinText}>{selected ? 'OK' : 'CT'}</Text>
                </View>
                <View style={styles.cardCopy}>
                  <Text style={[styles.cardTitle, isRTL && styles.textRight]}>{item.name}</Text>
                  <Text style={[styles.cardSub, isRTL && styles.textRight]}>
                    {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <View style={styles.terminalPanel}>
          <Text style={[styles.sectionTitle, isRTL && styles.textRight]}>Airport destination</Text>
          <Text style={[styles.sectionHint, isRTL && styles.textRight]}>Choose your UAE airport terminal.</Text>
          {TERMINALS.map((item) => {
            const selected = terminal === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.terminalChip, selected && styles.terminalChipSelected]}
                onPress={() => setTerminal(item)}
              >
                <Text style={[styles.terminalText, selected && styles.terminalTextSelected]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, (!pickup || isAssigning) && styles.disabledButton]}
          disabled={!pickup || isAssigning}
          onPress={handleContinue}
        >
          {isAssigning ? (
            <ActivityIndicator color="#08100A" />
          ) : (
            <Text style={styles.continueText}>{isRTL ? '<- Continue' : 'Continue ->'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 24, paddingTop: 58, paddingBottom: 130 },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 24 },
  rtlRow: { flexDirection: 'row-reverse' },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line },
  backText: { color: COLORS.text, fontWeight: '900' },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.green, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '900', lineHeight: 36, marginTop: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.line, marginBottom: 24 },
  searchIcon: { color: COLORS.green, fontSize: 12, fontWeight: '900' },
  searchInput: { flex: 1, color: COLORS.text, height: 56, fontSize: 16 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  sectionHint: { color: COLORS.muted, fontSize: 13, marginTop: -4, marginBottom: 12 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line },
  selectedCard: { borderColor: COLORS.green, backgroundColor: '#102015' },
  pinBubble: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.greenDark, alignItems: 'center', justifyContent: 'center' },
  pinText: { color: COLORS.green, fontWeight: '900', fontSize: 11 },
  cardCopy: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  cardSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  terminalPanel: { backgroundColor: COLORS.card2, borderRadius: 24, padding: 18, marginTop: 18, borderWidth: 1, borderColor: COLORS.line },
  terminalChip: { padding: 14, borderRadius: 15, backgroundColor: '#101215', borderWidth: 1, borderColor: COLORS.line, marginTop: 8 },
  terminalChipSelected: { borderColor: COLORS.green, backgroundColor: COLORS.greenDark },
  terminalText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  terminalTextSelected: { color: COLORS.text },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, backgroundColor: '#0A0A0BEE', borderTopWidth: 1, borderTopColor: COLORS.line },
  continueButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  disabledButton: { opacity: 0.45 },
  continueText: { color: '#08100A', fontWeight: '900', fontSize: 16 },
  textRight: { textAlign: 'right' },
});

export default LocationPickScreen;
