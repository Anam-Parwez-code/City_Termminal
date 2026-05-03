import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { io } from 'socket.io-client';
import { supabase } from '../services/supabaseClient';
import apiService from '../services/apiService';
import theme from '../theme';

const { height } = Dimensions.get('window');

const SOCKET_URL = 'http://192.168.245.224:5000';

const PICKUP_LOCATION = {
  latitude: 25.1181,
  longitude: 55.2006,
  title: 'Mall of Emirates',
};

const AIRPORT_LOCATION = {
  latitude: 25.2532,
  longitude: 55.3657,
  title: 'Dubai Airport Terminal',
};

const DEFAULT_DRIVER_LOCATION = {
  latitude: 25.1293,
  longitude: 55.2168,
};

const toCoordinate = (payload) => ({
  latitude: Number(payload?.lat ?? payload?.latitude ?? payload?.map_lat),
  longitude: Number(payload?.lng ?? payload?.longitude ?? payload?.map_lng),
});

const isValidCoordinate = (coordinate) =>
  Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude);

const normalizeStatus = (value) =>
  String(value || 'driver_assigned').trim().toLowerCase().replace(/\s+/g, '_');

const projectPoint = (coordinate) => {
  const minLat = Math.min(PICKUP_LOCATION.latitude, AIRPORT_LOCATION.latitude, DEFAULT_DRIVER_LOCATION.latitude) - 0.03;
  const maxLat = Math.max(PICKUP_LOCATION.latitude, AIRPORT_LOCATION.latitude, DEFAULT_DRIVER_LOCATION.latitude) + 0.03;
  const minLng = Math.min(PICKUP_LOCATION.longitude, AIRPORT_LOCATION.longitude, DEFAULT_DRIVER_LOCATION.longitude) - 0.03;
  const maxLng = Math.max(PICKUP_LOCATION.longitude, AIRPORT_LOCATION.longitude, DEFAULT_DRIVER_LOCATION.longitude) + 0.03;

  return {
    x: ((coordinate.longitude - minLng) / (maxLng - minLng)) * 100,
    y: (1 - (coordinate.latitude - minLat) / (maxLat - minLat)) * 100,
  };
};

