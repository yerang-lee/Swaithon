import { logAppError } from '../utils/appDiagnostics';
import { demoProducts as products } from '../data/demoProducts';
import { useFavorites } from '../hooks/useFavorites';
import { ReservationsScreen } from '../components/reservations/ReservationsScreen';
import { MyPage } from '../components/auth/MyPage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { LocationButton } from '../components/ui/LocationButton';
import { PageHeader } from '../components/ui/PageHeader';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../components/ui/AppIcon';
import { LocationSettings } from '../components/maps/LocationSettings';
import { readLocation, saveLocation, getCurrentLocation, type ExplorationLocation } from '../services/explorationLocation';
import { theme } from '../constants/theme';
import { formatMarketDistance, marketDistanceParams } from '../utils/marketDistance';
import { getAuthSession } from '../services/api/auth';
import { getNearbyMarkets, type NearbyMarket } from '../services/api/markets';
import { getStoresForNearbyMarkets, type NearbyStore } from '../services/api/nearbyStores';

const green = theme.colors.primary;
const notice = (title: string) => Alert.alert(title, '이 화면은 준비 중이에요.');

export default function HomeScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => { if (tab && ['홈', '관심상품', '예약', '마이'].includes(tab)) setActive(tab); }, [tab]);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(140, (Math.min(width, 600) - 60) / 2.1);
  const [active, setActive] = useState('홈');
  const [isMerchant, setIsMerchant] = useState(false);
  useFocusEffect(useCallback(() => {
    const session = getAuthSession();
    setIsMerchant(!!session && session.expiresAt > Date.now() && session.role === 'MERCHANT');
  }, []));
  const { favorites, favoriteItems, pendingFavorites, toggleFavorite } = useFavorites();
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const locationRevision = useRef(0);
  const [nearbyMarkets, setNearbyMarkets] = useState<NearbyMarket[]>([]);
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  const [marketsError, setMarketsError] = useState('');
  const [storesError, setStoresError] = useState('');
  const [nearbyRetry, setNearbyRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const revision = locationRevision.current;
    void (async () => {
      try {
        const next = (await readLocation()) ?? await getCurrentLocation();
        if (alive && revision === locationRevision.current) { setLocation(next); setLocationError(''); }
      } catch (error) {
        logAppError('home/location', error);
        if (alive && revision === locationRevision.current) setLocationError(error instanceof Error ? error.message : '위치를 가져오지 못했어요.');
      }
    })();
    return () => { alive = false; };
  }, []));
  useEffect(() => {
    let alive = true;
    setNearbyMarkets([]); setNearbyStores([]); setMarketsError(''); setStoresError('');
    if (!location) { setMarketsLoading(false); setStoresLoading(false); return; }
    setMarketsLoading(true); setStoresLoading(true);
    let marketsReady = false;
    void (async () => {
      try {
        const markets = await getNearbyMarkets(location);
        if (!alive) return;
        marketsReady = true; setNearbyMarkets(markets); setMarketsLoading(false);
        const result = await getStoresForNearbyMarkets(markets, () => alive);
        if (!alive) return;
        setNearbyStores(result.stores);
        if (result.failedMarketCount) setStoresError(`${result.failedMarketCount}개 시장의 가게 정보를 불러오지 못했어요.`);
      } catch (error) {
        logAppError('home/nearby', error);
        if (!alive) return;
        const message = error instanceof Error ? error.message : '주변 정보를 불러오지 못했어요.';
        if (!marketsReady) setMarketsError(message);
        setStoresError(message);
      } finally {
        if (alive) { setMarketsLoading(false); setStoresLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [location, nearbyRetry]);

  if (active === '예약') return <ReservationsScreen onTab={setActive} />;

  if (active === '마이') return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <PageHeader title="마이" />
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled"><MyPage /></ScrollView>
    <BottomNavigation active={active} onSelect={setActive} />
  </SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <PageHeader title="장보소" />
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <LocationButton location={location} error={locationError} onPress={() => { setLocationReady(false); setLocationOpen(true); }} />
      <View style={styles.shortcuts}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/markets', params: location ? { selectedLocation: JSON.stringify(location) } : {} })} style={styles.shortcut}><AppIcon name="storefront" size={34} color={green} /><Text style={styles.shortcutLabel}>시장 찾기</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => notice('마감 세일')} style={styles.shortcut}><AppIcon name="clock" size={34} color={green} /><Text style={styles.shortcutLabel}>마감 세일</Text></Pressable>
      </View>
      {active === '홈' && isMerchant && <Pressable accessibilityRole="button" accessibilityLabel="상품 등록/수정하기" onPress={() => router.push('/voice')} style={({ pressed }) => [styles.merchantButton, pressed && styles.merchantButtonPressed]}>
        <View style={styles.merchantPlusCircle}><View style={styles.merchantPlusHorizontal} /><View style={styles.merchantPlusVertical} /></View>
        <Text style={styles.merchantButtonLabel}>상품 등록/수정하기</Text>
      </Pressable>}
      {active === '홈' || active === '관심상품' ? <>
        <Text style={styles.sectionTitle}>{active === '홈' ? '나를 위한 추천 상품' : '관심상품'}</Text>
        {active==='관심상품'&&favoriteItems.map(item=><View key={item.favorite_id} style={{flexDirection:'row',alignItems:'center',gap:16,paddingVertical:18,borderBottomWidth:1,borderColor:theme.colors.border}}><Pressable accessibilityRole="button" accessibilityLabel={`${item.product_name} 상세`} onPress={()=>router.push({pathname:'/products/[listingId]',params:{listingId:item.listing_id}})} style={{flex:1}}><Text style={styles.cardTitle}>{item.product_name}</Text><Text style={styles.meta}>{item.store_name}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${item.product_name} 관심 취소`} accessibilityState={{selected:true}} disabled={pendingFavorites.includes(item.listing_id)} onPress={()=>void toggleFavorite(item.listing_id)} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><AppIcon name="heart-filled" size={27} color="#E84B4B"/></Pressable></View>)}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">{products.filter(item => active === '홈' || favorites.includes(item.id)).map(item => <View key={item.id} style={[styles.card, { width: cardWidth }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 상세`} onPress={() => router.push({ pathname: '/products/[listingId]', params: { listingId: item.id } })}><View style={styles.productImage} /><Text style={styles.cardTitle}>{item.name}</Text><Text style={[styles.meta, { minHeight: 42 }]} numberOfLines={2}>{item.store} · {item.distance}</Text></Pressable>
          <View style={styles.priceRow}><Text style={styles.price}>{item.price}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${item.name} 찜 ${favorites.includes(item.id) ? '취소' : '추가'}`} accessibilityState={{ selected: favorites.includes(item.id) }} hitSlop={10} onPress={() => void toggleFavorite(item.id,{preview:true})}><AppIcon name={favorites.includes(item.id) ? "heart-filled" : "heart-outline"} size={27} color={favorites.includes(item.id) ? '#E84B4B' : '#777777'} /></Pressable></View>
        </View>)}</ScrollView>
        {products.filter(item => active === '홈' || favorites.includes(item.id)).length === 0 && (active!=='관심상품'||favoriteItems.length===0) && <Text style={styles.empty}>{active === '홈' ? '표시할 상품이 없어요.' : '하트 버튼을 눌러 상품을 담아보세요.'}</Text>}
        {active === '홈' && <>
          <PlaceSection title="내 주변 시장" cardWidth={cardWidth} loading={marketsLoading} error={marketsError} emptyMessage={!location ? locationError || '위치를 확인하고 있어요.' : `반경 ${location.radius}km 안에 시장이 없어요.`} onRetry={()=>setNearbyRetry(value=>value+1)} items={nearbyMarkets.map((market,index)=>({
            key:market.market_id===null?`unregistered:${index}`:`market:${market.market_id}`, name:market.market_name, imageUrl:market.image_url,
            distanceLabel:formatMarketDistance(market.distance), description:market.market_id===null?'미등록 시장':market.address,
            onPress:()=>{if(market.market_id===null)Alert.alert(market.market_name,'아직 서비스에 등록되지 않은 시장이에요. 시장 등록은 상인 회원가입 시 소속 시장을 선택하고 가게 정보를 등록하면 진행돼요.');else router.push({pathname:'/markets/[marketId]',params:{marketId:String(market.market_id),marketName:market.market_name,...marketDistanceParams(market.distance)}});}
          }))}/>
          <PlaceSection title="내 주변 가게" cardWidth={cardWidth} loading={storesLoading} error={storesError} emptyMessage={!location ? locationError || '위치를 확인하고 있어요.' : '주변 시장에 등록된 가게가 없어요.'} onRetry={()=>setNearbyRetry(value=>value+1)} items={nearbyStores.map(store=>({
            key:`store:${store.store_id}`, name:store.store_name, imageUrl:store.image_url,
            distanceLabel:formatMarketDistance(store.market_distance), description:`${store.market_name}${store.address?` · ${store.address}`:''}`,
            onPress:()=>router.push({pathname:'/stores/[storeId]',params:{storeId:String(store.store_id),storeName:store.store_name,...marketDistanceParams(store.market_distance),...(store.address?{address:store.address}:{})}})
          }))}/>
        </>}
      </> : <View style={styles.placeholder}><Text style={styles.sectionTitle}>예약 내역</Text><Text style={styles.meta}>화면을 준비하고 있어요.</Text></View>}
      {active==='홈'&&<Text style={styles.demo}>추천 상품은 화면 확인용 예시입니다.</Text>}
    </ScrollView>
    <BottomNavigation active={active} onSelect={setActive} />
    <Modal visible={locationOpen} presentationStyle="fullScreen" animationType="slide" onShow={() => setLocationReady(true)} onRequestClose={() => setLocationOpen(false)}>
      {locationReady && <LocationSettings initial={location} onClose={() => setLocationOpen(false)} onApply={async next => { try { await saveLocation(next); locationRevision.current++; setLocation(next); setLocationError(''); setLocationOpen(false); } catch (__caughtError) { logAppError("app/home.tsx", __caughtError);  Alert.alert('저장 실패', '위치를 저장하지 못했어요. 다시 시도해주세요.'); } }} />}
    </Modal>
  </SafeAreaView>;
}

type PlaceCard = { key: string; name: string; description: string; distanceLabel: string; imageUrl: string | null; onPress: () => void };
function PlaceImage({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = uri?.trim().replace(/^<|>$/g, '');
  useEffect(() => setFailed(false), [url]);
  return url && /^https?:\/\//.test(url) && !failed ? <Image source={{uri:url}} resizeMode="cover" style={styles.placeImage} onError={()=>{logAppError('home/place-image',new Error('주변 장소 이미지를 불러오지 못했어요.'));setFailed(true);}}/> : <View style={styles.placeImage}/>;
}
function PlaceSection({ title, items, cardWidth, loading, error, emptyMessage, onRetry }: { title: string; items: PlaceCard[]; cardWidth: number; loading: boolean; error: string; emptyMessage: string; onRetry: () => void }) {
  return <View style={styles.placeSection}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {loading&&<ActivityIndicator color={green} accessibilityLabel={`${title} 조회 중`}/>}
    {!!error&&<View><Text accessibilityRole="alert" style={styles.empty}>{error}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={{paddingVertical:10}}><Text style={{color:theme.colors.brandText}}>다시 시도</Text></Pressable></View>}
    {!loading&&!error&&!items.length&&<Text style={styles.empty}>{emptyMessage}</Text>}
    {!!items.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.grid}>{items.map(item=><Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.name} ${item.distanceLabel} ${item.description}`} onPress={item.onPress} style={[styles.card,styles.placeCard,{width:cardWidth}]}><PlaceImage uri={item.imageUrl}/><Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text><Text style={styles.meta}>{item.distanceLabel}</Text><Text style={styles.meta} numberOfLines={2}>{item.description}</Text></Pressable>)}</ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 27, fontWeight: '800', color: theme.colors.text },
  headerActions: { flexDirection: 'row', gap: 8 }, iconButton: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 24, paddingBottom: 28, width: '100%', maxWidth: 600, alignSelf: 'center' },
  location: { borderWidth: 1, borderColor: '#D5D5D5', borderRadius: theme.radii.input, minHeight: 74, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationText: { flex: 1 }, locationCaption: { fontSize: 14, color: theme.colors.muted, marginBottom: 3 }, locationLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, neighborhood: { fontSize: 20, fontWeight: '700', color: '#333333' }, radius: { fontSize: 14, color: theme.colors.muted },
  shortcuts: { flexDirection: 'row', gap: 12, marginTop: 18, marginBottom: 30 }, shortcut: { flex: 1, borderRadius: theme.radii.card, backgroundColor: '#F5FAF7', borderWidth: 1, borderColor: '#E9EFEB', minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 5 }, shortcutLabel: { fontSize: 16, fontWeight: '600', color: '#424743' },
  sectionTitle: { fontSize: 23, fontWeight: '800', color: theme.colors.text, marginBottom: 16 }, carousel: { marginRight: -24 }, grid: { gap: 12, paddingRight: 24 },
  merchantButton: { backgroundColor: green, borderRadius: 11, minHeight: 176, paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 32 },
  merchantButtonPressed: { opacity: 0.85 },
  merchantPlusCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  merchantPlusHorizontal: { position: 'absolute', width: 22, height: 5, borderRadius: 3, backgroundColor: green },
  merchantPlusVertical: { position: 'absolute', width: 5, height: 22, borderRadius: 3, backgroundColor: green },
  merchantButtonLabel: { color: '#FFFFFF', fontSize: 28, fontWeight: '600', textAlign: 'center' },
  card: { flexShrink: 0, minWidth: 0, borderRadius: theme.radii.card, borderWidth: 1, borderColor: '#E8E8E8', padding: 11 }, productImage: { height: 116, backgroundColor: '#DCDCDC', borderRadius: theme.radii.small, marginBottom: 10 }, cardTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 3 }, meta: { fontSize: 14, color: theme.colors.muted, lineHeight: 21 }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, price: { fontSize: 21, fontWeight: '700', color: theme.colors.text },
  placeSection: { marginTop: 34 }, placeCard: { minHeight: 184 }, placeImage: { height: 104, borderRadius: theme.radii.small, backgroundColor: '#DCDCDC', marginBottom: 10 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#F0F0F0', backgroundColor: '#FFFFFF', borderTopLeftRadius: theme.radii.card, borderTopRightRadius: theme.radii.card, paddingTop: 12, paddingBottom: 8, boxShadow: '0 -3px 14px rgba(0,0,0,0.04)' }, tab: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 4 }, tabLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  placeholder: { paddingVertical: 40 }, empty: { paddingVertical: 20, color: theme.colors.muted }, demo: { fontSize: 13, color: theme.colors.muted, marginTop: 26, textAlign: 'center' },
  modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.28)' }, sheet: { borderTopLeftRadius: theme.radii.sheet, borderTopRightRadius: theme.radii.sheet, padding: 24, paddingBottom: 40, backgroundColor: '#FFFFFF' }, handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#DDDDDD', alignSelf: 'center', marginBottom: 22 }, radiusOptions: { flexDirection: 'row', gap: 12, marginVertical: 22 }, radiusOption: { flex: 1, alignItems: 'center', padding: 14, borderRadius: theme.radii.input, borderWidth: 1, borderColor: theme.colors.border }, selectedRadius: { borderColor: green, backgroundColor: '#F0F9F3' }, sheetNote: { fontSize: 14, color: theme.colors.muted, lineHeight: 19, marginBottom: 20 },
});
