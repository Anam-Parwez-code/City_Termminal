import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import * as L from 'leaflet';

const ZoomFromFallback = () => 13;

function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  const id = 'leaflet-css-city-terminal';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

/**
 * Leaflet trip map — same props as TripMap.js (pickup/driver lat/lng).
 */
const TripMap = ({ pickup, driver, style }) => {
  const mountRef = useRef(null);
  const mapInst = useRef(null);

  const hasPickup = pickup && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng);
  const hasDriver = driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng);

  useEffect(() => {
    let cancelled = false;
    ensureLeafletCss();

    if (!mountRef.current) return undefined;

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

    const pin = (bg, html) =>
      L.divIcon({
        className: 'ct-marker',
        html: `<div style="
          padding:6px 10px;border-radius:10px;font-weight:900;font-size:11px;background:${bg};color:#08100a;
          box-shadow:0 4px 12px rgba(0,0,0,.35);border:1px solid #000;">${html}</div>`,
        iconSize: [88, 32],
        iconAnchor: [44, 32],
      });

    if (hasPickup) {
      L.marker([pickup.lat, pickup.lng], { icon: pin('#47d361', 'PICKUP') }).addTo(mapInst.current);
    }
    if (hasDriver) {
      L.marker([driver.lat, driver.lng], { icon: pin('#163a1c', 'DRIVER') }).addTo(mapInst.current);
    }
    if (hasPickup && hasDriver) {
      L.polyline(
        [
          [driver.lat, driver.lng],
          [pickup.lat, pickup.lng],
        ],
        { color: '#47d361', weight: 4, dashArray: '10 8', opacity: 0.9 },
      ).addTo(mapInst.current);
      mapInst.current.fitBounds(L.latLngBounds([driver.lat, driver.lng], [pickup.lat, pickup.lng]).pad(0.2));
    }

    const t = setTimeout(() => !cancelled && mapInst.current?.invalidateSize(), 80);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (mapInst.current) {
        mapInst.current.remove();
        mapInst.current = null;
      }
    };
  }, [hasPickup, hasDriver, pickup?.lat, pickup?.lng, driver?.lat, driver?.lng]);

  return (
    <View style={[styles.wrap, style]}>
      <View ref={mountRef} style={styles.mount} collapsable={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#1e232b' },
  mount: { flex: 1, width: '100%', height: '100%', minHeight: 200 },
});

export default TripMap;
