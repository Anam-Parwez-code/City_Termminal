import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Keyboard,
} from 'react-native';
import { searchPickupPlaces } from '../services/placesAutocomplete';
import MapView from '../components/Map';
import { useTranslation } from 'react-i18next';
import apiService from '../services/apiService';
import theme from '../theme';

const { width, height } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0A0B',
  card: '#15171B',
  line: '#2A2F36',
  green: theme.colors.careemGreen,
  greenDark: '#163A1C',
  text: '#FFFFFF',
  muted: '#A7B0C0',
};

const TERMINALS = [
  'Dubai International Airport T1 (DXB T1)',
  'Dubai International Airport T2 (DXB T2)',
  'Dubai International Airport T3 (DXB T3)',
  'Al Maktoum International Airport (DWC)',
];

const QUICK_PICKUP_LOCATIONS = [
  { id: 'mall_of_emirates', name: 'Mall of the Emirates', lat: 25.1181, lng: 55.2006 },
  { id: 'downtown_dubai', name: 'Downtown Dubai', lat: 25.1972, lng: 55.2744 },
  { id: 'dubai_marina', name: 'Dubai Marina / JBR', lat: 25.0800, lng: 55.1400 },
  { id: 'city_walk', name: 'City Walk', lat: 25.2075, lng: 55.2622 },
  { id: 'deira_city_centre', name: 'Deira City Centre', lat: 25.2534, lng: 55.3326 },
];

