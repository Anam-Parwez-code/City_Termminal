import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DriverLoginScreen from './src/screens/DriverLoginScreen';
import DriverTripScreen from './src/screens/DriverTripScreen';
import DriverProfileScreen from './src/screens/DriverProfileScreen';
import { loadDriverSession } from './src/sessionStorage';

const Stack = createNativeStackNavigator();

const COLORS = {
  bg: '#FFFFFF',
  green: '#47d361',
};

export default function App() {
  const [boot, setBoot] = useState(null);

  useEffect(() => {
    loadDriverSession().then((session) => {
    console.log("Loaded Session:", session); // Yeh terminal mein dekho
   // setBoot(session.vehicleId ? 'Trip' : 'Login');
 // }).catch((err) => {
    //console.error("Session load error:", err);
   // setBoot('Login');
   if (session && session.vehicleId) {
        setBoot('Trip');
      } else {
        setBoot('Login');
      }
    }).catch((err) => {
      console.error("Session load error:", err);
      setBoot('Login');
    });
  }, []);

  if (!boot) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator color={COLORS.green} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top', 'left', 'right']}>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={boot}
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="Login" component={DriverLoginScreen} />
            <Stack.Screen name="Trip" component={DriverTripScreen} />
            <Stack.Screen name="Profile" component={DriverProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
