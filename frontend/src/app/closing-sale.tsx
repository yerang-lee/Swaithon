import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PageHeader } from '../components/ui/PageHeader';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { AppIcon } from '../components/ui/AppIcon';
import { LocationSettings } from '../components/maps/LocationSettings';
import {
  getCurrentLocation,
  readLocation,
  saveLocation,
  type ExplorationLocation,
} from '../services/explorationLocation';
import { useLocationRevision } from '../services/locationChanges';
import { useCatalogRevision } from '../services/catalogChanges';
import {
  getClosingSaleProducts,
  isClosingSaleTime,
  type ClosingSaleProduct,
} from '../services/api/closingSale';
import { useFavorites } from '../hooks/useFavorites';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../utils/marketDistance';
import { logAppError } from '../utils/appDiagnostics';

function SaleImage({ product }: { product: ClosingSaleProduct }) {
  const [failed, setFailed] = useState(false);
  const uri = product.image_url?.trim().replace(/^<|>$/g, '');
  useEffect(() => setFailed(false), [uri]);
  return uri && !failed && /^https?:\/\//.test(uri) ? (
    <Image
      source={{ uri }}
      style={styles.image}
      resizeMode="cover"
      accessibilityLabel={`${product.product_name} 이미지`}
      onError={() => {
        logAppError(
          'closing-sale/image',
          new Error('상품 이미지를 불러오지 못했어요.'),
        );
        setFailed(true);
      }}
    />
  ) : (
    <View style={styles.image} accessibilityLabel="상품 이미지 없음" />
  );
}