const LocationPickScreen = ({ navigation, route }) => {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const params = route?.params || {};
  
  const [region, setRegion] = useState({
    latitude: 25.2048,
    longitude: 55.2708,
    latitudeDelta: 0.0422,
    longitudeDelta: 0.0221,
  });
  
  const [terminal, setTerminal] = useState(TERMINALS[0]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showTerminals, setShowTerminals] = useState(false);
  const mapRef = useRef(null);

  const [placeQuery, setPlaceQuery] = useState('');
  const [placeHits, setPlaceHits] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [pickupLabel, setPickupLabel] = useState('');
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const flightTime =
    params.bookingData?.departureTime ||
    params.bookingData?.departure_time ||
    params.departureTime ||
    null;
  const flightNumber =
    params.bookingData?.flightNumber ||
    params.bookingData?.flight_number ||
    params.flightNumber ||
    '';

  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 3) {
      setPlaceHits([]);
      return;
    }
    const tid = setTimeout(async () => {
      setPlacesLoading(true);
      try {
        const list = await searchPickupPlaces(`${q}, Dubai UAE`);
        setPlaceHits(list);
      } catch (_err) {
        setPlaceHits([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 450);
    return () => clearTimeout(tid);
  }, [placeQuery]);

  useEffect(() => {
    let mounted = true;
    const fetchAIRecommendations = async () => {
      setAiLoading(true);
      try {
        const result = await apiService.recommendPickup({
          flightTime,
          destinationTerminal: terminal,
          flightNumber,
          language: i18n.language || 'en',
        });
        if (!mounted) return;
        setAiRecommendations(result?.recommended || result?.recommendations || []);
      } catch (_err) {
        if (mounted) setAiRecommendations([]);
      } finally {
        if (mounted) setAiLoading(false);
      }
    };
    fetchAIRecommendations();
    return () => {
      mounted = false;
    };
  }, [flightNumber, flightTime, i18n.language, terminal]);

  const handleRegionChangeComplete = (newRegion) => {
    setRegion(newRegion);
    if (!pickupLabel.trim()) {
      setPickupLabel(
        `Pickup pin — ${Number(newRegion.latitude).toFixed(4)}, ${Number(newRegion.longitude).toFixed(4)}`,
      );
    }
  };

  const flyToHit = (hit) => {
    setPickupLabel(hit.label.slice(0, 140));
    setPlaceQuery('');
    setPlaceHits([]);
    Keyboard.dismiss();
    const nextRegion = {
      latitude: hit.lat,
      longitude: hit.lng,
      latitudeDelta: 0.03,
      longitudeDelta: 0.025,
    };
    mapRef.current?.animateToRegion?.(nextRegion, 520);
    setRegion(nextRegion);
  };

  const selectQuickLocation = (location) => {
    setPickupLabel(location.name);
    setPlaceQuery('');
    setPlaceHits([]);
    Keyboard.dismiss();
    const nextRegion = {
      latitude: location.lat,
      longitude: location.lng,
      latitudeDelta: 0.03,
      longitudeDelta: 0.025,
    };
    mapRef.current?.animateToRegion?.(nextRegion, 520);
    setRegion(nextRegion);
  };

  const recommendationFor = (locationId) =>
    aiRecommendations.find((item) => item.locationId === locationId || item.location_id === locationId);

  const reasonFor = (recommendation) => {
    if (!recommendation) return null;
    return i18n.language === 'ar'
      ? recommendation.reason_ar || recommendation.reason_en
      : recommendation.reason_en || recommendation.reason_ar;
  };

  const handleContinue = async () => {
    const bookingId = params.bookingId || params.bookingData?.bookingId || params.bookingData?.booking_id;
    if (!bookingId) {
      Alert.alert('Missing booking', 'Booking ID is missing. Please go back and try again.');
      return;
    }

    const coordSuffix = `${region.latitude.toFixed(5)}, ${region.longitude.toFixed(5)}`;
    const pickupName = pickupLabel?.trim()?.length ? `${pickupLabel.trim()} (${coordSuffix})` : coordSuffix;

    navigation.navigate('TimeSlot', {
      ...params,
      bookingId,
      pickupLocation: { name: pickupName, lat: region.latitude, lng: region.longitude },
      destinationTerminal: terminal,
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChangeComplete}
        customMapStyle={mapStyle}
        showsUserLocation={true}
        showsMyLocationButton={true}
      />

      <View style={styles.centerPinContainer} pointerEvents="none">
        <View style={styles.pinBubble}>
          <Text style={styles.pinText}>CT</Text>
        </View>
        <View style={styles.pinStem} />
        <View style={styles.pinShadow} />
      </View>

      <View style={styles.headerOverlay}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{isRTL ? '→' : '←'}</Text>
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerEyebrow}>Set Pickup</Text>
          <Text style={styles.headerTitle}>Where are you?</Text>
        </View>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />

        <Text style={styles.searchPrompt}>Where should we collect you?</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={placeQuery}
            onChangeText={setPlaceQuery}
            placeholder="Search Dubai area (Uber-style)"
            placeholderTextColor={COLORS.muted}
            style={styles.searchField}
          />
          {placesLoading ? <ActivityIndicator size="small" color={COLORS.green} /> : null}
        </View>

        {placeHits.length > 0 ? (
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.hitList}>
            {placeHits.map((h) => (
              <TouchableOpacity key={h.id} style={styles.hitItem} onPress={() => flyToHit(h)}>
                <Text style={styles.hitText} numberOfLines={2}>{h.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.quickHeaderRow}>
          <Text style={styles.quickTitle}>Suggested pickup points</Text>
          {aiLoading ? <ActivityIndicator size="small" color={COLORS.green} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickList}>
          {QUICK_PICKUP_LOCATIONS.map((location) => {
            const recommendation = recommendationFor(location.id);
            const reason = reasonFor(recommendation);
            return (
              <TouchableOpacity
                key={location.id}
                style={[styles.quickCard, recommendation && styles.quickCardRecommended]}
                onPress={() => selectQuickLocation(location)}
                activeOpacity={0.82}
              >
                {recommendation ? (
                  <Text style={styles.aiBadge}>
                    {i18n.language === 'ar' ? '⭐ موصى به - Powered by JAIS LLM' : '⭐ AI Recommended'}
                  </Text>
                ) : null}
                <Text style={styles.quickName} numberOfLines={1}>{location.name}</Text>
                {reason ? <Text style={styles.quickReason} numberOfLines={2}>AI: {reason}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.locationRow}>
          <View style={styles.dotIcon} />
          <View>
            <Text style={styles.rowLabel}>Pickup Location</Text>
            <Text style={styles.rowValue}>
              {pickupLabel?.trim()?.length ? pickupLabel : `${region.latitude.toFixed(4)}, ${region.longitude.toFixed(4)}`}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.terminalSelector}
          onPress={() => setShowTerminals(!showTerminals)}
        >
          <View>
            <Text style={styles.rowLabel}>Airport Destination</Text>
            <Text style={styles.rowValue}>{terminal}</Text>
          </View>
          <Text style={styles.chevron}>{showTerminals ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showTerminals && (
          <View style={styles.terminalList}>
            {TERMINALS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.terminalItem, terminal === t && styles.terminalItemSelected]}
                onPress={() => {
                  setTerminal(t);
                  setShowTerminals(false);
                }}
              >
                <Text style={[styles.terminalItemText, terminal === t && styles.terminalItemTextSelected]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, isAssigning && styles.disabledButton]}
          disabled={isAssigning}
          onPress={handleContinue}
        >
          {isAssigning ? (
            <ActivityIndicator color="#08100A" />
          ) : (
            <Text style={styles.continueText}>Confirm Location →</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { width, height: height * 0.7 },
  centerPinContainer: {
    position: 'absolute',
    top: (height * 0.7) / 2 - 40,
    left: width / 2 - 20,
    alignItems: 'center',
  },
  pinBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  pinText: { color: '#000', fontWeight: '900', fontSize: 14 },
  pinStem: { width: 4, height: 16, backgroundColor: '#000', marginTop: -2 },
  pinShadow: { width: 12, height: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.3)', marginTop: -2 },
  headerOverlay: { position: 'absolute', top: 58, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  backText: { color: COLORS.text, fontWeight: '900', fontSize: 18 },
  headerTextContainer: { flex: 1, backgroundColor: 'rgba(10, 10, 11, 0.85)', padding: 10, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line },
  headerEyebrow: { color: COLORS.green, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 14 },
  searchPrompt: { color: COLORS.text, fontSize: 13, fontWeight: '900', marginBottom: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#101215',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  searchField: { flex: 1, paddingVertical: 12, color: COLORS.text, fontWeight: '600' },
  hitList: { maxHeight: 130, marginBottom: 12 },
  hitItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  hitText: { color: COLORS.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  quickHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  quickList: { marginBottom: 14 },
  quickCard: {
    width: 190,
    minHeight: 86,
    backgroundColor: '#101215',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    padding: 12,
    marginRight: 10,
  },
  quickCardRecommended: { borderColor: COLORS.green, backgroundColor: COLORS.greenDark },
  aiBadge: { color: COLORS.green, fontSize: 10, fontWeight: '900', marginBottom: 6 },
  quickName: { color: COLORS.text, fontSize: 13, fontWeight: '900', marginBottom: 4 },
  quickReason: { color: '#D7F6DF', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  dotIcon: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.green },
  rowLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  rowValue: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  terminalSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#101215', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, marginBottom: 16 },
  chevron: { color: COLORS.muted, fontSize: 14 },
  terminalList: { backgroundColor: '#101215', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, marginBottom: 16, overflow: 'hidden' },
  terminalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  terminalItemSelected: { backgroundColor: COLORS.greenDark },
  terminalItemText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  terminalItemTextSelected: { color: COLORS.green, fontWeight: '800' },
  continueButton: { backgroundColor: COLORS.green, borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  disabledButton: { opacity: 0.5 },
  continueText: { color: '#000', fontWeight: '900', fontSize: 16 },
});

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
];

export default LocationPickScreen;
