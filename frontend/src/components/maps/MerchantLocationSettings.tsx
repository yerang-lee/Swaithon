import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { PageHeader } from '../ui/PageHeader';
import MerchantLocationMap from './MerchantLocationMap';
import { getCurrentLocation, isLocation, type ExplorationLocation } from '../../services/explorationLocation';

export function MerchantLocationSettings({ initial, onClose, onApply }: { initial: ExplorationLocation | null; onClose: () => void; onApply: (location: ExplorationLocation) => void }) {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={styles.safe}>
    <PageHeader title="가게 위치 설정" rightAction={<></>} onBack={onClose} />
    {process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ? <MerchantLocationMap initial={initial} getGps={getCurrentLocation} onMessage={data => { if (data.type === 'apply' && isLocation(data.location)) onApply(data.location); }} /> : <View style={styles.missing}><Text style={styles.title}>지도를 불러올 수 없어요</Text><Text style={styles.message}>가게 위치를 선택하려면 카카오 지도 설정이 필요해요.</Text></View>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: 'white' }, missing: { flex: 1, padding: 28, justifyContent: 'center', gap: 16 }, title: { fontSize: 22, fontWeight: '700', color: '#000000' }, message: { fontSize: 17, lineHeight: 26, color: '#777777' } });
