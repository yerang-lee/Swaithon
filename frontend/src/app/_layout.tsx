import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { MockModeBanner } from '../components/ui/MockModeBanner';

export default function RootLayout() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} /><MockModeBanner /></SafeAreaProvider>;
}
