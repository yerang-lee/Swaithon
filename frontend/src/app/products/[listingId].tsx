import { logAppError } from '../../utils/appDiagnostics';
import { useCatalogRevision } from '../../services/catalogChanges';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { AppIcon } from '../../components/ui/AppIcon';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { PickupTimeSheet } from '../../components/reservations/PickupTimeSheet';
import { demoProducts } from '../../data/demoProducts';
import { useMarketDistance } from '../../hooks/useMarketDistance';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../../utils/marketDistance';
import { useFavorites } from '../../hooks/useFavorites';
import {
  getProduct,
  type ProductDetail as ProductData,
} from '../../services/api/products';
import { getStore } from '../../services/api/stores';
import { isMockMode } from '../../services/devMock';
import { reserveProduct } from '../../services/api/reservations';

export default function ProductDetail() {
  const catalogRevision = useCatalogRevision();
  const { listingId, preview, requestId, marketDistanceMeters } =
    useLocalSearchParams<{
      listingId: string;
      preview?: string;
      requestId?: string;
      marketDistanceMeters?: string;
    }>();
  const demo = demoProducts.find((value) => value.id === listingId);
  const [data, setData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [imageError, setImageError] = useState(false);
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  const [sheet, setSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    setImageError(false);
    if (demo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getProduct(listingId, preview === 'true')
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        logAppError('app/products/[listingId].tsx', e);
        if (alive) setError(e instanceof Error ? e.message : '상품 조회 실패');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [listingId, demo, retry, preview, catalogRevision]);
  const marketDistance = useMarketDistance(
    data?.market_id,
    marketDistanceMeters,
    !!demo || preview === 'true',
  );
  const distanceParams = marketDistanceParams(marketDistance);
  const [storeMarket, setStoreMarket] = useState<{
    listingId: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!data) return;
    const storeId = Number(data.store_id);
    if (!Number.isSafeInteger(storeId) || storeId <= 0) return;
    let active = true;
    void getStore(storeId)
      .then((store) => {
        if (active && String(store.market_id) === String(data.market_id))
          setStoreMarket({ listingId, name: store.market_name });
      })
      .catch((error) => {
        logAppError('product/store-market', error);
      });
    return () => {
      active = false;
    };
  }, [data, listingId]);
  if (loading || (!demo && !data))
    return (
      <SafeAreaView style={styles.safe}>
        <PageHeader title="" onBack={() => router.back()} />
        {loading ? (
          <ActivityIndicator color="#53B175" />
        ) : (
          <>
            <Text style={styles.note}>{error}</Text>
            <Pressable onPress={() => setRetry((v) => v + 1)}>
              <Text style={styles.note}>다시 시도</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    );
  const id = String(data?.listing_id ?? demo!.id);
  const favorite = favorites.includes(id);
  const name = data?.product_name ?? demo!.name;
  const store = data?.store_name ?? demo!.store;
  const market =
    demo?.market ??
    (storeMarket?.listingId === listingId ? storeMarket.name : '');
  const distance = demo
    ? demo.distance
    : marketDistance !== null
      ? formatMarketDistance(marketDistance)
      : '';
  const price = data
    ? `${(data.is_on_sale && data.sale_price !== null ? data.sale_price : data.price).toLocaleString('ko-KR')}원`
    : demo!.price;
  const imageUrl = data?.image_url.replace(/^<|>$/g, '');
  const soldOut = data?.is_sold_out ?? false;
  async function confirm(date: Date, quantity: number, note: string) {
    if (lock.current) return;
    if (!data || preview === 'true' || isMockMode()) {
      Alert.alert(
        '미리보기 상품',
        '실제 상품 ID와 서버가 연결되면 예약할 수 있어요.',
      );
      return;
    }
    lock.current = true;
    setSubmitting(true);
    try {
      const reservation = await reserveProduct(
        String(data.listing_id),
        String(data.product_id),
        quantity,
        date,
        note,
        requestId,
      );
      setSheet(false);
      Alert.alert(
        '예약 완료',
        `${reservation.message}\n예약 번호: ${reservation.reservation_id}\n총 금액: ${reservation.total_price.toLocaleString('ko-KR')}원`,
      );
    } catch (e) {
      logAppError('app/products/[listingId].tsx', e);
      Alert.alert(
        '예약 안내',
        e instanceof Error ? e.message : '예약 결과를 확인해주세요.',
      );
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {imageUrl && /^https?:\/\//.test(imageUrl) && !imageError ? (
            <Image
              source={{ uri: imageUrl }}
              accessibilityLabel={name}
              resizeMode="contain"
              style={{ width: '100%', height: 240 }}
              onError={(event) => {
                logAppError(
                  'product/image',
                  new Error(event.nativeEvent.error),
                );
                setImageError(true);
              }}
            />
          ) : (
            <>
              <Text style={styles.emoji}>{demo?.emoji ?? '🛍️'}</Text>
              <Text style={styles.imageNote}>
                상품 이미지 {demo ? '연결 예정' : '없음'}
              </Text>
            </>
          )}
        </View>
        <View style={styles.details}>
          <View style={styles.productRow}>
            <Text style={styles.name}>
              {name} {demo?.quantity ?? ''}
            </Text>
            <Text style={styles.price}>{price}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.store}
            onPress={() => {
              router.push({
                pathname: '/stores/[storeId]',
                params: {
                  storeId: String(data?.store_id ?? demo!.storeId),
                  storeName: store,
                  preview: demo ? 'true' : preview,
                  ...distanceParams,
                },
              });
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.storeName}>{store}</Text>
              {(market || distance) && (
                <Text style={styles.distance}>
                  {[market, distance].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            <AppIcon name="arrow-right" size={14} color="#7C7C7C" />
          </Pressable>
          {!!data?.description && (
            <Text style={{ fontSize: 16, lineHeight: 24, marginTop: 16 }}>
              {data.description}
            </Text>
          )}
          <Text style={styles.heading}>가격 변동 비교</Text>
          <View style={styles.chart}>
            <Text style={styles.chartText}>
              시장 평균과 점포 가격의{'\n'}변동 그래프가 표시될 영역이에요.
            </Text>
            <Text style={styles.note}>가격 이력 API 연결 예정</Text>
          </View>
          {!!demo && (
            <Text style={styles.note}>
              현재 상품 정보는 화면 확인용 예시입니다.
            </Text>
          )}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? '관심 해제' : '관심 등록'}
          accessibilityState={{ selected: favorite }}
          disabled={pendingFavorites.includes(id)}
          onPress={() =>
            void toggleFavorite(id, {
              preview: !!demo || preview === 'true',
              requestId,
            })
          }
          style={styles.favorite}
        >
          <AppIcon
            name={favorite ? 'heart-filled' : 'heart-outline'}
            color={favorite ? '#E84B4B' : '#777'}
            size={28}
          />
          <Text style={styles.favoriteLabel}>관심</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            compact
            title={soldOut ? '품절된 상품이에요' : '예약하기'}
            disabled={soldOut}
            onPress={() => setSheet(true)}
          />
        </View>
      </View>
      {sheet && (
        <PickupTimeSheet
          favorite={favorite}
          favoritePending={pendingFavorites.includes(id)}
          onToggleFavorite={() =>
            void toggleFavorite(id, {
              preview: !!demo || preview === 'true',
              requestId,
            })
          }
          submitting={submitting}
          onClose={() => {
            if (!submitting) setSheet(false);
          }}
          onConfirm={confirm}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'white',
  },
  content: {
    paddingBottom: 24,
  },
  hero: {
    minHeight: 310,
    backgroundColor: '#F3F6F3',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 6,
  },
  back: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 140,
    paddingBottom: 16,
  },
  imageNote: {
    color: '#999',
    fontSize: 12,
    marginBottom: 14,
  },
  details: {
    paddingHorizontal: 24,
  },
  productRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
  },
  name: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#181725',
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: '#181725',
  },
  store: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEE',
    paddingVertical: 18,
  },
  storeName: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
  distance: {
    fontSize: 16,
    lineHeight: 24,
    color: '#858585',
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 16,
  },
  chart: {
    minHeight: 230,
    borderRadius: 12,
    backgroundColor: '#E2E2E2',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  chartText: {
    color: '#777',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },
  note: {
    color: '#999',
    fontSize: 12,
    paddingVertical: 14,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#F0F0F0',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'white',
  },
  favorite: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  favoriteLabel: {
    fontSize: 12,
    color: '#777',
  },
});
