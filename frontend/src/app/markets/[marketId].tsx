import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { AppIcon } from '../../components/ui/AppIcon';
import { getMarketStores, type MarketStore, type MarketStoresPage } from '../../services/api/stores';
import { demoProducts } from '../../data/demoProducts';
import { useFavorites } from '../../hooks/useFavorites';
import { theme } from '../../constants/theme';

import { mockRequest } from '../../services/devMock';

const categories = ['전체', '채소', '과일', '정육', '수산물', '반찬', '가공식품', '곡물·견과', '떡·베이커리', '기타'];
const demoCategory: Record<string, string> = { carrot: '채소', apple: '과일', potato: '채소', pear: '과일', cucumber: '채소' };
function Thumbnail({ uri }: { uri?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return uri && /^https?:\/\//.test(uri) && !failed ? <Image source={{ uri }} style={styles.image} onError={() => setFailed(true)} /> : <View style={styles.image} />;
}
export default function MarketScreen() {
  const { marketId, marketName, preview } = useLocalSearchParams<{ marketId: string; marketName?: string; preview?: string }>();
  const [tab, setTab] = useState<'stores' | 'products'>('stores');
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('전체');
  const [stores, setStores] = useState<MarketStore[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const { favorites, toggleFavorite } = useFavorites();
  useEffect(() => {
    const timer = setTimeout(() => { setKeyword(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (tab !== 'stores') return;
    let active = true; setLoading(true); setError('');
    if (page === 1) setStores([]);
    void (preview === 'true' ? mockRequest(`/markets/${Number(marketId)}/stores?page=${page}&size=10&keyword=${encodeURIComponent(keyword)}`, 'GET') as Promise<MarketStoresPage> : getMarketStores(Number(marketId), page, keyword)).then(result => {
      if (!active) return;
      setStores(previous => page === 1 ? result.stores : [...new Map([...previous, ...result.stores].map(store => [store.store_id, store])).values()]);
      setTotal(result.total_count);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '가게 조회에 실패했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [marketId, page, keyword, retry, tab, preview]);
  const products = demoProducts.filter(product => (category === '전체' || demoCategory[product.id] === category) && `${product.name} ${product.store}`.includes(search.trim()));
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
    <PageHeader title={marketName || '시장'} onBack={() => router.back()} />
    <View style={styles.content}>
      <View style={styles.searchBox}><AppIcon name="search" size={19} color="#858585" /><TextInput accessibilityLabel={tab === 'stores' ? '가게 이름 검색' : '상품 이름 검색'} placeholder={tab === 'stores' ? '어떤 가게를 찾으세요?' : '어떤 상품을 찾으세요?'} value={search} onChangeText={setSearch} style={styles.search} returnKeyType="search" /></View>
      <View style={styles.tabs}>{([{ value: 'stores', label: '가게별' }, { value: 'products', label: '상품별' }] as const).map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: tab === item.value }} onPress={() => { setTab(item.value); setSearch(''); setKeyword(''); setPage(1); }} style={[styles.tab, tab === item.value && styles.selectedTab]}><Text style={[styles.tabLabel, tab === item.value && styles.selectedLabel]}>{item.label}</Text></Pressable>)}</View>
      {tab === 'products' && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories} contentContainerStyle={styles.categoryList}>{categories.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: category === item }} key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.selectedCategory]}><Text style={[styles.categoryLabel, category === item && styles.selectedLabel]}>{item}</Text></Pressable>)}</ScrollView>}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {preview === 'true' && <Text style={styles.previewNotice}>홈 화면 예시 시장의 미리보기입니다.</Text>}{tab === 'stores' ? <>
          {stores.map(store => <Pressable key={store.store_id} accessibilityRole="button" onPress={() => router.push({ pathname: '/stores/[storeId]', params: { storeId: String(store.store_id), storeName: store.store_name, address: store.address, preview } })} style={styles.row}><Thumbnail uri={store.image_url} /><View style={styles.details}><Text style={styles.name}>{store.store_name}</Text><Text style={styles.meta}>{store.category}</Text><Text style={styles.meta}>{store.address}</Text></View></Pressable>)}
          {loading && <ActivityIndicator accessibilityLabel="가게 목록 조회 중" color={theme.colors.primary} style={styles.status} />}
          {!!error && <View style={styles.status}><Text accessibilityRole="alert" style={styles.message}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.more}><Text style={styles.moreLabel}>다시 시도</Text></Pressable></View>}
          {!loading && !error && stores.length === 0 && <Text style={styles.message}>{keyword ? '검색한 가게가 없어요.' : '등록된 가게가 없어요.'}</Text>}
          {!loading && !error && page * 10 < total && <Pressable accessibilityRole="button" style={styles.more} onPress={() => setPage(value => value + 1)}><Text style={styles.moreLabel}>가게 더 보기</Text></Pressable>}
        </> : <>
          <Text style={styles.previewNotice}>상품 목록 연결 준비 중이에요. 아래는 실제 시장 상품이 아닌 화면 예시입니다.</Text>
          {products.map(product => <View style={styles.row} key={product.id}><Pressable accessibilityRole="button" accessibilityLabel={`${product.name} 예시 상세`} onPress={() => router.push({ pathname: '/products/[listingId]', params: { listingId: product.id } })} style={styles.product}><Thumbnail /><View style={styles.details}><Text style={styles.name}>{product.name}</Text><Text style={styles.meta}>{product.store} · 예시</Text><Text style={styles.price}>{product.price}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${product.name} 관심 ${favorites.includes(product.id) ? '취소' : '추가'}`} accessibilityState={{ selected: favorites.includes(product.id) }} onPress={() => toggleFavorite(product.id)} style={styles.heart}><AppIcon name={favorites.includes(product.id) ? 'heart-filled' : 'heart-outline'} color={favorites.includes(product.id) ? '#E84B4B' : '#858585'} size={26} /></Pressable></View>)}
          {products.length === 0 && <Text style={styles.message}>이 조건의 예시 상품이 없어요.</Text>}
        </>}
      </ScrollView>
    </View>
    <BottomNavigation active="홈" onSelect={selected => router.replace({ pathname: '/home', params: { tab: selected } })} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'white' }, content: { flex: 1, paddingHorizontal: 24, width: '100%', maxWidth: 600, alignSelf: 'center' }, searchBox: { marginTop: 12, backgroundColor: '#F2F4F3', borderRadius: 14, minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }, search: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, fontSize: 15 }, tabs: { flexDirection: 'row', borderRadius: 10, padding: 3, backgroundColor: '#F2F4F3', marginTop: 12, marginBottom: 12 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 7 }, selectedTab: { backgroundColor: theme.colors.primary }, tabLabel: { fontSize: 15, color: theme.colors.text }, selectedLabel: { color: 'white', fontWeight: '700' }, categories: { flexGrow: 0, marginBottom: 8 }, categoryList: { gap: 8, paddingVertical: 4 }, category: { backgroundColor: '#F6F6F6', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 }, selectedCategory: { backgroundColor: '#4C4C4C' }, categoryLabel: { color: '#444444', fontSize: 14 }, list: { flex: 1 }, listContent: { paddingBottom: 24 }, row: { flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderColor: '#F0F0F0', minHeight: 112, paddingVertical: 16 }, image: { width: 82, height: 82, borderRadius: 10, backgroundColor: '#DCDCDC' }, details: { flex: 1, gap: 5 }, name: { color: theme.colors.text, fontWeight: '700', fontSize: 20 }, meta: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 }, price: { color: theme.colors.text, fontSize: 21, fontWeight: '700' }, heart: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, product: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }, message: { color: theme.colors.muted, paddingVertical: 20, lineHeight: 22 }, previewNotice: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginVertical: 10 }, status: { paddingVertical: 18 }, more: { padding: 16, alignItems: 'center' }, moreLabel: { color: theme.colors.primary, fontWeight: '700', fontSize: 16 },
});
