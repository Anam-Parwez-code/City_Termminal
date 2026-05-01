// =============================================
// APP.JS — Entry Point (Pehli file jo chalti hai)
// =============================================
// Yeh poori app ka starting point hai
// Jab Expo app open hoti hai, yeh file pehle chalti hai

import React from 'react';

// i18n setup PEHLE import karo — baki sab se pehle
// Isliye ki koi bhi screen render hone se pehle translations ready ho
import './src/i18n/i18nSetup';

// Hamara navigation system
import AppNavigator from './src/navigation/AppNavigator';

// =============================================
// ROOT COMPONENT
// =============================================
export default function App() {
  return (
    // AppNavigator — yeh sab screens manage karta hai
    // Splash → Language → Booking → etc.
    <AppNavigator />
  );
}