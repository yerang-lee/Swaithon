import { useLocationRevision } from '../services/locationChanges';
import { logAppError } from '../utils/appDiagnostics';
import {
  getRecommendations,
  type Recommendations,
} from '../services/api/recommendations';
import { useRecommendationImpressions } from '../hooks/useRecommendationTracking';
import { useFavorites } from '../hooks/useFavorites';
import { FavoritesScreen } from '../components/favorites/FavoritesScreen';
import { MerchantReservationsScreen } from '../components/reservations/MerchantReservationsScreen';
import { ReservationsScreen } from '../components/reservations/ReservationsScreen';
import { MyPage } from '../components/auth/MyPage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, type ComponentRef } from 'react';
import { LocationButton } from '../components/ui/LocationButton';
import { PageHeader } from '../components/ui/PageHeader';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../components/ui/AppIcon';
import { LocationSettings } from '../components/maps/LocationSettings';
import {
  readLocation,
  saveLocation,
  getCurrentLocation,
  type ExplorationLocation,
} from '../services/explorationLocation';
import { theme } from '../constants/theme';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../utils/marketDistance';
import { getAuthSession } from '../services/api/auth';
import { getProduct, type ProductDetail } from '../services/api/products';
import { getNearbyMarkets, type NearbyMarket } from '../services/api/markets';
import {
  getStoresForNearbyMarkets,
  type NearbyStore,
} from '../services/api/nearbyStores';

const green = theme.colors.primary;

