import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import BrandMark from '../components/BrandMark';
import theme from '../theme';

const SplashScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1100,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    const timer = setTimeout(() => {
      navigation.replace('LanguageSelect');
    }, 2200);

    return () => clearTimeout(timer);
  }, [fadeAnim, navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.white} />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.logoContainer}>
          <BrandMark size="lg" />
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        </View>

        <View style={styles.bottomArea}>
          <Text style={styles.dffText}>Dubai Future Foundation</Text>
          <Text style={styles.versionText}>v1.0.0</Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  tagline: {
    fontSize: theme.fontSizes.md,
    fontWeight: '900',
    color: theme.colors.white,
    backgroundColor: theme.colors.careemGreen,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
    marginTop: 22,
  },
  bottomArea: {
    alignItems: 'center',
  },
  dffText: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.black,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: theme.colors.muted,
    fontWeight: '700',
  },
});

export default SplashScreen;
