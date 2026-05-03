import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';

const ZoomFromFallback = () => 13;

/**
 * Leaflet trip map — same props as TripMap.js (pickup/driver lat/lng).
 */
const TripMap = ({ pickup, driver, style }) => {
  const mountRef = useRef(null);
  const mapInst = useRef(null);
  const markersRef = useRef({ pickup: null, driver: null, line: null });
  const LRef = useRef(null);

  const hasPickup = pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng);
  const hasDriver = driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mountRef.current) return;
      LRef.current = L;

      const lat = hasPickup ? pickup.lat : hasDriver ? driver.lat : 25.2048;
      const lng = hasPickup ? pickup.lng : hasDriver ? driver.lng : 55.2708;

      mapInst.current?.remove?.();
      mapInst.current = L.map(mountRef.current, {
        center: [lat, lng],
        zoom: ZoomFromFallback(),
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapInst.current);

      const pin = (cls, html) =>
        L.divIcon({
          className: 'ct-marker',
          html: `<div style="
            padding:6px 10px;border-radius:10px;font-weight:900;font-size:11px;background:${cls};color:#08100a;
            box-shadow:0 4px 12px rgba(0,0,0,.35);border:1px solid #000;">${html}</div>`,
          iconSize: [80, 32],
          iconAnchor: [40, 32],
        });

      if (hasPickup) {
        markersRef.current.pickup = L.marker([pickup.lat, pickup.lng], { icon: pin('#47d361', 'PICKUP') }).addTo(
          mapInst.current,
        );
      }
      if (hasDriver) {
        markersRef.current.driver = L.marker([driver.lat, driver.lng], { icon: pin('#163a1c', 'DRIVER') }).addTo(
          mapInst.current,
        );
      }
      if (hasPickup && hasDriver) {
        markersRef.current.line = L.polyline(
          [
            [driver.lat, driver.lng],
            [pickup.lat, pickup.lng],
          ],
          { color: '#47d361', weight: 4, dashArray: '10 8', opacity: 0.9 },
        ).addTo(mapInst.current);
        mapInst.current.fitBounds(
          L.latLngBounds([driver.lat, driver.lng], [pickup.lat, pickup.lng]).pad(0.2),
        );
      }

      mapInst.current.invalidateSize();
    };

    run();
    return () => {
      cancelled = true;
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
      markersRef.current = { pickup: null, driver: null, line: null };
    };
  }, [hasPickup, hasDriver, pickup?.lat, pickup?.lng, driver?.lat, driver?.lng]);

  return (
    <View style={[styles.wrap, style]}>
      {/* eslint-disable-next-line react-native/no-inline-styles */}
      <View ref={mountRef} style={styles.mount} collapsable={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#1e232b' },
  mount: { flex: 1, width: '100%', height: '100%', minHeight: 200 },
});

export default TripMap;
