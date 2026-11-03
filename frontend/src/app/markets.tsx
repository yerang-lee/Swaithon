import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { PageHeader } from '../components/ui/PageHeader';
import { LocationButton } from '../components/ui/LocationButton';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { LocationSettings } from '../components/maps/LocationSettings';
import { AppIcon } from '../components/ui/AppIcon';
import { getNearbyMarkets, type NearbyMarket } from '../services/api/markets';
import { readLocation, getCurrentLocation, saveLocation, isLocation, type ExplorationLocation } from '../services/explorationLocation';

export default function MarketsScreen() {
  const { selectedLocation } = useLocalSearchParams<{ selectedLocation?: string }>();
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [markets, setMarkets] = useState<NearbyMarket[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; void (async () => {
    try {
      let passed: unknown; try { passed = selectedLocation ? JSON.parse(selectedLocation) : null; } catch { passed = null; }
      const next = isLocation(passed) ? passed : (await readLocation()) ?? await getCurrentLocation();
      if (active) setLocation(next);
    } catch (e) { if (active) setError(e instanceof Error ? e.message : '위치를 확인할 수 없어요.'); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, [selectedLocation]);
  useEffect(() => {
    if (!location) return;
    let active = true;
    setMarkets([]); setMarketsError(''); setMarketsLoading(true);
    void getNearbyMarkets(location).then(result => { if (active) setMarkets(result); })
      .catch(e => { if (active) setMarketsError(e instanceof Error ? e.message : '시장 조회에 실패했어요.'); })
      .finally(() => { if (active) setMarketsLoading(false); });
    return () => { active = false; };
  }, [location, retry]);
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <PageHeader title="시장 찾기" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.body}>
      <LocationButton location={location} error={error} onPress={() => { setReady(false); setOpen(true); }} />
      <Text style={styles.heading}>주변 시장</Text>
      {loading || marketsLoading ? <ActivityIndicator accessibilityLabel="주변 시장 조회 중" color="#53B175" /> : error ? <Text style={styles.message}>{error}</Text> : marketsError ? <View><Text accessibilityRole="alert" style={styles.message}>{marketsError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={{ color: '#53B175', paddingVertical: 12 }}>다시 시도</Text></Pressable></View> : <>
        {markets.length === 0 && <Text style={styles.message}>반경 {location?.radius ?? 1}km 안에 시장이 없어요. 위치나 탐색 범위를 변경해보세요.</Text>}
        {markets.map(market => <Pressable key={market.market_id} accessibilityRole="button" onPress={() => Alert.alert(market.market_name, '시장 상세 화면은 준비 중이에요.')} style={styles.row}><View style={styles.rowText}><Text style={styles.marketName}>{market.market_name}</Text><Text style={styles.distance}>{(market.distance / 1000).toFixed(1)}km</Text></View><AppIcon name="arrow-right" size={16} color="#7C7C7C" /></Pressable>)}
      </>}
    </ScrollView>
    <BottomNavigation onSelect={tab => router.replace({ pathname: '/home', params: { tab } })} />
    <Modal visible={open} presentationStyle="fullScreen" animationType="slide" onShow={() => setReady(true)} onRequestClose={() => setOpen(false)}>{ready && <LocationSettings initial={location} onClose={() => setOpen(false)} onApply={async next => { try { await saveLocation(next); setLocation(next); setError(''); setOpen(false); } catch { Alert.alert('저장 실패', '다시 시도해주세요.'); } }} />}</Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: 'white' }, body: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' }, heading: { fontSize: 23, fontWeight: '800', color: '#181725', marginTop: 28, marginBottom: 10 }, message: { fontSize: 14, lineHeight: 22, color: '#858585', paddingVertical: 14 }, row: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingVertical: 18, paddingHorizontal: 4 }, rowText: { flex: 1 }, marketName: { fontSize: 22, fontWeight: '700', color: '#181725', marginBottom: 6 }, distance: { fontSize: 14, color: '#858585' } });
