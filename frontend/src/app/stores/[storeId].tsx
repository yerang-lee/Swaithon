import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { AppIcon } from '../../components/ui/AppIcon';
import StoreMap from '../../components/maps/StoreMap';
import { getCurrentLocation, type ExplorationLocation } from '../../services/explorationLocation';
import { isMockMode } from '../../services/devMock';
import { getStore, getStoreProducts, type StoreDetail, type StoreListing } from '../../services/api/stores';
import { useFavorites } from '../../hooks/useFavorites';

// 상세 API 필드 미확정: 테스트 모드에서만 사용하는 화면 예시입니다.
const samples = [
  { id: 'apple', name: '햇사과', price: 5000, salePrice: 4000, status: 'available', image: '' },
  { id: 'carrot', name: '당근', price: 2500, salePrice: null, status: 'available', image: '' },
  { id: 'pear', name: '배', price: 6000, salePrice: null, status: 'soldOut', image: '' },
  { id: 'potato', name: '감자', price: 3000, salePrice: 2500, status: 'ended', image: '' },
];
function distanceKm(from: ExplorationLocation, lat: number, lng: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat - from.latitude) * rad / 2) ** 2 + Math.cos(from.latitude * rad) * Math.cos(lat * rad) * Math.sin((lng - from.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export default function StoreScreen() {
  const params = useLocalSearchParams<{ storeId: string; storeName?: string; address?: string; preview?: string }>();
  const mock = isMockMode() || params.preview === 'true';
  const [resolved, setResolved] = useState<{ latitude: number; longitude: number } | null>(null);
  const coordinates = mock ? { latitude: 37.5414, longitude: 126.961 } : resolved;
  const onLocated = useCallback((latitude: number, longitude: number) => setResolved(previous => previous?.latitude === latitude && previous.longitude === longitude ? previous : { latitude, longitude }), []);
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [distance, setDistance] = useState<string | null>(null);
  const [distanceError, setDistanceError] = useState('');
  const [retry, setRetry] = useState(0);
  const { favorites, toggleFavorite } = useFavorites();
  useEffect(() => {
    if (!coordinates) return;
    let active = true; setDistanceError('');
    void getCurrentLocation().then(location => { if (active) setDistance(`${distanceKm(location, coordinates.latitude, coordinates.longitude).toFixed(1)}km`); }).catch(() => { if (active) setDistanceError('현재 위치를 확인할 수 없어요.'); });
    return () => { active = false; };
  }, [mock, retry, coordinates?.latitude, coordinates?.longitude]);
  useEffect(() => {
    if (mock) return;
    let active = true; setLoading(true); setError('');
    void Promise.all([getStore(Number(params.storeId)), getStoreProducts(Number(params.storeId), page)]).then(([detail, result]) => {
      if (!active) return;
      setStore(detail); setTotal(result.total_count);
      setListings(previous => page === 1 ? result.products : [...new Map([...previous, ...result.products].map(p => [p.listing_id, p])).values()]);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '가게 정보를 불러오지 못했어요.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mock, params.storeId, page, retry]);
  const products = mock ? samples : listings.map(p => ({ id: p.listing_id, name: p.product_name, price: p.price, salePrice: p.is_on_sale ? p.sale_price : null, status: p.is_sold_out ? 'soldOut' : 'available', image: p.image_url.replace(/^<|>$/g, '') }));
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <PageHeader title="" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.map}>{(coordinates || store?.address) && process.env.EXPO_PUBLIC_KAKAO_MAP_KEY ? <StoreMap latitude={mock ? coordinates?.latitude : undefined} longitude={mock ? coordinates?.longitude : undefined} address={store?.address} onLocated={onLocated} /> : <View style={styles.mapFallback}><AppIcon name="location-pin" size={42} color="#53B175" /><Text style={styles.meta}>{coordinates ? '지도 설정 후 가게 위치가 표시돼요.' : '가게 위치 정보를 준비 중이에요.'}</Text></View>}</View>
      <View style={styles.info}><View style={styles.nameRow}><Text style={styles.storeName}>{store?.store_name || params.storeName || '가게'}</Text>{distance && <Text style={styles.meta}>{distance}</Text>}</View><Text style={styles.address}>{mock ? '서울특별시 용산구 효창원로42길 (테스트 주소)' : store?.address || params.address || '주소 정보 없음'}</Text>{!!distanceError && <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={styles.meta}>{distanceError} 다시 시도</Text></Pressable>}</View>
      {mock && <Text style={styles.notice}>가게 위치·상품은 테스트 예시입니다.</Text>}{products.map(product => {
        const unavailable = product.status !== 'available';
        const discounted = product.salePrice !== null && product.salePrice < product.price;
        return <View style={[styles.row, unavailable && styles.unavailable]} key={product.id}>
          <Pressable accessibilityRole="button" disabled={unavailable} accessibilityLabel={`${product.name}${unavailable ? ' 판매 불가' : ' 상세'}`} onPress={() => router.push({ pathname: '/products/[listingId]', params: { listingId: product.id } })} style={styles.product}>
            <View style={styles.imageBox}>{product.image ? <Image source={{ uri: product.image }} style={styles.image} /> : <View style={styles.image} />}{unavailable && <View style={styles.imageOverlay}><Text style={styles.badge}>{product.status === 'soldOut' ? '품절' : '판매 종료'}</Text></View>}</View>
            <View style={styles.productInfo}><Text style={[styles.productName, unavailable && styles.muted]}>{product.name}</Text>{discounted && <Text style={styles.oldPrice}>{product.price.toLocaleString('ko-KR')}원</Text>}<Text style={[styles.price, unavailable && styles.muted]}>{(discounted ? product.salePrice! : product.price).toLocaleString('ko-KR')}원</Text>{unavailable && <Text style={styles.meta}>{product.status === 'soldOut' ? '품절' : '판매 종료'}</Text>}</View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${product.name} 관심 ${favorites.includes(product.id) ? '취소' : '추가'}`} accessibilityState={{ selected: favorites.includes(product.id) }} onPress={() => toggleFavorite(product.id)} style={styles.heart}><AppIcon name={favorites.includes(product.id) ? 'heart-filled' : 'heart-outline'} size={26} color={favorites.includes(product.id) ? '#E84B4B' : '#858585'} /></Pressable>
        </View>;
      })}
      {loading && <ActivityIndicator color="#53B175" />}
      {!!error && <View><Text accessibilityRole="alert" style={styles.notice}>{error}</Text><Pressable onPress={() => setRetry(v => v + 1)}><Text style={styles.notice}>다시 시도</Text></Pressable></View>}
      {!mock && !loading && !error && products.length === 0 && <Text style={styles.notice}>등록된 상품이 없어요.</Text>}
      {!mock && !loading && !error && page * 10 < total && <Pressable onPress={() => setPage(v => v + 1)}><Text style={styles.notice}>상품 더 보기</Text></Pressable>}
    </ScrollView>
    <BottomNavigation active="홈" onSelect={tab => router.replace({ pathname: '/home', params: { tab } })} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'white' }, body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, width: '100%', maxWidth: 600, alignSelf: 'center' }, map: { height: 250, borderRadius: 12, overflow: 'hidden', backgroundColor: '#EEF2EF' }, mapFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 20 }, info: { paddingVertical: 22, gap: 10, borderBottomWidth: 1, borderColor: '#EEEEEE' }, nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, storeName: { fontSize: 26, fontWeight: '700', color: '#181725' }, address: { fontSize: 16, color: '#777777', lineHeight: 24 }, meta: { color: '#858585', fontSize: 13, lineHeight: 20 }, notice: { color: '#858585', fontSize: 13, lineHeight: 20, marginVertical: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: '#EEEEEE', paddingVertical: 18 }, product: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }, imageBox: { width: 84, height: 84, borderRadius: 10, overflow: 'hidden' }, image: { width: '100%', height: '100%', backgroundColor: '#DDDDDD' }, imageOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#FFFFFF99', justifyContent: 'center', alignItems: 'center' }, badge: { backgroundColor: '#777777', color: 'white', fontSize: 12, fontWeight: '700', borderRadius: 4, padding: 5 }, productInfo: { flex: 1, gap: 4 }, productName: { fontSize: 20, fontWeight: '500', color: '#181725' }, price: { fontSize: 22, fontWeight: '700', color: '#181725' }, oldPrice: { fontSize: 14, color: '#999999', textDecorationLine: 'line-through' }, heart: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, unavailable: { backgroundColor: '#FFFFFF' }, muted: { color: '#999999' },
});