export default function ClosingSaleScreen() {
  const { width } = useWindowDimensions();
  const locationRevision = useLocationRevision();
  const catalogRevision = useCatalogRevision();
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ClosingSaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const saving = useRef(false);
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  const afterFour = isClosingSaleTime(now);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setNow(new Date());
      const timer = setInterval(() => setNow(new Date()), 15000);
      void (async () => {
        try {
          const next = (await readLocation()) ?? (await getCurrentLocation());
          if (active) {
            setLocation(next);
            setLocationError('');
          }
        } catch (caught) {
          logAppError('closing-sale/location', caught);
          if (active) {
            setLocationError(
              caught instanceof Error
                ? caught.message
                : '위치를 확인할 수 없어요.',
            );
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [locationRevision, retry]),
  );
  useEffect(() => {
    let active = true;
    setProducts([]);
    setError('');
    if (!location || !afterFour) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void getClosingSaleProducts(location, () => active)
      .then((result) => {
        if (!active) return;
        setProducts(result.products);
        if (result.failedMarketCount)
          setError(
            `${result.failedMarketCount}개 시장의 할인 상품을 모두 불러오지 못했어요.`,
          );
      })
      .catch((caught) => {
        logAppError('closing-sale/products', caught);
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : '할인 상품을 불러오지 못했어요.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location, afterFour, retry, catalogRevision]);
  async function applyLocation(next: ExplorationLocation) {
    if (saving.current) return;
    saving.current = true;
    try {
      await saveLocation(next);
      setLocation(next);
      setLocationError('');
      setOpen(false);
    } catch (caught) {
      logAppError('closing-sale/save-location', caught);
      Alert.alert('저장 실패', '위치를 저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      saving.current = false;
    }
  }
  const visible = products.filter((p) =>
    p.product_name
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const cardWidth = (Math.min(width, 600) - 60) / 2;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="마감 세일" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBox}>
          <AppIcon name="search" size={19} color="#858585" />
          <TextInput
            accessibilityLabel="마감 세일 상품 검색"
            placeholder="어떤 상품을 찾으세요?"
            placeholderTextColor="#858585"
            value={query}
            onChangeText={setQuery}
            style={styles.search}
            returnKeyType="search"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="위치 및 검색 반경 설정"
          onPress={() => setOpen(true)}
          style={styles.location}
        >
          <AppIcon name="location-pin" size={24} color="#4C4F4D" />
          <Text style={styles.locationName}>
            {location?.name ?? '위치 선택'}
          </Text>
          {!!location && (
            <Text style={styles.radius}>+{location.radius}km</Text>
          )}
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <AppIcon name="arrow-right" size={14} />
          </View>
        </Pressable>
        {!!locationError && (
          <Text accessibilityRole="alert" style={styles.message}>
            {locationError}
          </Text>
        )}
        {loading && (
          <ActivityIndicator
            color="#53B175"
            accessibilityLabel="마감 세일 상품 조회 중"
          />
        )}
        {!!error && (
          <View>
            <Text accessibilityRole="alert" style={styles.message}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetry((v) => v + 1)}
              style={styles.retry}
            >
              <Text>다시 시도</Text>
            </Pressable>
          </View>
        )}
        {!loading && !error && !locationError && !visible.length && (
          <Text style={styles.message}>
            {!afterFour
              ? '마감 세일은 오후 4시부터 확인할 수 있어요.'
              : query.trim()
                ? '검색된 마감 세일 상품이 없어요.'
                : '주변에 마감 세일 상품이 없어요.'}
          </Text>
        )}
        <View style={styles.grid}>
          {visible.map((product) => {
            const id = String(product.listing_id);
            const favorite = favorites.includes(id);
            return (
              <View key={id} style={[styles.card, { width: cardWidth }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${product.product_name} 상세`}
                  onPress={() =>
                    router.push({
                      pathname: '/products/[listingId]',
                      params: {
                        listingId: id,
                        ...marketDistanceParams(product.market_distance),
                      },
                    })
                  }
                >
                  <SaleImage product={product} />
                  <View style={styles.cardBody}>
                    <Text style={styles.name} numberOfLines={2}>
                      {product.product_name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {product.store_name} · {product.market_name} ·{' '}
                      {formatMarketDistance(product.market_distance)}
                    </Text>
                    <View style={styles.prices}>
                      <Text style={styles.originalPrice}>
                        {product.price.toLocaleString('ko-KR')}원
                      </Text>
                      <Text style={styles.salePrice}>
                        {product.sale_price!.toLocaleString('ko-KR')}원
                      </Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${product.product_name} 관심 ${favorite ? '취소' : '추가'}`}
                  accessibilityState={{ selected: favorite }}
                  disabled={pendingFavorites.includes(id)}
                  onPress={() => void toggleFavorite(id)}
                  style={styles.heart}
                >
                  <AppIcon
                    name={favorite ? 'heart-filled' : 'heart-outline'}
                    size={26}
                    color={favorite ? '#E84B4B' : '#858585'}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <BottomNavigation
        active="홈"
        onSelect={(tab) =>
          router.replace({ pathname: '/home', params: { tab } })
        }
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (!saving.current) setOpen(false);
        }}
      >
        <LocationSettings
          initial={location}
          onClose={() => {
            if (!saving.current) setOpen(false);
          }}
          onApply={(next) => void applyLocation(next)}
        />
      </Modal>
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
    paddingBottom: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    flexGrow: 1,
  },
  searchBox: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#F2F3F2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  search: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: '#181725',
    paddingVertical: 12,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 58,
  },
  locationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#181725',
    flexShrink: 1,
  },
  radius: {
    fontSize: 14,
    color: '#858585',
    marginRight: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    padding: 8,
    overflow: 'hidden',
  },
  image: {
    height: 120,
    width: '100%',
    backgroundColor: '#DDDDDD',
    borderRadius: 8,
  },
  cardBody: {
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 5,
  },
  name: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '700',
    color: '#181725',
  },
  meta: {
    fontSize: 16,
    lineHeight: 21,
    color: '#858585',
  },
  prices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 8,
    rowGap: 3,
    marginTop: 6,
  },
  originalPrice: {
    fontSize: 13,
    color: '#777777',
    textDecorationLine: 'line-through',
  },
  salePrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#EF4929',
  },
  heart: {
    position: 'absolute',
    top: 80,
    right: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    color: '#858585',
    paddingVertical: 20,
  },
  retry: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
