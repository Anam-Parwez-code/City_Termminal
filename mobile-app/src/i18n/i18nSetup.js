// =============================================
// i18n SETUP FILE — Language System Configure karo
// =============================================
// Ye file ek baar app start hone pe chalti hai
// Iske baad poori app mein translations available ho jaati hain

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
import translations from './translations';

const getInitialLanguage = () => (I18nManager.isRTL ? 'ar' : 'en');

i18n
  // react-i18next ko batao ki hum React use kar rahe hain
  .use(initReactI18next)

  // i18n initialize karo
  .init({
    // Translations import karo (humari translations.js file se)
    resources: translations,

    // Default language English rakho jab tak user choose na kare
    lng: getInitialLanguage(),

    // Agar koi translation missing ho toh fallback English mein do
    fallbackLng: 'en',

    // Nested keys ke liye separator (jaise "splash.tagline")
    keySeparator: '.',

    // Interpolation settings
    interpolation: {
      // React already XSS se protect karta hai, toh escaping off
      escapeValue: false,
    },
  });

export default i18n;