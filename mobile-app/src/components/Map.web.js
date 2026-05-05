import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import * as L from 'leaflet';

const clampZoom = (z) => Math.max(11, Math.min(17, z));

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

export default forwardRef(function MapViewWeb(props, ref) {
  const { style, initialRegion, onRegionChangeComplete, children } = props;
  const mountRef = useRef(null);
  const mapRef = useRef(null);
  const seedRef = useRef(initialRegion);
  const onRegionChangeRef = useRef(onRegionChangeComplete);
  onRegionChangeRef.current = onRegionChangeComplete;

  useImperativeHandle(ref, () => ({
    animateToRegion(region, _duration) {
      const map = mapRef.current;
      if (!map || !region?.latitude) return;
      const latDelta = region.latitudeDelta || 0.04;
      const z = clampZoom(Math.log2(560 / latDelta));
      map.setView([region.latitude, region.longitude], z);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    ensureLeafletCss();

    const start = seedRef.current || {
      latitude: 25.2048,
      longitude: 55.2708,
      latitudeDelta: 0.0422,
      longitudeDelta: 0.0221,
    };

    if (!mountRef.current) return undefined;

    mapRef.current?.remove?.();
    const latDelta = start.latitudeDelta || 0.0422;
    const map = L.map(mountRef.current, {
      center: [start.latitude, start.longitude],
      zoom: clampZoom(Math.log2(560 / latDelta)),
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const emit = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      onRegionChangeRef.current?.({
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: b.getNorth() - b.getSouth(),
        longitudeDelta: b.getEast() - b.getWest(),
      });
    };

    map.on('moveend', emit);
    emit();
    const t = setTimeout(() => !cancelled && map.invalidateSize(), 120);

    return () => {
      cancelled = true;
      clearTimeout(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <View ref={mountRef} collapsable={false} style={styles.mount} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#1e232b' },
  mount: { flex: 1, width: '100%', height: '100%' },
});
