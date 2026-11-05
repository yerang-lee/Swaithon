import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../ui/PageHeader';
import { PrimaryButton } from '../ui/PrimaryButton';
import { AuthField } from '../ui/AuthField';
import { AppIcon } from '../ui/AppIcon';
import { LocationSettings } from '../maps/LocationSettings';
import type { ExplorationLocation } from '../../services/explorationLocation';
import { getNearbyMarkets, type NearbyMarket } from '../../services/api/markets';

export type SignupProfile = { role: 'customer' | 'merchant'; storeName?: string; storeLocation?: ExplorationLocation; marketId?: number };
export function SignupRoleStep({ onBack, onComplete, loading, error }: { onBack: () => void; onComplete: (profile: SignupProfile) => Promise<void>; loading: boolean; error: string }) {
  const [role, setRole] = useState<SignupProfile['role'] | null>(null);
  const [storeName, setStoreName] = useState('');
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState('');
  const [markets, setMarkets] = useState<NearbyMarket[]>([]);
  const [marketId, setMarketId] = useState<number | undefined>();
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  useEffect(() => {
    let active = true;
    setMarkets([]); setMarketId(undefined); setMarketError('');
    if (role !== 'merchant' || !location) { setMarketsLoading(false); return; }
    setMarketsLoading(true);
    void getNearbyMarkets(location).then(result => { if (active) setMarkets(result); })
      .catch(e => { if (active) setMarketError(e instanceof Error ? e.message : '시장을 불러오지 못했어요.'); })
      .finally(() => { if (active) setMarketsLoading(false); });
    return () => { active = false; };
  }, [location, role]);
  const lock = useRef(false);
  async function complete() {
    if (lock.current || !role) return;
    if (role === 'merchant' && (!storeName.trim() || !location)) { setValidation('가게 이름과 위치를 설정해주세요.'); return; }
    setValidation(''); lock.current = true;
    try { await onComplete(role === 'merchant' ? { role, storeName: storeName.trim(), storeLocation: location!, ...(marketId !== undefined ? { marketId } : {}) } : { role }); }
    finally { lock.current = false; }
  }
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <PageHeader title="회원가입" onBack={() => { if (!loading) onBack(); }} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      <Text style={styles.title}>어떻게 이용하실 건가요?</Text><Text style={styles.subtitle}>이용 유형을 선택해주세요.</Text>
      <View style={styles.roles}>{([{ value: 'customer', label: '고객', icon: 'account-outline' }, { value: 'merchant', label: '상인', icon: 'storefront' }] as const).map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: role === item.value }} disabled={loading} onPress={() => { setRole(item.value); setValidation(''); }} style={[styles.role, role === item.value && styles.selected]}><AppIcon name={item.icon} size={40} color={role === item.value ? '#53B175' : '#858585'} /><Text style={styles.roleText}>{item.label}</Text></Pressable>)}</View>
      {role === 'merchant' && <View style={styles.store}><AuthField label="가게 이름" value={storeName} onChangeText={setStoreName} editable={!loading} placeholder="가게 이름을 입력해주세요" /><Text style={styles.label}>가게 위치</Text><Pressable accessibilityRole="button" disabled={loading} onPress={() => { setReady(false); setOpen(true); }} style={styles.location}><AppIcon name="location-pin" color="#53B175" /><Text style={styles.locationText}>{location?.name || '지도에서 가게 위치 설정'}</Text><AppIcon name="arrow-right" size={16} /></Pressable>{location && <Text style={styles.subtitle}>지도에서 선택한 좌표로 저장됩니다.</Text>}</View>}
      {!!(validation || error) && <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text>}
      {role === 'merchant' && location && <View style={{ marginTop: 24 }}><Text style={styles.label}>소속 시장 (선택)</Text>
        {marketsLoading ? <Text style={styles.subtitle}>주변 시장을 불러오는 중이에요.</Text> : marketError ? <Text style={styles.subtitle}>{marketError}</Text> : markets.length === 0 ? <Text style={styles.subtitle}>주변 시장이 없어요. 위치나 반경을 변경해보세요.</Text> : <>
          <Pressable disabled={loading} accessibilityRole="radio" accessibilityState={{ checked: marketId === undefined }} onPress={() => setMarketId(undefined)} style={styles.location}><Text style={styles.locationText}>선택 안 함</Text>{marketId === undefined && <Text style={{ color: '#53B175' }}>✓</Text>}</Pressable>
          {markets.map(market => <Pressable key={market.market_id} disabled={loading} accessibilityRole="radio" accessibilityState={{ checked: marketId === market.market_id }} onPress={() => setMarketId(market.market_id)} style={[styles.location, { marginTop: 8, borderColor: marketId === market.market_id ? '#53B175' : '#E2E2E2' }]}><Text style={styles.locationText}>{market.market_name}</Text>{marketId === market.market_id && <Text style={{ color: '#53B175' }}>✓</Text>}</Pressable>)}
        </>}
      </View>}
      <View style={{ marginTop: 32 }}><PrimaryButton title="완료" disabled={!role || loading} loading={loading} onPress={complete} /></View>
    </ScrollView></KeyboardAvoidingView>
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onShow={() => setReady(true)} onRequestClose={() => setOpen(false)}>{ready && <LocationSettings initial={location} onClose={() => setOpen(false)} onApply={next => { setLocation(next); setOpen(false); }} />}</Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: 'white' }, body: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, width: '100%', maxWidth: 520, alignSelf: 'center' }, title: { fontSize: 26, fontWeight: '700', color: '#181725' }, subtitle: { fontSize: 15, color: '#858585', lineHeight: 23, marginTop: 10 }, roles: { flexDirection: 'row', gap: 16, marginTop: 30 }, role: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 16, borderWidth: 1.5, borderColor: '#E2E2E2', borderRadius: 16 }, selected: { backgroundColor: '#F1F9F4', borderColor: '#53B175' }, roleText: { fontSize: 21, fontWeight: '600', color: '#181725' }, store: { marginTop: 36 }, label: { fontSize: 18, fontWeight: '600', color: '#858585', marginBottom: 14 }, location: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 12, padding: 16 }, locationText: { flex: 1, fontSize: 16, color: '#181725' }, error: { color: '#C23D3D', fontSize: 15, lineHeight: 23, marginTop: 20 } });
