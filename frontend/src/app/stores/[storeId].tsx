import { logAppError } from '../../utils/appDiagnostics';
import { useCatalogRevision } from '../../services/catalogChanges';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/ui/PageHeader';
import { ListingImage } from '../../components/products/ListingImage';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { AppIcon } from '../../components/ui/AppIcon';
import { isMockMode } from '../../services/devMock';
import {
  getStore,
  getStoreProducts,
  type StoreDetail,
  type StoreListing,
} from '../../services/api/stores';
import { useMarketDistance } from '../../hooks/useMarketDistance';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../../utils/marketDistance';
import { getAuthSession, getMyStoreId } from '../../services/api/auth';
import { useFavorites } from '../../hooks/useFavorites';

// 상세 API 필드 미확정: 테스트 모드에서만 사용하는 화면 예시입니다.
const samples = [
  {
    id: 'apple',
    name: '햇사과',
    price: 5000,
    salePrice: 4000,
    status: 'available',
    image: '',
  },
  {
    id: 'carrot',
    name: '당근',
    price: 2500,
    salePrice: null,
    status: 'available',
    image: '',
  },
  {
    id: 'pear',
    name: '배',
    price: 6000,
    salePrice: null,
    status: 'soldOut',
    image: '',
  },
  {
    id: 'potato',
    name: '감자',
    price: 3000,
    salePrice: 2500,
    status: 'ended',
    image: '',
  },
];
function StorePhoto({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  const imageUri = uri?.trim().replace(/^<|>$/g, '');
  useEffect(() => setFailed(false), [imageUri]);
  return (
    <View style={styles.storePhoto}>
      {imageUri && /^https?:\/\//.test(imageUri) && !failed ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.storePhotoImage}
          resizeMode="cover"
          accessibilityLabel="가게 대표 이미지"
          onError={() => {
            logAppError(
              'store/representative-image',
              new Error('가게 대표 이미지를 불러오지 못했어요.'),
            );
            setFailed(true);
          }}
        />
      ) : (
        <View style={styles.photoFallback}>
          <AppIcon name="storefront" size={48} color="#A0AFA5" />
          <Text style={styles.meta}>
            {failed
              ? '가게 이미지를 불러오지 못했어요.'
              : '등록된 가게 이미지가 없어요.'}
          </Text>
        </View>
      )}
    </View>
  );
}
export default function StoreScreen() {
  const catalogRevision = useCatalogRevision();
  const params = useLocalSearchParams<{
    storeId: string;
    storeName?: string;
    address?: string;
    preview?: string;
    marketDistanceMeters?: string;
  }>();
  const mock = isMockMode() || params.preview === 'true';
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const session = getAuthSession();
  const [resolvedOwner, setResolvedOwner] = useState<{
    token: string;
    storeId: number;
  } | null>(null);
  const ownerStoreId =
    session?.storeId ??
    (resolvedOwner?.token === session?.access_token
      ? resolvedOwner?.storeId
      : undefined);
  const ownStore =
    session?.role === 'MERCHANT' &&
    String(ownerStoreId ?? '') === String(params.storeId);
  useEffect(() => {
    if (getAuthSession()?.role !== 'MERCHANT') return;
    let active = true;
    const token = getAuthSession()!.access_token;
    void getMyStoreId()
      .then((id) => {
        if (active) setResolvedOwner({ token, storeId: id });
      })
      .catch((error) => {
        logAppError('store/ownership', error);
      });
    return () => {
      active = false;
    };
  }, [params.storeId, session?.access_token]);
  const marketDistance = useMarketDistance(
    ownStore ? undefined : store?.market_id,
    ownStore ? undefined : params.marketDistanceMeters,
    mock,
  );
  const distanceParams = marketDistanceParams(marketDistance);
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  useEffect(() => {
    if (mock) return;
    let active = true;
    setLoading(true);
    setError('');
    void Promise.allSettled([
      getStore(Number(params.storeId)).then((detail) => {
        if (active) setStore(detail);
        return detail;
      }),
      getStoreProducts(Number(params.storeId), page),
    ])
      .then(([detail, result]) => {
        if (!active) return;
        const errors: string[] = [];
        if (detail.status === 'rejected') {
          logAppError('store/details', detail.reason);
          errors.push('가게 정보를 불러오지 못했어요.');
        }
        if (result.status === 'rejected') {
          logAppError('store/products', result.reason);
          errors.push('상품 목록을 불러오지 못했어요.');
          setError(errors.join(' '));
          return;
        }
        setError(errors.join(' '));
        setTotal(result.value.total_count);
        setListings((previous) =>
          page === 1
            ? result.value.products
            : [
                ...new Map(
                  [...previous, ...result.value.products].map((p) => [
                    p.listing_id,
                    p,
                  ]),
                ).values(),
              ],
        );
      })
      .catch((e) => {
        logAppError('app/stores/[storeId].tsx', e);
        if (active)
          setError(
            e instanceof Error ? e.message : '가게 정보를 불러오지 못했어요.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mock, params.storeId, page, retry, catalogRevision]);
  const products = mock
    ? samples
    : listings.map((p) => ({
        id: String(p.listing_id),
        name: p.product_name,
        price: p.price,
        salePrice: p.is_on_sale ? p.sale_price : null,
        status: p.is_sold_out ? 'soldOut' : 'available',
        image: p.image_url?.replace(/^<|>$/g, '') ?? '',
      }));
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <StorePhoto uri={store?.image_url} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.storeName}>
              {store?.store_name || params.storeName || '가게'}
            </Text>
            {!ownStore && marketDistance !== null && (
              <Text style={styles.meta}>
                {formatMarketDistance(marketDistance)}
              </Text>
            )}
          </View>
          <Text style={styles.address}>
            {mock
              ? '서울특별시 용산구 효창원로42길 (테스트 주소)'
              : store?.address?.trim() || params.address?.trim() ||
                (store?.market_address?.trim()
                  ? `소속 시장 주소: ${store.market_address.trim()}`
                  : '주소 정보 없음')}
          </Text>
          {!!store?.market_name && <Text style={styles.meta}>{store.market_name}</Text>}
          {!!store?.category && <Text style={styles.meta}>{store.category}</Text>}
          {!!store?.phone && <Text style={styles.meta}>{store.phone}</Text>}
          {!!store?.description && <Text style={styles.address}>{store.description}</Text>}
        </View>
        {mock && (
          <Text style={styles.notice}>가게 주소·상품은 테스트 예시입니다.</Text>
        )}
        {products.map((product) => {
          const unavailable = product.status !== 'available';
          const discounted =
            product.salePrice !== null && product.salePrice < product.price;
          return (
            <View
              style={[styles.row, unavailable && styles.unavailable]}
              key={product.id}
            >
              <Pressable
                accessibilityRole="button"
                disabled={unavailable}
                accessibilityLabel={`${product.name}${unavailable ? ' 판매 불가' : ' 상세'}`}
                onPress={() =>
                  router.push({
                    pathname: '/products/[listingId]',
                    params: {
                      listingId: product.id,
                      preview: params.preview,
                      ...distanceParams,
                    },
                  })
                }
                style={styles.product}
              >
                <View style={styles.imageBox}>
                  <ListingImage listingId={product.id} uri={product.image}
                    style={styles.image} label={`${product.name} 사진`} preview={mock} />
                  {unavailable && (
                    <View style={styles.imageOverlay}>
                      <Text style={styles.badge}>
                        {product.status === 'soldOut' ? '품절' : '판매 종료'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.productInfo}>
                  <Text
                    style={[styles.productName, unavailable && styles.muted]}
                  >
                    {product.name}
                  </Text>
                  {discounted && (
                    <Text style={styles.oldPrice}>
                      {product.price.toLocaleString('ko-KR')}원
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.price,
                      unavailable && styles.muted,
                      discounted && styles.salePrice,
                    ]}
                  >
                    {(discounted
                      ? product.salePrice!
                      : product.price
                    ).toLocaleString('ko-KR')}
                    원
                  </Text>
                </View>
              </Pressable>
              {!ownStore && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${product.name} 관심 ${favorites.includes(product.id) ? '취소' : '추가'}`}
                  accessibilityState={{
                    selected: favorites.includes(product.id),
                  }}
                  disabled={pendingFavorites.includes(product.id)}
                  onPress={() =>
                    void toggleFavorite(product.id, { preview: mock })
                  }
                  style={styles.heart}
                >
                  <AppIcon
                    name={
                      favorites.includes(product.id)
                        ? 'heart-filled'
                        : 'heart-outline'
                    }
                    size={26}
                    color={
                      favorites.includes(product.id) ? '#E84B4B' : '#858585'
                    }
                  />
                </Pressable>
              )}
            </View>
          );
        })}
        {loading && <ActivityIndicator color="#53B175" />}
        {!!error && (
          <View>
            <Text accessibilityRole="alert" style={styles.notice}>
              {error}
            </Text>
            <Pressable onPress={() => setRetry((v) => v + 1)}>
              <Text style={styles.notice}>다시 시도</Text>
            </Pressable>
          </View>
        )}
        {!mock && !loading && !error && products.length === 0 && (
          <Text style={styles.notice}>등록된 상품이 없어요.</Text>
        )}
        {!mock && !loading && !error && page * 10 < total && (
          <Pressable onPress={() => setPage((v) => v + 1)}>
            <Text style={styles.notice}>상품 더 보기</Text>
          </Pressable>
        )}
      </ScrollView>
      <BottomNavigation
        active="홈"
        onSelect={(tab) =>
          router.replace({ pathname: '/home', params: { tab } })
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'white',
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  storePhoto: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EEF2EF',
  },
  storePhotoImage: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  info: {
    paddingVertical: 22,
    gap: 10,
    borderBottomWidth: 1,
    borderColor: '#EEEEEE',
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  storeName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#181725',
  },
  address: {
    fontSize: 16,
    color: '#777777',
    lineHeight: 24,
  },
  meta: {
    color: '#858585',
    fontSize: 16,
    lineHeight: 20,
  },
  notice: {
    color: '#176735',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
    marginVertical: 14,
    justifyContent: 'center',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderColor: '#EEEEEE',
    paddingVertical: 18,
  },
  product: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  imageBox: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#DDDDDD',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF99',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#777777',
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 4,
    padding: 5,
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productName: {
    fontSize: 20,
    fontWeight: '500',
    color: '#181725',
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: '#181725',
  },
  salePrice: {
    color: '#EF4929',
  },
  oldPrice: {
    fontSize: 14,
    color: '#999999',
    textDecorationLine: 'line-through',
  },
  heart: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: {
    backgroundColor: '#FFFFFF',
  },
  muted: {
    color: '#999999',
  },
});
