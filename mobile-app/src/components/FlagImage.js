import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

/** PNG flags from flagcdn (ISO 3166-1 alpha-2, e.g. us, ae, qa). */
export const getFlagUri = (countryCode) => {
  const code = String(countryCode || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w80/${code}.png`;
};

const FlagImage = ({ countryCode, size = 32, style, rounded = true }) => {
  const [failed, setFailed] = useState(false);
  const uri = getFlagUri(countryCode);
  const height = Math.round(size * 0.67);
  const radius = rounded ? Math.max(4, Math.round(size * 0.12)) : 2;

  if (!uri || failed) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height, borderRadius: radius },
          style,
        ]}
      >
        <Text style={[styles.fallbackText, { fontSize: Math.max(8, size * 0.28) }]}>
          {String(countryCode || '?').toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[
        styles.flag,
        { width: size, height, borderRadius: radius },
        style,
      ]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      onError={() => setFailed(true)}
    />
  );
};

const styles = StyleSheet.create({
  flag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#F3F4F6',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  fallbackText: {
    fontWeight: '800',
    color: '#6B7280',
  },
});

export default FlagImage;
