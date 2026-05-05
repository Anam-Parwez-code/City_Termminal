import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DriverTripScreen from './src/screens/DriverTripScreen';
import DriverProfileScreen from './src/screens/DriverProfileScreen';
import DriverLoginScreen from './src/screens/DriverLoginScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#060708' }} edges={['top', 'left', 'right']}>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#060708' },
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
