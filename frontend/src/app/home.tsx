import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { AppIcon, IconName } from '../components/ui/AppIcon';
import { LocationSettings } from '../components/maps/LocationSettings';
import { readLocation, saveLocation, getCurrentLocation, type ExplorationLocation } from '../services/explorationLocation';
import { theme } from '../constants/theme';

const green = theme.colors.primary;
const products = [
  { id: 'carrot', name: '당근', store: '행복청과', distance: '0.2km', price: '2,500원' },
  { id: 'apple', name: '햇사과', store: '송이네과일가게', distance: '0.4km', price: '5,000원' },
];
const markets = [{ name: '용산용문시장', distance: '0.3km' }, { name: '공덕시장', distance: '1.2km' }];
const stores = [{ name: '행복청과', distance: '0.2km' }, { name: '송이네과일가게', distance: '0.4km' }];
const tabs: { label: string; icon: IconName }[] = [{ label: '홈', icon: 'home' }, { label: '관심상품', icon: 'heart-outline' }, { label: '예약', icon: 'receipt' }, { label: '마이', icon: 'account-outline' }];
const notice = (title: string) => Alert.alert(title, '이 화면은 준비 중이에요.');

export default function HomeScreen() {
  const [active, setActive] = useState('홈');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const radius = location?.radius ?? 1;
  useEffect(() => { let active = true; void (async () => { try { const saved = await readLocation(); const next = saved ?? await getCurrentLocation(); if (active) setLocation(next); } catch (error) { if (active) setLocationError(error instanceof Error ? error.message : '위치를 가져오지 못했어요.'); } })(); return () => { active = false; }; }, []);

  const toggleFavorite = (id: string) => setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const shownProducts = products.filter(item => item.name.includes(query.trim()) || item.store.includes(query.trim()));

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <View style={styles.header}><Text style={styles.brand}>장보소</Text><View style={styles.headerActions}>
      <Pressable accessibilityRole="button" accessibilityLabel="알림" onPress={() => notice('알림')} style={styles.iconButton}><AppIcon name="bell" size={27} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="설정" onPress={() => notice('설정')} style={styles.iconButton}><AppIcon name="settings" size={27} /></Pressable>
    </View></View>
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel={`위치 설정, ${location?.name || '위치 선택'} 반경 ${radius}킬로미터`} style={styles.location} onPress={() => { setLocationReady(false); setLocationOpen(true); }}>
        <AppIcon name="location-pin" size={30} color="#4C4F4D" /><View style={styles.locationText}><Text style={styles.locationCaption}>탐색 위치</Text><View style={styles.locationLine}><Text style={styles.neighborhood}>{location?.name || (locationError ? '위치 선택' : '위치 확인 중…')}</Text><Text style={styles.radius}>반경 {radius}km</Text></View></View>
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m6 9 6 6 6-6" fill="none" stroke="#B8B8B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      <View style={styles.search}><AppIcon name="search" size={20} /><TextInput accessibilityLabel="상품 검색" placeholder="어떤 상품을 찾으세요?" placeholderTextColor="#939393" value={query} onChangeText={setQuery} style={styles.searchInput} returnKeyType="search" /></View>
      <View style={styles.shortcuts}>
        <Pressable accessibilityRole="button" onPress={() => notice('시장 찾기')} style={styles.shortcut}><AppIcon name="storefront" size={34} color={green} /><Text style={styles.shortcutLabel}>시장 찾기</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => notice('마감 세일')} style={styles.shortcut}><AppIcon name="clock" size={34} color={green} /><Text style={styles.shortcutLabel}>마감 세일</Text></Pressable>
      </View>
      {active === '홈' || active === '관심상품' ? <>
        <Text style={styles.sectionTitle}>{active === '홈' ? '나를 위한 추천 상품' : '관심상품'}</Text>
        <View style={styles.grid}>{shownProducts.filter(item => active === '홈' || favorites.includes(item.id)).map(item => <View key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 상세`} onPress={() => notice(item.name)}><View style={styles.productImage} /><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.meta}>{item.store} · {item.distance}</Text></Pressable>
          <View style={styles.priceRow}><Text style={styles.price}>{item.price}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 찜 ${favorites.includes(item.id) ? '취소' : '추가'}`} accessibilityState={{ selected: favorites.includes(item.id) }} hitSlop={10} onPress={() => toggleFavorite(item.id)}><AppIcon name={favorites.includes(item.id) ? "heart-filled" : "heart-outline"} size={27} color={favorites.includes(item.id) ? '#E84B4B' : '#777777'} /></Pressable></View>
        </View>)}</View>
        {shownProducts.filter(item => active === '홈' || favorites.includes(item.id)).length === 0 && <Text style={styles.empty}>{active === '홈' ? '검색한 상품이 없어요.' : '하트 버튼을 눌러 상품을 담아보세요.'}</Text>}
        {active === '홈' && <><PlaceSection title="내 주변 시장" items={markets} /><PlaceSection title="내 주변 가게" items={stores} /></>}
      </> : <View style={styles.placeholder}><Text style={styles.sectionTitle}>{active === '예약' ? '예약 내역' : '마이페이지'}</Text><Text style={styles.meta}>화면을 준비하고 있어요.</Text></View>}
      <Text style={styles.demo}>현재 상품·시장·가게는 화면 확인용 예시입니다.</Text>
    </ScrollView>
    <View style={styles.tabbar}>{tabs.map(tab => <Pressable key={tab.label} accessibilityRole="tab" accessibilityState={{ selected: active === tab.label }} onPress={() => setActive(tab.label)} style={styles.tab}><AppIcon name={tab.icon} size={26} color={active === tab.label ? green : '#181725'} /><Text style={[styles.tabLabel, active === tab.label && { color: green }]}>{tab.label}</Text></Pressable>)}</View>
    <Modal visible={locationOpen} presentationStyle="fullScreen" animationType="slide" onShow={() => setLocationReady(true)} onRequestClose={() => setLocationOpen(false)}>
      {locationReady && <LocationSettings initial={location} onClose={() => setLocationOpen(false)} onApply={async next => { try { await saveLocation(next); setLocation(next); setLocationError(''); setLocationOpen(false); } catch { Alert.alert('저장 실패', '위치를 저장하지 못했어요. 다시 시도해주세요.'); } }} />}
    </Modal>
  </SafeAreaView>;
}

