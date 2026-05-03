import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const DEFAULT_REGION = {
  latitude: 25.2048,
  longitude: 55.2708,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const TripMap = ({ pickup, driver, style }) => {
  const hasPickup = pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng);
  const hasDriver = driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng);

  const region = useMemo(() => {
    if (hasPickup && hasDriver) {
      const lat = (pickup.lat + driver.lat) / 2;
      const lng = (pickup.lng + driver.lng) / 2;
      const latitudeDelta = Math.max(Math.abs(pickup.lat - driver.lat) * 2.4, 0.04);
      const longitudeDelta = Math.max(Math.abs(pickup.lng - driver.lng) * 2.4, 0.04);
      return { latitude: lat, longitude: lng, latitudeDelta, longitudeDelta };
    }
    if (hasPickup) {
      return {
        latitude: pickup.lat,
        longitude: pickup.lng,
        latitudeDelta: 0.035,
        longitudeDelta: 0.035,
      };
    }
    return DEFAULT_REGION;
  }, [hasPickup, hasDriver, pickup, driver]);

  const lineCoords = useMemo(() => {
    if (!hasPickup || !hasDriver) return [];
    return [
      { latitude: driver.lat, longitude: driver.lng },
      { latitude: pickup.lat, longitude: pickup.lng },
    ];
  }, [hasPickup, hasDriver, pickup, driver]);

  return (
    <MapView style={[styles.map, style]} initialRegion={region} region={region} showsCompass rotateEnabled={false}>
      {hasPickup && (
        <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup pin" />
      )}
      {hasDriver && (
        <Marker
          coordinate={{ latitude: driver.lat, longitude: driver.lng }}
          title="Van / driver"
          pinColor="#47D361"
        />
      )}
      {lineCoords.length === 2 && (
        <Polyline coordinates={lineCoords} strokeColor="#47D361" strokeWidth={3} lineDashPattern={[8, 6]} />
      )}
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: { width: '100%', height: '100%' },
});

export default TripMap;
