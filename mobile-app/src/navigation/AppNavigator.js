// =============================================
// NAVIGATION SETUP — App ka Road Map
// =============================================
// Yeh file batati hai ki screens ka order kya hai
// Kaunsi screen se kaunsi screen pe jaayein

import React, { useMemo, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

// Screens import karo
import SplashScreen from '../screens/SplashScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import AuthScreen from '../screens/AuthScreen';
// Aage aane wale screens (abhi nahi bane)
import BookingEntryScreen from '../screens/BookingEntryScreen';
 import PassportScanScreen from '../screens/PassportScanScreen';
import VerificationScreen from '../screens/VerificationScreen';
import SlotBookingScreen from '../screens/SlotBookingScreen';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import LocationPickScreen from '../screens/LocationPickScreen';
import BookingConfirmScreen from '../screens/BookingConfirmScreen';
import BarcodeScreen from '../screens/BarcodeScreen';
import LiveTrackingScreen from '../screens/LiveTrackingScreen';
import TrackingScreen from '../screens/TrackingScreen';
import ArrivedScreen from '../screens/ArrivedScreen';
import ChatSupportScreen from '../screens/ChatSupportScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import TimeSlotScreen from '../screens/TimeSlotScreen';
import DriverTripScreen from '../screens/DriverTripScreen';
import DriverProfileScreen from '../screens/DriverProfileScreen';
import theme from '../theme';
import adminService from '../services/adminService';
import { loadPassengerTrip } from '../services/passengerTripStorage';
// Stack navigator create karo
// Stack = stack of screens — jaise cards ka dhair
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const getBookingIdFromRoute = (route) => {
  if (!route?.params) return '';
  return (
    route.params.bookingId ||
    route.params?.bookingData?.bookingId ||
    ''
  );
};

const AppNavigator = () => {
  const { i18n } = useTranslation();
  const direction = i18n.dir() === 'rtl' ? 'rtl' : 'ltr';
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState('');
  const bookingIdRef = useRef('');

  const hideFloatingControls = useMemo(
    () => new Set(['Splash', 'LanguageSelect', 'Auth', 'ChatSupport', 'DriverTrip', 'DriverProfile']),
    []
  );

  const handleStateChange = () => {
    const route = navigationRef.getCurrentRoute();
    setCurrentRoute(route?.name || '');
    bookingIdRef.current = getBookingIdFromRoute(route);
  };

  const navigateSafe = (name, params = {}) => {
    if (!navigationRef.isReady()) return;
    setMenuOpen(false);
    navigationRef.navigate(name, params);
  };

  const handleHomePress = async () => {
    setMenuOpen(false);
    const savedTrip = await loadPassengerTrip();
    const bookingId =
      bookingIdRef.current ||
      savedTrip?.bookingId ||
      (await adminService.getCurrentBookingId()) ||
      '';

    if (savedTrip?.atAirport && bookingId) {
      navigateSafe('Confirmation', {
        ...(savedTrip.params || {}),
        bookingId,
        isBoardingPass: true,
      });
      return;
    }

    if (bookingId && savedTrip && savedTrip.phase !== 'complete' && !savedTrip.atAirport) {
      navigateSafe('LiveTracking', {
        ...(savedTrip.params || {}),
        bookingId,
      });
      return;
    }

    if (bookingId && savedTrip?.vehicleVerified) {
      navigateSafe('UserProfile', { bookingId, ...(savedTrip.params || {}) });
      return;
    }

    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  };

  const showControls = !hideFloatingControls.has(currentRoute);

  return (
    <View style={styles.root}>
      <NavigationContainer
        ref={navigationRef}
        direction={direction}
        onReady={handleStateChange}
        onStateChange={handleStateChange}
      >
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            animation: 'fade',
          }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
          <Stack.Screen name="BookingEntry" component={BookingEntryScreen} />
          <Stack.Screen name="PassportScan" component={PassportScanScreen} />
          <Stack.Screen name="Verification" component={VerificationScreen} />
          <Stack.Screen name="SlotBooking" component={SlotBookingScreen} />
          <Stack.Screen name="LocationPick" component={LocationPickScreen} />
          <Stack.Screen name="BookingConfirm" component={BookingConfirmScreen} />
          <Stack.Screen name="Barcode" component={BarcodeScreen} />
          <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
          <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
          <Stack.Screen name="Tracking" component={TrackingScreen} />
          <Stack.Screen name="Arrived" component={ArrivedScreen} />
          <Stack.Screen name="ArrivedScreen" component={ArrivedScreen} />
          <Stack.Screen name="ChatSupport" component={ChatSupportScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="TimeSlot" component={TimeSlotScreen} />
          <Stack.Screen name="DriverTrip" component={DriverTripScreen} />
          <Stack.Screen name="DriverProfile" component={DriverProfileScreen} />
                </Stack.Navigator>
      </NavigationContainer>

      {showControls && (
        <>
          <TouchableOpacity
            style={styles.menuFab}
            onPress={() => setMenuOpen((prev) => !prev)}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>☰</Text>
          </TouchableOpacity>

          {menuOpen && (
            <View style={styles.menuCard}>
              <TouchableOpacity style={styles.menuItem} onPress={handleHomePress}>
                <Text style={styles.menuText}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => {
                  setMenuOpen(false);
                  // Wait, AdminDashboard has no profile. But let's just go to UserProfile for general case.
                  // If we wanted strictly role-based profile:
                  navigateSafe('UserProfile', { 
      bookingId: bookingIdRef.current 
    });
                }}
              >
                <Text style={styles.menuText}>My Profile</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.chatFab}
            onPress={() =>
              navigateSafe('ChatSupport', {
                bookingId: bookingIdRef.current || '',
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.chatIcon}>💬</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  menuFab: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.black,
    borderWidth: 1,
    borderColor: theme.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  chatFab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.careemGreen,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 4,
  },
  fabIcon: { color: theme.colors.white, fontSize: 24, marginTop: -2 },
  chatIcon: { fontSize: 26 },
  menuCard: {
    position: 'absolute',
    top: 108,
    left: 16,
    backgroundColor: theme.colors.black,
    borderWidth: 1,
    borderColor: theme.colors.black,
    borderRadius: 12,
    minWidth: 170,
    zIndex: 40,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuText: { color: theme.colors.white, fontSize: 14, fontWeight: '600' },
});

export default AppNavigator;