function PlaceSection({ title, items }: { title: string; items: typeof markets }) {
  return <View style={styles.placeSection}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.grid}>{items.map(item => <Pressable key={item.name} accessibilityRole="button" onPress={() => notice(item.name)} style={[styles.card, styles.placeCard]}><View style={styles.placeImage} /><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.meta}>{item.distance}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 27, fontWeight: '800', color: theme.colors.text },
  headerActions: { flexDirection: 'row', gap: 8 }, iconButton: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 24, paddingBottom: 28, width: '100%', maxWidth: 600, alignSelf: 'center' },
  location: { borderWidth: 1, borderColor: '#D5D5D5', borderRadius: theme.radii.input, minHeight: 74, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationText: { flex: 1 }, locationCaption: { fontSize: 14, color: theme.colors.muted, marginBottom: 3 }, locationLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, neighborhood: { fontSize: 20, fontWeight: '700', color: '#333333' }, radius: { fontSize: 14, color: theme.colors.muted },
  search: { marginTop: 16, backgroundColor: '#F2F3F2', borderRadius: theme.radii.input, minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 12, color: theme.colors.text },
  shortcuts: { flexDirection: 'row', gap: 12, marginTop: 18, marginBottom: 30 }, shortcut: { flex: 1, borderRadius: theme.radii.card, backgroundColor: '#F5FAF7', borderWidth: 1, borderColor: '#E9EFEB', minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 5 }, shortcutLabel: { fontSize: 16, fontWeight: '600', color: '#424743' },
  sectionTitle: { fontSize: 23, fontWeight: '800', color: theme.colors.text, marginBottom: 16 }, grid: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, borderRadius: theme.radii.card, borderWidth: 1, borderColor: '#E8E8E8', padding: 11 }, productImage: { height: 116, backgroundColor: '#DCDCDC', borderRadius: theme.radii.small, marginBottom: 10 }, cardTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 3 }, meta: { fontSize: 14, color: theme.colors.muted, lineHeight: 21 }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, price: { fontSize: 21, fontWeight: '700', color: theme.colors.text },
  placeSection: { marginTop: 34 }, placeCard: { minHeight: 184 }, placeImage: { height: 104, borderRadius: theme.radii.small, backgroundColor: '#DCDCDC', marginBottom: 10 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#F0F0F0', backgroundColor: '#FFFFFF', borderTopLeftRadius: theme.radii.card, borderTopRightRadius: theme.radii.card, paddingTop: 12, paddingBottom: 8, boxShadow: '0 -3px 14px rgba(0,0,0,0.04)' }, tab: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 4 }, tabLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  placeholder: { paddingVertical: 40 }, empty: { paddingVertical: 20, color: theme.colors.muted }, demo: { fontSize: 13, color: theme.colors.muted, marginTop: 26, textAlign: 'center' },
  modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.28)' }, sheet: { borderTopLeftRadius: theme.radii.sheet, borderTopRightRadius: theme.radii.sheet, padding: 24, paddingBottom: 40, backgroundColor: '#FFFFFF' }, handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#DDDDDD', alignSelf: 'center', marginBottom: 22 }, radiusOptions: { flexDirection: 'row', gap: 12, marginVertical: 22 }, radiusOption: { flex: 1, alignItems: 'center', padding: 14, borderRadius: theme.radii.input, borderWidth: 1, borderColor: theme.colors.border }, selectedRadius: { borderColor: green, backgroundColor: '#F0F9F3' }, sheetNote: { fontSize: 14, color: theme.colors.muted, lineHeight: 19, marginBottom: 20 },
});
