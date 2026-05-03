import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../theme';

const BrandMark = ({ size = 'md', stacked = true }) => {
  const large = size === 'lg';

  return (
    <View style={[styles.wrap, stacked ? styles.stacked : styles.inline]}>
      <View style={[styles.logo, large && styles.logoLarge]}>
        <Text style={[styles.logoArabic, large && styles.logoArabicLarge]}>س</Text>
        <Text style={[styles.logoLatin, large && styles.logoLatinLarge]}>CT</Text>
      </View>
      <View style={stacked ? styles.textCenter : styles.textBlock}>
        <Text style={[styles.name, large && styles.nameLarge]}>City Terminal</Text>
        <Text style={[styles.arabicName, large && styles.arabicNameLarge]}>مدينة ترمينال</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  stacked: {
    gap: 14,
  },
  inline: {
    flexDirection: 'row',
    gap: 12,
  },
  logo: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: theme.colors.careemGreen,
    ...theme.shadows.soft,
  },
  logoLarge: {
    width: 128,
    height: 128,
    borderRadius: 36,
    borderWidth: 6,
  },
  logoArabic: {
    color: theme.colors.careemGreen,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 30,
    marginBottom: -4,
  },
  logoArabicLarge: {
    fontSize: 48,
    lineHeight: 50,
    marginBottom: -8,
  },
  logoLatin: {
    color: theme.colors.white,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 23,
  },
  logoLatinLarge: {
    fontSize: 36,
    lineHeight: 40,
  },
  textCenter: {
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'flex-start',
  },
  name: {
    color: theme.colors.black,
    fontSize: 22,
    fontWeight: '900',
  },
  nameLarge: {
    fontSize: 36,
  },
  arabicName: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  arabicNameLarge: {
    fontSize: 18,
  },
});

export default BrandMark;
