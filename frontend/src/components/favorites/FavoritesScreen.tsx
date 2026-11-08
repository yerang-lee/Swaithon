import { useLocationRevision } from '../../services/locationChanges';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PageHeader } from '../ui/PageHeader';
import { BottomNavigation } from '../ui/BottomNavigation';
import { AppIcon } from '../ui/AppIcon';
import {
  getAllFavorites,
  type FavoriteListing,
} from '../../services/api/favorites';
import { getAuthSession } from '../../services/api/auth';
import { getNearbyMarkets } from '../../services/api/markets';
import {
  readLocation,
  getCurrentLocation,
} from '../../services/explorationLocation';
import {
  beginFavoritesLoad,
  synchronizeFavorites,
  useFavorites,
  waitForFavoriteRequests,
} from '../../hooks/useFavorites';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../../utils/marketDistance';
import { logAppError } from '../../utils/appDiagnostics';
import { theme } from '../../constants/theme';

function FavoriteImage({ item }: { item: FavoriteListing }) {
  const [failed, setFailed] = useState(false);
  const uri = item.image_url?.trim().replace(/^<|>$/g, '');
  useEffect(() => setFailed(false), [uri]);
  return uri && /^https?:\/\//.test(uri) && !failed ? (
    <Image
      source={{ uri }}
      resizeMode="cover"
      accessibilityLabel={`${item.product_name} 이미지`}
      style={styles.image}
      onError={() => {
        logAppError(
          'favorites/image',
          new Error('관심상품 이미지를 불러오지 못했어요.'),
        );
        setFailed(true);
      }}
    />
  ) : (
    <View accessibilityLabel="상품 이미지 없음" style={styles.image} />
  );
}
export function FavoritesScreen({ onTab }: { onTab: (tab: string) => void }) {
  const sharedLocationRevision = useLocationRevision();
  const [items, setItems] = useState<FavoriteListing[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [distances, setDistances] = useState<Record<string, number>>({});
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  const token = getAuthSession()?.access_token;
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const controller = new AbortController();
      const isActive = () => alive && getAuthSession()?.access_token === token;
      setItems([]);
      setLoading(true);
      setError('');
      setDistances({});
      if (!token) {
        setLoading(false);
        setError('로그인 후 관심상품을 확인해주세요.');
        return () => {
          alive = false;
          controller.abort();
        };
      }
      void (async () => {
        try {
          // A cancellation started before leaving the screen must finish before reloading.
          await waitForFavoriteRequests(controller.signal);
          if (!isActive()) return;
          const context = beginFavoritesLoad();
          const result = await getAllFavorites(isActive);
          if (!isActive()) return;
          if (!synchronizeFavorites(result, context))
            throw new Error('관심상품 정보가 변경됐어요. 다시 불러와주세요.');
          // Keep this visit's rows even when the shared heart state changes after cancellation.
          setItems(result);
        } catch (caught) {
          logAppError('favorites/list', caught);
          if (isActive())
            setError(
              caught instanceof Error
                ? caught.message
                : '관심상품을 불러오지 못했어요.',
            );
        } finally {
          if (isActive()) setLoading(false);
        }
      })();
      void (async () => {
        try {
          const location =
            (await readLocation()) ?? (await getCurrentLocation());
          if (!isActive()) return;
          const markets = await getNearbyMarkets(location);
          if (!isActive()) return;
          const next: Record<string, number> = {};
          for (const market of markets)
            if (market.market_id !== null)
              next[String(market.market_id)] = market.distance;
          setDistances(next);
        } catch (caught) {
          logAppError('favorites/distance', caught);
        }
      })();
      return () => {
        alive = false;
        controller.abort();
      };
    }, [token, retry, sharedLocationRevision]),
  );
  const keyword = query.trim().toLocaleLowerCase();
  const visible = items.filter((item) =>
    item.product_name.toLocaleLowerCase().includes(keyword),
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="관심상품" />
      <View style={styles.content}>
        <View style={styles.searchBox}>
          <AppIcon name="search" size={19} color="#858585" />
          <TextInput
            accessibilityLabel="관심상품 검색"
            placeholder="어떤 상품을 찾으세요?"
            placeholderTextColor="#858585"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            style={styles.search}
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              hitSlop={8}
              onPress={() => setQuery('')}
            >
              <Text style={styles.clear}>지우기</Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {!loading &&
            !error &&
            visible.map((item) => {
              const selected = favorites.includes(item.listing_id);
              const pending = pendingFavorites.includes(item.listing_id);
              const distance = distances[item.market_id];
              const info = [
                item.store_name,
                item.market_name,
                ...(distance === undefined
                  ? []
                  : [formatMarketDistance(distance)]),
              ]
                .filter((value) => value.trim())
                .join(' · ');
              const discounted =
                item.is_on_sale &&
                item.sale_price !== null &&
                item.sale_price < item.price;
              return (
                <View key={item.favorite_id} style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.product_name} 상세`}
                    onPress={() =>
                      router.push({
                        pathname: '/products/[listingId]',
                        params: {
                          listingId: item.listing_id,
                          ...marketDistanceParams(distance ?? null),
                        },
                      })
                    }
                    style={styles.product}
                  >
                    <FavoriteImage item={item} />
                    <View style={styles.details}>
                      <Text
                        style={[styles.name, item.is_sold_out && styles.muted]}
                      >
                        {item.product_name}
                      </Text>
                      <Text style={styles.meta}>{info}</Text>
                      <View style={styles.prices}>
                        {discounted && (
                          <Text style={styles.originalPrice}>
                            {item.price.toLocaleString('ko-KR')}원
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.price,
                            item.is_sold_out && styles.muted,
                          ]}
                        >
                          {(discounted
                            ? item.sale_price!
                            : item.price
                          ).toLocaleString('ko-KR')}
                          원
                        </Text>
                      </View>
                      {item.is_sold_out && (
                        <Text style={styles.meta}>품절</Text>
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.product_name} 관심 ${selected ? '취소' : '추가'}`}
                    accessibilityState={{ selected, disabled: pending }}
                    disabled={pending}
                    onPress={() => void toggleFavorite(item.listing_id)}
                    style={styles.heart}
                  >
                    <AppIcon
                      name={selected ? 'heart-filled' : 'heart-outline'}
                      size={27}
                      color={selected ? '#FF3D4A' : '#858585'}
                    />
                  </Pressable>
                </View>
              );
            })}
          {loading && (
            <ActivityIndicator
              color={theme.colors.primary}
              accessibilityLabel="관심상품 조회 중"
              style={styles.status}
            />
          )}
          {!!error && (
            <View style={styles.status}>
              <Text accessibilityRole="alert" style={styles.message}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRetry((value) => value + 1)}
                style={styles.retry}
              >
                <Text style={styles.retryLabel}>다시 시도</Text>
              </Pressable>
            </View>
          )}
          {!loading && !error && !visible.length && (
            <Text style={[styles.message, styles.emptyMessage]}>
              {keyword
                ? '검색된 관심상품이 없어요.'
                : '관심상품이 없어요. 하트 버튼으로 상품을 담아보세요.'}
            </Text>
          )}
        </ScrollView>
      </View>
      <BottomNavigation active="관심상품" onSelect={onTab} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  searchBox: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#F2F4F3',
    borderRadius: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  search: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 10,
    fontSize: 16,
    color: '#7C7C7C',
  },
  clear: {
    fontSize: 14,
    color: '#7C7C7C',
    paddingVertical: 10,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  row: {
    minHeight: 116,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  product: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  image: {
    width: 82,
    height: 82,
    borderRadius: 9,
    backgroundColor: '#DCDCDC',
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    color: '#181725',
  },
  meta: {
    fontSize: 14,
    lineHeight: 21,
    color: '#858585',
  },
  prices: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 8,
  },
  originalPrice: {
    fontSize: 14,
    color: '#999999',
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    color: '#181725',
  },
  muted: {
    color: '#999999',
  },
  heart: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMessage: {
    textAlign: 'center',
  },
  status: {
    paddingVertical: 24,
  },
  message: {
    fontSize: 15,
    lineHeight: 23,
    color: '#858585',
    paddingVertical: 20,
  },
  retry: {
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  retryLabel: {
    fontSize: 16,
    color: theme.colors.brandText,
  },
});