const TrackingScreen = ({ navigation, route }) => {
  const { bookingId, airline, bookingData, confirmation } = route.params || {};
  const resolvedBookingId = bookingData?.bookingId || bookingId || confirmation?.bookingId;

  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('driver_assigned');
  const [driverLocation, setDriverLocation] = useState(DEFAULT_DRIVER_LOCATION);
  const [vehicle, setVehicle] = useState({
    number: confirmation?.vehicleNumber || 'CT-456',
    driver: confirmation?.driverName || 'City Terminal Driver',
  });

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const vanAnim = useRef(new Animated.ValueXY(projectPoint(DEFAULT_DRIVER_LOCATION))).current;

  const destination = useMemo(
    () => (normalizeStatus(status) === 'picked_up' ? AIRPORT_LOCATION : PICKUP_LOCATION),
    [status]
  );

  const destinationPoint = useMemo(() => projectPoint(destination), [destination]);
  const vanLeft = vanAnim.x.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const vanTop = vanAnim.y.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const moveDriver = (nextLocation) => {
    if (!isValidCoordinate(nextLocation)) return;
    setDriverLocation(nextLocation);
    Animated.timing(vanAnim, {
      toValue: projectPoint(nextLocation),
      duration: 800,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: 1,
      damping: 18,
      stiffness: 110,
      useNativeDriver: true,
    }).start();
  }, [sheetAnim]);

  useEffect(() => {
    let mounted = true;

    const fetchInitialStatus = async () => {
      setIsLoading(true);
      try {
        let nextStatus = null;
        let vehicleRow = null;

        if (supabase && resolvedBookingId) {
          const [{ data: bookingStatus }, { data: trackingRow }] = await Promise.all([
            supabase
              .from('slot_bookings')
              .select('status, vehicle_number')
              .eq('booking_id', resolvedBookingId)
              .maybeSingle(),
            supabase
              .from('vehicle_tracking')
              .select('status, current_location, vehicle_number, driver_name, map_lat, map_lng')
              .eq('booking_id', resolvedBookingId)
              .maybeSingle(),
          ]);

          nextStatus = trackingRow?.status || bookingStatus?.status;
          vehicleRow = trackingRow || bookingStatus;
        } else if (resolvedBookingId) {
          const details = await apiService.getBookingDetails(resolvedBookingId);
          nextStatus = details?.bookingData?.status || details?.data?.status;
        }

        if (!mounted) return;

        if (nextStatus) setStatus(normalizeStatus(nextStatus));
        if (vehicleRow?.vehicle_number || vehicleRow?.driver_name) {
          setVehicle((prev) => ({
            number: vehicleRow.vehicle_number || prev.number,
            driver: vehicleRow.driver_name || prev.driver,
          }));
        }

        const initialCoordinate = toCoordinate(vehicleRow || {});
        if (isValidCoordinate(initialCoordinate)) moveDriver(initialCoordinate);
      } catch (_error) {
        if (mounted) setStatus('driver_assigned');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchInitialStatus();
    return () => {
      mounted = false;
    };
  }, [resolvedBookingId]);

  useEffect(() => {
    if (!resolvedBookingId) return undefined;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
    });

    socket.emit('join_booking', { bookingId: resolvedBookingId });

    socket.on('location_update', (payload) => {
      if (String(payload?.bookingId || payload?.booking_id) !== String(resolvedBookingId)) return;
      moveDriver(toCoordinate(payload));
    });

    socket.on('status_update', (payload) => {
      if (String(payload?.bookingId || payload?.booking_id) !== String(resolvedBookingId)) return;
      const nextStatus = normalizeStatus(payload?.status);
      setStatus(nextStatus);

      if (nextStatus === 'arrived') {
        navigation.replace('ArrivedScreen', {
          bookingId: resolvedBookingId,
          airline,
          bookingData,
          confirmation,
        });
      }
    });

    return () => {
      socket.emit('leave_booking', { bookingId: resolvedBookingId });
      socket.disconnect();
    };
  }, [resolvedBookingId, airline, bookingData, confirmation, navigation]);

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [220, 0],
  });

  return (
    <View style={styles.container}>
      <View style={styles.webMap}>
        <View style={styles.mapGrid} />
        <View style={styles.routeLine} />

        <View style={[styles.destinationMarker, { left: `${destinationPoint.x}%`, top: `${destinationPoint.y}%` }]}>
          <Text style={styles.markerText}>{normalizeStatus(status) === 'picked_up' ? 'DXB' : 'P'}</Text>
        </View>

        <Animated.View style={[styles.vanMarker, { left: vanLeft, top: vanTop }]}>
          <Text style={styles.vanText}>Van</Text>
        </Animated.View>
      </View>

      <View style={styles.headerPill}>
        <View style={styles.liveDot} />
        <Text style={styles.headerText}>Live luggage tracking</Text>
      </View>

      {isLoading && (
        <View style={styles.loadingPill}>
          <ActivityIndicator color={theme.colors.careemGreen} />
          <Text style={styles.loadingText}>Loading booking status</Text>
        </View>
      )}

      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.eyebrow}>Current trip</Text>
            <Text style={styles.title}>
              {normalizeStatus(status) === 'picked_up' ? 'To the airport' : 'Driver to pickup'}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.stepRow}>
            <View style={styles.stepDot} />
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Driver location</Text>
              <Text style={styles.stepValue}>{vehicle.number} with {vehicle.driver}</Text>
            </View>
          </View>
          <View style={styles.connector} />
          <View style={styles.stepRow}>
            <View style={[styles.stepDot, styles.stepDotMuted]} />
            <View style={styles.stepContent}>
              <Text style={styles.stepLabel}>Destination</Text>
              <Text style={styles.stepValue}>{destination.title}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9}>
          <Text style={styles.primaryButtonText}>Route centered</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.black,
  },
  webMap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.cardMuted,
    overflow: 'hidden',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundImage:
      'linear-gradient(120deg, transparent 47%, rgba(0,0,0,0.08) 48%, rgba(0,0,0,0.08) 50%, transparent 51%), linear-gradient(30deg, transparent 48%, rgba(0,0,0,0.06) 49%, rgba(0,0,0,0.06) 51%, transparent 52%)',
  },
  routeLine: {
    position: 'absolute',
    left: '18%',
    top: '42%',
    width: '66%',
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.black,
    transform: [{ rotate: '-29deg' }],
  },
  headerPill: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.black,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.careemGreen,
  },
  headerText: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: theme.fontSizes.sm,
  },
  loadingPill: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...theme.shadows.soft,
  },
  loadingText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.black,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: height * 0.34,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radii.sheet,
    borderTopRightRadius: theme.radii.sheet,
    padding: 24,
    ...theme.shadows.card,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.line,
    alignSelf: 'center',
    marginBottom: 18,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: theme.fontSizes.xl,
    lineHeight: 30,
    fontWeight: '900',
    color: theme.colors.black,
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '900',
    color: theme.colors.black,
    textTransform: 'capitalize',
  },
  card: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radii.card,
    padding: 18,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.careemGreen,
    borderWidth: 3,
    borderColor: theme.colors.white,
  },
  stepDotMuted: {
    backgroundColor: theme.colors.black,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '800',
    color: theme.colors.muted,
    textTransform: 'uppercase',
  },
  stepValue: {
    fontSize: theme.fontSizes.md,
    fontWeight: '800',
    color: theme.colors.black,
    marginTop: 2,
  },
  connector: {
    width: 2,
    height: 26,
    backgroundColor: theme.colors.line,
    marginLeft: 7,
    marginVertical: 4,
  },
  primaryButton: {
    width: '100%',
    borderRadius: theme.radii.button,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: theme.colors.careemGreen,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: '900',
  },
  destinationMarker: {
    position: 'absolute',
    backgroundColor: theme.colors.black,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 3,
    borderColor: theme.colors.white,
  },
  markerText: {
    color: theme.colors.white,
    fontWeight: '900',
    fontSize: theme.fontSizes.xs,
  },
  vanMarker: {
    position: 'absolute',
    backgroundColor: theme.colors.careemGreen,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 3,
    borderColor: theme.colors.white,
  },
  vanText: {
    color: theme.colors.white,
    fontWeight: '900',
    fontSize: theme.fontSizes.xs,
  },
});

export default TrackingScreen;
