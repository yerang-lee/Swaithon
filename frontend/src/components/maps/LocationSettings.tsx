import { PageHeader } from '../ui/PageHeader';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import KakaoMap from './KakaoMap';
import { AppIcon } from '../ui/AppIcon';
import { getCurrentLocation, isLocation, type ExplorationLocation } from '../../services/explorationLocation';
export function LocationSettings({ initial, onClose, onApply }: { initial: ExplorationLocation | null; onClose: () => void; onApply: (location: ExplorationLocation) => void }) {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={styles.safe}><PageHeader title="위치 설정" onBack={onClose} />
    {process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ? <KakaoMap initial={initial} getGps={getCurrentLocation} onMessage={data => { if (data.type === 'apply' && isLocation(data.location)) onApply(data.location); }} /> : <View style={styles.missing}><Text style={styles.title}>카카오맵 설정이 필요해요</Text><Text style={styles.message}>JavaScript 앱 키를 EXPO_PUBLIC_KAKAO_MAP_KEY에 설정하고 지도 도메인을 등록해주세요. 설정 후 지도의 주소 검색·범위 선택을 사용할 수 있어요.</Text></View>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: 'white' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 6, gap: 8 }, back: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 24, fontWeight: '700', color: '#181725' }, missing: { flex: 1, justifyContent: 'center', padding: 28, gap: 20 }, message: { fontSize: 17, lineHeight: 27, color: '#777' } });
