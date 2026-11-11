import { PriceHistoryChart } from '../../components/products/PriceHistoryChart';
import { ProductImageViewer } from '../../components/products/ProductImageViewer';
import { useRecommendationView } from '../../hooks/useRecommendationTracking';
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
import {
  reserveProduct,
  reservationDetailId,
} from '../../services/api/reservations';

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
  const [imageOpen, setImageOpen] = useState(false);
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  const [sheet, setSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    setImageError(false);
    setImageOpen(false);
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
  useRecommendationView({
    requestId,
    listingId,
    ready:
      !loading &&
      !!data &&
      String(data.listing_id) === listingId &&
      !demo &&
      preview !== 'true',
  });
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
  const market = data?.market_name ?? demo?.market ?? '';
  const distance = demo
    ? demo.distance
    : marketDistance !== null
      ? formatMarketDistance(marketDistance)
      : '';
  const price = data
    ? `${(data.sale_price ?? data.price).toLocaleString('ko-KR')}원`
    : demo!.price;
  const imageUrl = data?.image_url?.replace(/^<|>$/g, '');
  const soldOut = data?.is_sold_out ?? false;
  const discounted =
    !!data && data.sale_price !== null && data.sale_price < data.price;
  async function confirm(date: Date, quantity: number, note: string) {
    if (lock.current) return;
    if (!data || preview === 'true') {
      Alert.alert(
        '미리보기 상품',
        '실제 상품 ID와 서버가 연결되면 예약할 수 있어요.',
      );
      return;
    }
    lock.current = true;
    setSubmitting(true);
    try {
      const listingId = reservationDetailId(data.listing_id);
      const productId = reservationDetailId(data.product_id);
      if (listingId === null || productId === null)
        throw new Error('예약에 필요한 정수 상품 ID를 확인해주세요.');
      const reservation = await reserveProduct(
        listingId,
        productId,
        quantity,
        date,
        note,
        requestId,
      );
      setSheet(false);
      const id = reservationDetailId(reservation.reservation_id);
      if (id !== null)
        router.push({
          pathname: '/reservations/[reservationId]',
          params: { reservationId: String(id) },
        });
      else
        Alert.alert(
          '예약 완료',
          `${reservation.message}\nQR 조회에 필요한 정수 예약 ID를 서버에서 확인해야 해요. 예약 내역을 확인해주세요.`,
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
            <Pressable style={styles.heroPhoto} accessibilityRole="button"
              accessibilityLabel={`${name} 사진 크게 보기`} onPress={() => setImageOpen(true)}>
            <Image
              source={{ uri: imageUrl }}
              accessibilityLabel={name}
              resizeMode="cover"
              style={styles.heroImage}
              onError={(event) => {
                logAppError(
                  'product/image',
                  new Error(event.nativeEvent.error),
                );
                setImageError(true);
              }}
            />
            </Pressable>
          ) : (
            <>
              <Text style={styles.emoji}>{demo?.emoji ?? '🛍️'}</Text>
              <Text style={styles.imageNote}>
                상품 이미지 {demo ? '연결 예정' : '없음'}
              </Text>
            </>
          )}
          {soldOut && (
            <View style={styles.soldOutOverlay} pointerEvents="none">
              <Text style={styles.soldOutBadge}>품절</Text>
            </View>
          )}
        </View>
        <View style={styles.details}>
          <View style={styles.productRow}>
            <Text style={styles.name}>
              {name} {demo?.quantity ?? ''}
            </Text>
            <Text style={[styles.price, discounted && styles.salePrice]}>
              {price}
            </Text>
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
          <Text style={styles.heading}>가격 변동</Text>
          <PriceHistoryChart
            saleActive={discounted}
            key={`${id}-${catalogRevision}`}
            listingId={id}
            preview={!!demo || preview === 'true'}
          />
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
      {!!imageUrl && imageOpen && (
        <ProductImageViewer visible uri={imageUrl} label={name}
          onClose={() => setImageOpen(false)} />
      )}
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
    overflow: 'hidden',
  },
  heroPhoto: { width: '100%', height: 310 },
  heroImage: { width: '100%', height: '100%' },
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
  salePrice: {
    color: '#EF4929',
  },
  soldOutOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutBadge: {
    color: '#FFFFFF',
    backgroundColor: '#777777',
    fontSize: 16,
    fontWeight: '700',
    borderRadius: 4,
    padding: 5,
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
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  distance: {
    fontSize: 18,
    lineHeight: 24,
    color: '#858585',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 16,
  },
  note: {
    color: '#999',
    fontSize: 16,
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
    fontSize: 14,
    color: '#777',
  },
});
