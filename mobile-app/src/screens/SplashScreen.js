// =============================================
// SCREEN 1 — SPLASH SCREEN
// =============================================
// Yeh app ka pehla screen hai
// 3 seconds ke baad automatically Language Screen pe jaata hai

import React, { useEffect } from 'react';
import {
  View,         // Box/container banana ke liye (jaise div in HTML)
  Text,         // Text dikhane ke liye
  StyleSheet,   // CSS jaisi styling ke liye
  Animated,     // Animation ke liye (fade in effect)
  StatusBar,    // Phone ke top bar ka color change karne ke liye
  Dimensions,   // Screen ki width/height lene ke liye
} from 'react-native';

import { useTranslation } from 'react-i18next'; // Translation hook

// Phone ki screen dimensions lelo
const { width, height } = Dimensions.get('window');

// =============================================
// MAIN COMPONENT
// =============================================
const SplashScreen = ({ navigation }) => {
  // useTranslation hook se 't' function milta hai
  // t('splash.tagline') → translations.js se text laata hai
  const { t } = useTranslation();

  // Animated value banao — 0 se shuru hoga (invisible)
  // Phir 1 pe aayega (fully visible) — yeh fade-in animation hai
  const fadeAnim = new Animated.Value(0);

  // useEffect — component load hone ke baad chalega
  useEffect(() => {

    // STEP 1: Fade-in animation shuru karo
    Animated.timing(fadeAnim, {
      toValue: 1,         // 0 se 1 tak jaao (invisible → visible)
      duration: 1500,     // 1.5 seconds mein
      useNativeDriver: true, // Native animation use karo (fast)
    }).start(); // Animation shuru karo

    // STEP 2: 3 seconds baad Login/Auth screen pe navigate karo
    const timer = setTimeout(() => {
      // navigation.replace — Splash ko replace karo Auth Screen se
      // replace isliye taaki back button dabane pe Splash na aaye
      navigation.replace('Auth');
    }, 3000); // 3000 milliseconds = 3 seconds

    // CLEANUP: Component unmount hone pe timer cancel karo
    // Warna memory leak hoga
    return () => clearTimeout(timer);

  }, []); // [] matlab sirf ek baar chalega (mount pe)

  // =============================================
  // UI RENDER
  // =============================================
  return (
    // Outer container — poora screen cover karta hai
    <View style={styles.container}>

      {/* Phone ka status bar white color mein */}
      <StatusBar barStyle="light-content" backgroundColor="#0F0F10" />

      {/* Animated.View — iske andar jo bhi hai wo fade hoga */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

        {/* LOGO AREA */}
        <View style={styles.logoContainer}>

          {/* Logo circle — real app mein image hogi */}
          <View style={styles.logoCircle}>
            {/* CT = City Terminal initials */}
            <Text style={styles.logoText}>CT</Text>
          </View>

          {/* App name */}
          <Text style={styles.appName}>City Terminal</Text>

          {/* Tagline — translations.js se aata hai */}
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>

        </View>

        {/* BOTTOM AREA */}
        <View style={styles.bottomArea}>

          {/* Dubai Future Foundation credit */}
          <Text style={styles.dffText}>Dubai Future Foundation</Text>
          <Text style={styles.versionText}>v1.0.0</Text>

        </View>

      </Animated.View>

    </View>
  );
};

// =============================================
// STYLES — React Native CSS
// =============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },

  logoContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },

  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    // White background with slight transparency
    backgroundColor: '#FFFFFF', 
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    // Red shadow/border effect for vibrancy
    borderWidth: 4,
    borderColor: '#EF3340',
    elevation: 15, // Android shadow
    shadowColor: '#EF3340',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },

  logoText: {
    fontSize: 54,
    fontWeight: '900',
    // Green text on White circle
    color: '#009A44',
    letterSpacing: 2,
  },

  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase', // Professional look
    marginBottom: 8,
  },

  tagline: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    backgroundColor: '#EF3340',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    letterSpacing: 1,
    textAlign: 'center',
  },

  bottomArea: {
    alignItems: 'center',
  },

  dffText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  versionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
});
export default SplashScreen;