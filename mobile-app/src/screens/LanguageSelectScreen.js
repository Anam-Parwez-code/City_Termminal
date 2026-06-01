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
import FlagImage from '../components/FlagImage';
import theme from '../theme';

// =============================================
// LANGUAGE OPTIONS DATA
// =============================================
// Yahan languages define karo — easily add/remove kar sakte ho
const LANGUAGES = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    countryCode: 'us',
    isRTL: false,
    direction: 'LTR',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'عربي',
    countryCode: 'ae',
    isRTL: true,
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
    if (typeof I18nManager.swapLeftAndRightInRTL === 'function') {
      I18nManager.swapLeftAndRightInRTL(language.isRTL);
    }
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
    navigation.navigate('Auth');

  };

  // =============================================
  // UI RENDER
  // =============================================
  return (
    <View style={styles.container}>

      <StatusBar barStyle="light-content" backgroundColor={theme.colors.black} />

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

              <FlagImage
                countryCode={language.countryCode}
                size={48}
                style={[styles.flagImage, isRTL && styles.flagImageRtl]}
              />

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
        <TouchableOpacity onPress={() => navigation.navigate('Auth')}>
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
    backgroundColor: theme.colors.white,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  smallLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...theme.shadows.soft,
  },
  smallLogoText: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.white,
    letterSpacing: 2,
  },
  title: {
    fontSize: theme.fontSizes.title,
    fontWeight: '900',
    color: theme.colors.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  cardsContainer: {
    gap: 16,
    marginBottom: 40,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radii.card,
    padding: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.card,
  },
  languageCardSelected: {
    borderColor: theme.colors.careemGreen,
    backgroundColor: theme.colors.white,
  },
  flagImage: {
    marginRight: 18,
  },
  flagImageRtl: {
    marginRight: 0,
    marginLeft: 18,
  },
  langInfo: {
    flex: 1,
  },
  langName: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.black,
    marginBottom: 4,
  },
  langNameSelected: {
    color: theme.colors.black,
  },
  langNative: {
    fontSize: 14,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  langNativeSelected: {
    color: theme.colors.muted,
  },
  dirBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.white,
    marginRight: 12,
  },
  dirBadgeSelected: {
    backgroundColor: theme.colors.careemGreen,
  },
  dirText: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.black,
    letterSpacing: 1,
  },
  dirTextSelected: {
    color: theme.colors.white,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.careemGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  checkmarkText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomArea: {
    gap: 16,
    alignItems: 'center',
  },
  continueButton: {
    width: '100%',
    backgroundColor: theme.colors.careemGreen,
    paddingVertical: 20,
    borderRadius: theme.radii.button,
    alignItems: 'center',
    shadowColor: theme.colors.careemGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  continueButtonDisabled: {
    backgroundColor: '#9CA3AF',
    elevation: 0,
  },
  continueText: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.white,
  },
  skipText: {
    fontSize: 15,
    color: theme.colors.black,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
export default LanguageSelectScreen;
