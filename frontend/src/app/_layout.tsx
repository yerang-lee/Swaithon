import { getAuthSession } from '../services/api/auth';
import { installDiagnostics, logAppError } from '../utils/appDiagnostics';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { MockModeBanner } from '../components/ui/MockModeBanner';

installDiagnostics(() => { const session = getAuthSession(); return [session?.access_token, session?.refresh_token]; });

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { logAppError('React 화면 렌더링', error); }, [error]);
  return <View style={{ flex: 1, padding: 32, justifyContent: 'center', backgroundColor: 'white', gap: 20 }}><Text style={{ fontSize: 22, fontWeight: '700' }}>화면을 불러오지 못했어요.</Text><Pressable accessibilityRole="button" onPress={() => { void retry().catch(e => logAppError('화면 다시 시도', e)); }} style={{ padding: 16, backgroundColor: '#53B175', borderRadius: 12 }}><Text style={{ color: 'white', textAlign: 'center', fontSize: 18 }}>다시 시도</Text></Pressable></View>;
}

export default function RootLayout() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} /><MockModeBanner /></SafeAreaProvider>;
}
