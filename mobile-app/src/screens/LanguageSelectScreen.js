// =============================================
// SCREEN 2 — LANGUAGE SELECT SCREEN
// =============================================
// User yahan Arabic ya English choose karta hai
// Choice ke baad RTL/LTR layout switch hota hai
// Phir Booking Screen pe jaata hai

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity, // Button jaisa — press pe response karta hai
  I18nManager,      // RTL/LTR switch karne ke liye React Native ka built-in
  Alert,
  StatusBar,
} from 'react-native';
import * as Updates from 'expo-updates';

import { useTranslation } from 'react-i18next'; // Translation hook

// =============================================
// LANGUAGE OPTIONS DATA
// =============================================
// Yahan languages define karo — easily add/remove kar sakte ho
const LANGUAGES = [
  {
    code: 'en',         // i18n language code
    name: 'English',
    nativeName: 'English',  // Apni language mein naam
    flag: '🇺🇸',            // Flag emoji
    isRTL: false,           // Left-to-right
    direction: 'LTR',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'عربي',     // Arabic mein "Arabic"
    flag: '🇦🇪',            // UAE flag
    isRTL: true,            // Right-to-left
    direction: 'RTL',
  },
];

// =============================================
// MAIN COMPONENT
// =============================================
const LanguageSelectScreen = ({ navigation }) => {

  // useTranslation — current language ki translations aati hain
  const { t, i18n: i18nInstance } = useTranslation();
  const isRTL = i18nInstance.dir() === 'rtl';

  // State — user ne konsi language select ki?
  // null = abhi kuch select nahi hua
  const [selectedLang, setSelectedLang] = useState(i18nInstance.language || 'en');

  // =============================================
  // LANGUAGE SELECT FUNCTION
  // =============================================
  const handleLanguageSelect = async (language) => {

    // STEP 1: Selected language state mein save karo
    setSelectedLang(language.code);

    // STEP 2: i18n language change karo
    // Ab t() function nai language ki translations use karega
    await i18nInstance.changeLanguage(language.code);

    // STEP 3: RTL/LTR layout switch karo
    // isRTL = true → Arabic (right-to-left)
    // isRTL = false → English (left-to-right)
    const shouldReload = I18nManager.isRTL !== language.isRTL;
    I18nManager.swapLeftAndRightInRTL(language.isRTL);
    I18nManager.allowRTL(language.isRTL);
    I18nManager.forceRTL(language.isRTL);

    // RTL/LTR apply hone ke liye app reload zaroori hota hai
    if (shouldReload) {
      try {
        await Updates.reloadAsync();
      } catch (_error) {
        Alert.alert(
          t('languageSelect.restartTitle'),
          t('languageSelect.restartMessage'),
        );
      }
    }

  };

  // =============================================
  // CONTINUE BUTTON PRESS
  // =============================================
  const handleContinue = () => {

    // Agar koi language select nahi ki toh English default
    if (!selectedLang) {
      i18nInstance.changeLanguage('en');
    }

    // BookingScreen pe navigate karo
    // Stack mein add hoga — back button kaam karega
    navigation.navigate('BookingEntry');

  };

  // =============================================
  // UI RENDER
  // =============================================
  return (
    <View style={styles.container}>

      <StatusBar barStyle="light-content" backgroundColor="#0F0F10" />

      {/* TOP HEADER AREA */}
      <View style={styles.header}>

        {/* Small logo */}
        <View style={styles.smallLogo}>
          <Text style={styles.smallLogoText}>CT</Text>
        </View>

        {/* Title — i18n se aata hai */}
        <Text style={styles.title}>{t('language.title')}</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{t('language.subtitle')}</Text>

      </View>

      {/* LANGUAGE CARDS AREA */}
      <View style={styles.cardsContainer}>

        {/* LANGUAGES array ko map karo — har language ke liye card banao */}
        {LANGUAGES.map((language) => {

          // Kya yeh language selected hai?
          const isSelected = selectedLang === language.code;

          return (
            // TouchableOpacity — press pe handleLanguageSelect chalega
            <TouchableOpacity
              key={language.code}  // React ke liye unique key zaroori hai
              style={[
                styles.languageCard,
                isSelected && styles.languageCardSelected, // Selected style add karo
              ]}
              onPress={() => handleLanguageSelect(language)} // Press pe function call
              activeOpacity={0.8}  // Press pe thoda transparent ho
            >

              {/* FLAG */}
              <Text style={styles.flag}>{language.flag}</Text>

              {/* LANGUAGE INFO */}
              <View style={styles.langInfo}>

                {/* English name */}
                <Text style={[
                  styles.langName,
                  isSelected && styles.langNameSelected
                ]}>
                  {language.name}
                </Text>

                {/* Native name (Arabic mein "عربي") */}
                <Text style={[
                  styles.langNative,
                  isSelected && styles.langNativeSelected
                ]}>
                  {language.nativeName}
                </Text>

              </View>

              {/* DIRECTION BADGE — LTR ya RTL */}
              <View style={[
                styles.dirBadge,
                isSelected && styles.dirBadgeSelected
              ]}>
                <Text style={[
                  styles.dirText,
                  isSelected && styles.dirTextSelected
                ]}>
                  {language.direction}
                </Text>
              </View>

              {/* SELECTED TICK — sirf selected card pe dikhega */}
              {isSelected && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}

            </TouchableOpacity>
          );
        })}

      </View>

      {/* CONTINUE BUTTON */}
      <View style={styles.bottomArea}>

        <TouchableOpacity
          style={[
            styles.continueButton,
            // Agar kuch select nahi toh button thoda gray
            !selectedLang && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          activeOpacity={0.9}
        >
          <Text style={styles.continueText}>
            {isRTL ? `← ${t('language.continue')}` : `${t('language.continue')} →`}
          </Text>
        </TouchableOpacity>

        {/* Skip option */}
        <TouchableOpacity onPress={() => navigation.navigate('BookingEntry')}>
          <Text style={styles.skipText}>{t('languageSelect.skip')}</Text>
        </TouchableOpacity>

      </View>

    </View>
  );
};

// =============================================
// STYLES
// =============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
    paddingTop: 60,
    paddingHorizontal: 24,
  },

  // Header Section
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },

  smallLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#00732F', // UAE Green
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    // Add shadow to logo
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  smallLogoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  // Cards Container
  cardsContainer: {
    gap: 16,
    marginBottom: 40,
  },

  // Individual Language Card
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#191A1E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#2E3138',

    // Soft Shadow
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },

  // Selected State (UAE Green theme)
  languageCardSelected: {
    borderColor: '#009A44',
    backgroundColor: '#1F2A21',
  },

  flag: {
    fontSize: 40,
    marginRight: 18,
  },

  langInfo: {
    flex: 1,
  },

  langName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },

  langNameSelected: {
    color: '#7EE08D',
  },

  langNative: {
    fontSize: 14,
    color: '#A7B0C0',
    fontWeight: '500',
  },

  langNativeSelected: {
    color: '#B4F5C4',
  },

  // Direction Badge (RTL/LTR)
  dirBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#2B2F36',
    marginRight: 12,
  },

  dirBadgeSelected: {
    backgroundColor: '#009A44',
  },

  dirText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D1D5DB',
    letterSpacing: 1,
  },

  dirTextSelected: {
    color: '#FFFFFF', // Text becomes White on Green background
  },

  // Checkmark Circle
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#009A44',
    alignItems: 'center',
    justifyContent: 'center',
    // Little red glow for vibrancy
    borderWidth: 2,
    borderColor: '#EF3340',
  },

  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Bottom Buttons Area
  bottomArea: {
    gap: 16,
    alignItems: 'center',
  },

  // Continue Button (Vibrant UAE Red)
  continueButton: {
    width: '100%',
    backgroundColor: '#EF3340',
    paddingVertical: 20,
    borderRadius: 18,
    alignItems: 'center',
    // Button Shadow
    elevation: 6,
    shadowColor: '#EE2A35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },

  continueButtonDisabled: {
    backgroundColor: '#6B7280',
    elevation: 0,
  },

  continueText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  skipText: {
    fontSize: 15,
    color: '#A7B0C0',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
export default LanguageSelectScreen;