export default function HomeScreen() {
  const sharedLocationRevision = useLocationRevision();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tab && ['홈', '관심상품', '예약', '마이'].includes(tab)) setActive(tab);
  }, [tab]);
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(140, (Math.min(width, 600) - 60) / 2.1);
  const [active, setActive] = useState('홈');
  const [isMerchant, setIsMerchant] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const session = getAuthSession();
      setIsMerchant(
        !!session &&
          session.expiresAt > Date.now() &&
          session.role === 'MERCHANT',
      );
    }, []),
  );
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
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
  const [recommendations, setRecommendations] =
    useState<Recommendations | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState('');
  const [recommendationsRetry, setRecommendationsRetry] = useState(0);
  const recommendationToken = getAuthSession()?.access_token;
  const recommendationsOwner = useRef<string | undefined>(undefined);
  const [recommendationDetails, setRecommendationDetails] = useState<{
    token?: string;
    requestId: string;
    items: Record<string, ProductDetail>;
  }>({ requestId: '', items: {} });
  const viewportRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const impressionTracking = useRecommendationImpressions({
    requestId: recommendations?.request_id,
    items: recommendations?.items ?? [],
    ownerToken: recommendationsOwner.current,
    enabled: active === '홈' && !locationOpen,
    viewportRef,
  });
  useFocusEffect(
    useCallback(() => {
      if (active !== '홈') return;
      let alive = true;
      const current = () =>
        alive && getAuthSession()?.access_token === recommendationToken;
      setRecommendations(null);
      setRecommendationsLoading(true);
      setRecommendationsError('');
      if (!recommendationToken) {
        setRecommendationsLoading(false);
        setRecommendationsError('로그인 후 추천 상품을 확인해주세요.');
        return () => {
          alive = false;
        };
      }
      if (!location) {
        setRecommendationsLoading(false);
        setRecommendationsError(
          locationError || '위치를 설정하면 추천 상품을 확인할 수 있어요.',
        );
        return () => {
          alive = false;
        };
      }
      void getRecommendations({
        latitude: location.latitude,
        longitude: location.longitude,
      })
        .then((result) => {
          if (current()) {
            recommendationsOwner.current = recommendationToken;
            setRecommendations(result);
            setRecommendationDetails({
              token: recommendationToken,
              requestId: result.request_id,
              items: {},
            });
            let cursor = 0;
            async function enrich() {
              while (current() && cursor < result.items.length) {
                const item = result.items[cursor++];
                try {
                  const detail = await getProduct(item.listing_id);
                  if (current())
                    setRecommendationDetails((previous) =>
                      previous.requestId === result.request_id
                        ? {
                            ...previous,
                            items: {
                              ...previous.items,
                              [item.listing_id]: detail,
                            },
                          }
                        : previous,
                    );
                } catch (error) {
                  logAppError('home/recommendation-details', error);
                }
              }
            }
            void Promise.all(
              Array.from({ length: Math.min(4, result.items.length) }, enrich),
            );
          }
        })
        .catch((error) => {
          logAppError('home/recommendations', error);
          if (current())
            setRecommendationsError(
              error instanceof Error
                ? error.message
                : '추천 상품을 불러오지 못했어요.',
            );
        })
        .finally(() => {
          if (current()) setRecommendationsLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [
      active,
      recommendationToken,
      recommendationsRetry,
      location?.latitude,
      location?.longitude,
      locationError,
    ]),
  );
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const revision = locationRevision.current;
      void (async () => {
        try {
          const next = (await readLocation()) ?? (await getCurrentLocation());
          if (alive && revision === locationRevision.current) {
            setLocation(next);
            setLocationError('');
          }
        } catch (error) {
          logAppError('home/location', error);
          if (alive && revision === locationRevision.current)
            setLocationError(
              error instanceof Error
                ? error.message
                : '위치를 가져오지 못했어요.',
            );
        }
      })();
      return () => {
        alive = false;
      };
    }, [sharedLocationRevision]),
  );
  useEffect(() => {
    let alive = true;
    setNearbyMarkets([]);
    setNearbyStores([]);
    setMarketsError('');
    setStoresError('');
    if (!location) {
      setMarketsLoading(false);
      setStoresLoading(false);
      return;
    }
    setMarketsLoading(true);
    setStoresLoading(true);
    let marketsReady = false;
    void (async () => {
      try {
        const markets = await getNearbyMarkets(location);
        if (!alive) return;
        marketsReady = true;
        setNearbyMarkets(markets);
        setMarketsLoading(false);
        const result = await getStoresForNearbyMarkets(markets, () => alive);
        if (!alive) return;
        setNearbyStores(result.stores);
        if (result.failedMarketCount)
          setStoresError(
            `${result.failedMarketCount}개 시장의 가게 정보를 불러오지 못했어요.`,
          );
      } catch (error) {
        logAppError('home/nearby', error);
        if (!alive) return;
        const message =
          error instanceof Error
            ? error.message
            : '주변 정보를 불러오지 못했어요.';
        if (!marketsReady) setMarketsError(message);
        setStoresError(message);
      } finally {
        if (alive) {
          setMarketsLoading(false);
          setStoresLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [location, nearbyRetry]);

  if (active === '예약')
    return getAuthSession()?.role === 'MERCHANT' ? (
      <MerchantReservationsScreen onTab={setActive} />
    ) : (
      <ReservationsScreen onTab={setActive} />
    );
  if (active === '관심상품') return <FavoritesScreen onTab={setActive} />;

  if (active === '마이')
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <PageHeader title="마이" />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <MyPage />
        </ScrollView>
        <BottomNavigation active={active} onSelect={setActive} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="장보소" brandTitle titleStyle={{ fontSize: 32 }} />
      <ScrollView
        ref={viewportRef}
        onLayout={impressionTracking.checkVisibility}
        onScroll={impressionTracking.checkVisibility}
        scrollEventThrottle={100}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LocationButton
          location={location}
          error={locationError}
          onPress={() => {
            setLocationReady(false);
            setLocationOpen(true);
          }}
        />
        <View style={styles.shortcuts}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/markets',
                params: location
                  ? { selectedLocation: JSON.stringify(location) }
                  : {},
              })
            }
            style={styles.shortcut}
          >
            <AppIcon name="storefront" size={34} color={green} />
            <Text style={styles.shortcutLabel}>시장 찾기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/closing-sale')}
            style={styles.shortcut}
          >
            <AppIcon name="clock" size={34} color={green} />
            <Text style={styles.shortcutLabel}>마감 세일</Text>
          </Pressable>
        </View>
        {active === '홈' && isMerchant && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="상품 등록/수정하기"
            onPress={() => router.push('/voice')}
            style={({ pressed }) => [
              styles.merchantButton,
              pressed && styles.merchantButtonPressed,
            ]}
          >
            <View style={styles.merchantPlusCircle}>
              <View style={styles.merchantPlusHorizontal} />
              <View style={styles.merchantPlusVertical} />
            </View>
            <Text style={styles.merchantButtonLabel}>상품 등록/수정하기</Text>
          </Pressable>
        )}
        {active === '홈' ? (
          <>
            <Text style={styles.sectionTitle}>나를 위한 추천 상품</Text>
            <ScrollView
              ref={impressionTracking.carouselRef}
              onLayout={impressionTracking.checkVisibility}
              onContentSizeChange={impressionTracking.checkVisibility}
              onScroll={impressionTracking.checkVisibility}
              scrollEventThrottle={100}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.carousel}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
            >
              {recommendations?.items.map((item) => {
                const detail =
                  recommendationDetails.token === recommendationToken &&
                  recommendationDetails.requestId === recommendations.request_id
                    ? recommendationDetails.items[item.listing_id]
                    : undefined;
                const discounted =
                  !!detail &&
                  detail.sale_price !== null &&
                  detail.sale_price < detail.price &&
                  item.price === detail.sale_price;
                return (
                  <View
                    key={item.listing_id}
                    ref={impressionTracking.cardRef(item.listing_id)}
                    collapsable={false}
                    onLayout={impressionTracking.checkVisibility}
                    style={[styles.card, { width: cardWidth }]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name} 상세`}
                      onPress={() =>
                        router.push({
                          pathname: '/products/[listingId]',
                          params: {
                            listingId: item.listing_id,
                            requestId: recommendations.request_id,
                            ...marketDistanceParams(item.distance_km * 1000),
                          },
                        })
                      }
                    >
                      <View style={styles.cardImage}>
                        <PlaceImage uri={detail?.image_url ?? null} />
                        {detail?.is_sold_out && (
                          <View style={styles.soldOutOverlay}>
                            <Text style={styles.soldOutBadge}>품절</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle}>{item.name}</Text>
                        <Text style={styles.meta} numberOfLines={2}>
                          {[
                            item.store_name,
                            nearbyMarkets.find(
                              (market) =>
                                String(market.market_id) === item.market_id,
                            )?.market_name,
                            formatMarketDistance(item.distance_km * 1000),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                    <View style={styles.priceRow}>
                      <View style={styles.prices}>
                        {discounted && (
                          <Text style={styles.oldPrice}>
                            {detail!.price.toLocaleString('ko-KR')}원
                          </Text>
                        )}
                        <Text
                          style={[styles.price, discounted && styles.salePrice]}
                        >
                          {item.price.toLocaleString('ko-KR')}원
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name} 찜 ${favorites.includes(item.listing_id) ? '취소' : '추가'}`}
                      accessibilityState={{
                        selected: favorites.includes(item.listing_id),
                      }}
                      disabled={pendingFavorites.includes(item.listing_id)}
                      style={[styles.cardHeart, { top: cardWidth - 54 }]}
                      onPress={() =>
                        void toggleFavorite(item.listing_id, {
                          requestId: recommendations.request_id,
                        })
                      }
                    >
                      <AppIcon
                        name={
                          favorites.includes(item.listing_id)
                            ? 'heart-filled'
                            : 'heart-outline'
                        }
                        size={27}
                        color={
                          favorites.includes(item.listing_id)
                            ? '#E84B4B'
                            : '#777777'
                        }
                      />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            {recommendationsLoading && (
              <ActivityIndicator
                color={green}
                accessibilityLabel="추천 상품 조회 중"
              />
            )}
            {!!recommendationsError && (
              <View>
                <Text accessibilityRole="alert" style={styles.empty}>
                  {recommendationsError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={{
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setRecommendationsRetry((value) => value + 1)}
                >
                  <Text style={{ color: green }}>다시 시도</Text>
                </Pressable>
              </View>
            )}
            {!recommendationsLoading &&
              !recommendationsError &&
              recommendations?.items.length === 0 && (
                <Text style={styles.empty}>추천 상품이 없어요.</Text>
              )}
            {active === '홈' && (
              <>
                <PlaceSection
                  title="내 주변 시장"
                  cardWidth={cardWidth}
                  loading={marketsLoading}
                  error={marketsError}
                  emptyMessage={
                    !location
                      ? locationError || '위치를 확인하고 있어요.'
                      : `반경 ${location.radius}km 안에 시장이 없어요.`
                  }
                  onRetry={() => setNearbyRetry((value) => value + 1)}
                  items={nearbyMarkets.map((market, index) => ({
                    key:
                      market.market_id === null
                        ? `unregistered:${index}`
                        : `market:${market.market_id}`,
                    name: market.market_name,
                    imageUrl: market.image_url,
                    distanceLabel: formatMarketDistance(market.distance),
                    description: market.market_id === null ? '미등록 시장' : '',
                    onPress: () => {
                      if (market.market_id === null)
                        Alert.alert(
                          market.market_name,
                          '아직 서비스에 등록되지 않은 시장이에요.',
                        );
                      else
                        router.push({
                          pathname: '/markets/[marketId]',
                          params: {
                            marketId: String(market.market_id),
                            marketName: market.market_name,
                            ...marketDistanceParams(market.distance),
                          },
                        });
                    },
                  }))}
                />
                <PlaceSection
                  title="내 주변 가게"
                  cardWidth={cardWidth}
                  loading={storesLoading}
                  error={storesError}
                  emptyMessage={
                    !location
                      ? locationError || '위치를 확인하고 있어요.'
                      : '주변 시장에 등록된 가게가 없어요.'
                  }
                  onRetry={() => setNearbyRetry((value) => value + 1)}
                  items={nearbyStores.map((store) => ({
                    key: `store:${store.store_id}`,
                    name: store.store_name,
                    imageUrl: store.image_url,
                    distanceLabel: formatMarketDistance(store.market_distance),
                    description: store.market_name,
                    onPress: () =>
                      router.push({
                        pathname: '/stores/[storeId]',
                        params: {
                          storeId: String(store.store_id),
                          storeName: store.store_name,
                          ...marketDistanceParams(store.market_distance),
                          ...(store.address ? { address: store.address } : {}),
                        },
                      }),
                  }))}
                />
              </>
            )}
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.sectionTitle}>예약 내역</Text>
            <Text style={styles.meta}>화면을 준비하고 있어요.</Text>
          </View>
        )}
      </ScrollView>
      <BottomNavigation active={active} onSelect={setActive} />
      <Modal
        visible={locationOpen}
        presentationStyle="fullScreen"
        animationType="slide"
        onShow={() => setLocationReady(true)}
        onRequestClose={() => setLocationOpen(false)}
      >
        {locationReady && (
          <LocationSettings
            initial={location}
            onClose={() => setLocationOpen(false)}
            onApply={async (next) => {
              try {
                await saveLocation(next);
                locationRevision.current++;
                setLocation(next);
                setLocationError('');
                setLocationOpen(false);
              } catch (__caughtError) {
                logAppError('app/home.tsx', __caughtError);
                Alert.alert(
                  '저장 실패',
                  '위치를 저장하지 못했어요. 다시 시도해주세요.',
                );
              }
            }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

type PlaceCard = {
  key: string;
  name: string;
  description: string;
  distanceLabel: string;
  imageUrl: string | null;
  onPress: () => void;
};
function PlaceImage({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = uri?.trim().replace(/^<|>$/g, '');
  useEffect(() => setFailed(false), [url]);
  return url && /^https?:\/\//.test(url) && !failed ? (
    <Image
      source={{ uri: url }}
      resizeMode="cover"
      style={styles.cardImage}
      onError={() => {
        logAppError(
          'home/place-image',
          new Error('주변 장소 이미지를 불러오지 못했어요.'),
        );
        setFailed(true);
      }}
    />
  ) : (
    <View style={styles.cardImage} />
  );
}
function PlaceSection({
  title,
  items,
  cardWidth,
  loading,
  error,
  emptyMessage,
  onRetry,
}: {
  title: string;
  items: PlaceCard[];
  cardWidth: number;
  loading: boolean;
  error: string;
  emptyMessage: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.placeSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {loading && (
        <ActivityIndicator
          color={green}
          accessibilityLabel={`${title} 조회 중`}
        />
      )}
      {!!error && (
        <View>
          <Text accessibilityRole="alert" style={styles.empty}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={{ paddingVertical: 10 }}
          >
            <Text style={{ color: theme.colors.brandText }}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      {!loading && !error && !items.length && (
        <Text style={styles.empty}>{emptyMessage}</Text>
      )}
      {!!items.length && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          contentContainerStyle={styles.grid}
        >
          {items.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} ${item.distanceLabel} ${item.description}`}
              onPress={item.onPress}
              style={[styles.card, styles.placeCard, { width: cardWidth }]}
            >
              <PlaceImage uri={item.imageUrl} />
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>{item.distanceLabel}</Text>
                {!!item.description && (
                  <Text style={styles.meta} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 29,
    fontWeight: '800',
    color: theme.colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    minWidth: 38,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  location: {
    borderWidth: 1,
    borderColor: '#D5D5D5',
    borderRadius: theme.radii.input,
    minHeight: 74,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationText: {
    flex: 1,
  },
  locationCaption: {
    fontSize: 16,
    color: ' #444444',
    marginBottom: 3,
  },
  locationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  neighborhood: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333333',
  },
  radius: {
    fontSize: 16,
    color: theme.colors.muted,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    marginBottom: 18,
  },
  shortcut: {
    flex: 1,
    borderRadius: theme.radii.card,
    backgroundColor: '#F5FAF7',
    borderWidth: 1,
    borderColor: '#E9EFEB',
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  shortcutLabel: {
    fontSize: 19,
    fontWeight: '600',
    color: '#424743',
  },
  sectionTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 16,
  },
  carousel: {
    marginRight: -24,
  },
  grid: {
    gap: 12,
    paddingRight: 24,
  },
  merchantButton: {
    backgroundColor: green,
    borderRadius: 11,
    minHeight: 176,
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  merchantButtonPressed: {
    opacity: 0.85,
  },
  merchantPlusCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantPlusHorizontal: {
    position: 'absolute',
    width: 22,
    height: 5,
    borderRadius: 3,
    backgroundColor: green,
  },
  merchantPlusVertical: {
    position: 'absolute',
    width: 5,
    height: 22,
    borderRadius: 3,
    backgroundColor: green,
  },
  merchantButtonLabel: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    flexShrink: 0,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#E3E3E3',
  },
  cardInfo: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '600',
    color: theme.colors.text,
  },
  meta: {
    fontSize: 16,
    color: theme.colors.muted,
    lineHeight: 21,
  },
  cardHeart: {
    position: 'absolute',
    right: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  prices: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 8,
  },
  oldPrice: {
    fontSize: 15,
    color: '#858585',
    textDecorationLine: 'line-through',
  },
  salePrice: {
    color: '#EF4929',
  },
  price: {
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '700',
    color: theme.colors.text,
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
    backgroundColor: '#777777',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    padding: 5,
    borderRadius: 4,
  },
  placeSection: {
    marginTop: 34,
  },
  placeCard: {
    minHeight: 184,
  },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    paddingTop: 12,
    paddingBottom: 8,
    boxShadow: '0 -3px 14px rgba(0,0,0,0.04)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placeholder: {
    paddingVertical: 40,
  },
  empty: {
    fontSize: 16,
    paddingVertical: 10,
    color: theme.colors.muted,
  },
  demo: {
    fontSize: 13,
    color: theme.colors.muted,
    marginTop: 26,
    textAlign: 'center',
  },
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    borderTopLeftRadius: theme.radii.sheet,
    borderTopRightRadius: theme.radii.sheet,
    padding: 24,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
    alignSelf: 'center',
    marginBottom: 22,
  },
  radiusOptions: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 22,
  },
  radiusOption: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: theme.radii.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedRadius: {
    borderColor: green,
    backgroundColor: '#F0F9F3',
  },
  sheetNote: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 19,
    marginBottom: 20,
  },
});
