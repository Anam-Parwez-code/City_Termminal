import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DriverLoginScreen from './src/screens/DriverLoginScreen';
import DriverTripScreen from './src/screens/DriverTripScreen';
import DriverProfileScreen from './src/screens/DriverProfileScreen';

const Stack = createNativeStackNavigator();

const COLORS = {
  bg: '#FFFFFF',
  green: '#47d361',
};

/** Always open Login first — driver picks / confirms Driver ID before Profile */
export default function App() {
  const [boot, setBoot] = useState(null);

  useEffect(() => {
    setBoot('Login');
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
