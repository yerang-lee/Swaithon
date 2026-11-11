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
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../../components/ui/PageHeader';
import { ListingImage } from '../../components/products/ListingImage';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { AppIcon } from '../../components/ui/AppIcon';
import {
  getMarketStores,
  type MarketStore,
  type MarketStoresPage,
} from '../../services/api/stores';
import { getProducts, type ProductListing } from '../../services/api/products';
import { productCategories } from '../../constants/productCategories';
import { useFavorites } from '../../hooks/useFavorites';
import { useMarketDistance } from '../../hooks/useMarketDistance';
import {
  formatMarketDistance,
  marketDistanceParams,
} from '../../utils/marketDistance';
import { theme } from '../../constants/theme';

import { mockRequest } from '../../services/devMock';

function Thumbnail({ uri }: { uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return uri && /^https?:\/\//.test(uri) && !failed ? (
    <Image
      source={{ uri }}
      style={styles.image}
      onError={(event) => {
        logAppError('market/product-image', new Error(event.nativeEvent.error));
        setFailed(true);
      }}
    />
  ) : (
    <View style={styles.image} />
  );
}
export default function MarketScreen() {
  const catalogRevision = useCatalogRevision();
  const { marketId, marketName, preview, marketDistanceMeters } =
    useLocalSearchParams<{
      marketId: string;
      marketName?: string;
      preview?: string;
      marketDistanceMeters?: string;
    }>();
  const marketDistance = useMarketDistance(
    marketId,
    marketDistanceMeters,
    preview === 'true',
  );
  const distanceParams = marketDistanceParams(marketDistance);
  const [tab, setTab] = useState<'stores' | 'products'>('stores');
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [sellingOnly, setSellingOnly] = useState(false);
  const [saleOnly, setSaleOnly] = useState(false);
  const [stores, setStores] = useState<MarketStore[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const { favorites, pendingFavorites, toggleFavorite } = useFavorites();
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    if (page === 1) {
      setStores([]);
      setProducts([]);
    }
    if (tab === 'stores') {
      void (
        preview === 'true'
          ? (mockRequest(
              `/markets/${Number(marketId)}/stores?page=${page}&size=10&keyword=${encodeURIComponent(keyword)}`,
              'GET',
            ) as Promise<MarketStoresPage>)
          : getMarketStores(Number(marketId), page, keyword)
      )
        .then((result) => {
          if (!alive) return;
          setStores((previous) =>
            page === 1
              ? result.stores
              : [
                  ...new Map(
                    [...previous, ...result.stores].map((item) => [
                      item.store_id,
                      item,
                    ]),
                  ).values(),
                ],
          );
          setTotal(result.total_count);
        })
        .catch((e) => {
          logAppError('app/markets/[marketId].tsx', e);
          if (alive)
            setError(
              e instanceof Error ? e.message : '가게 조회에 실패했어요.',
            );
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    } else {
      void getProducts(
        {
          market_id: Number(marketId),
          page,
          size: 10,
          keyword,
          category_id: categoryId,
          ...(sellingOnly ? { is_sold_out: false } : {}),
          ...(saleOnly ? { is_on_sale: true } : {}),
        },
        preview === 'true',
      )
        .then((result) => {
          if (!alive) return;
          setProducts((previous) =>
            page === 1
              ? result.products
              : [
                  ...new Map(
                    [...previous, ...result.products].map((item) => [
                      item.listing_id,
                      item,
                    ]),
                  ).values(),
                ],
          );
          setTotal(result.total_count);
        })
        .catch((e) => {
          logAppError('app/markets/[marketId].tsx', e);
          if (alive)
            setError(
              e instanceof Error ? e.message : '상품 조회에 실패했어요.',
            );
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [
    marketId,
    preview,
    tab,
    page,
    keyword,
    categoryId,
    sellingOnly,
    saleOnly,
    retry,
    catalogRevision,
  ]);
  const categories = [
    { id: undefined as number | undefined, name: '전체' },
    ...productCategories.map(({ id, name }) => ({ id, name })),
  ];
  function resetPage() {
    setPage(1);
    setProducts([]);
    setStores([]);
    setTotal(0);
  }
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <PageHeader title={marketName || '시장'} onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.searchBox}>
          <AppIcon name="search" size={19} color="#858585" />
          <TextInput
            accessibilityLabel={
              tab === 'stores' ? '가게 이름 검색' : '상품 이름 검색'
            }
            placeholder={
              tab === 'stores'
                ? '어떤 가게를 찾으세요?'
                : '어떤 상품을 찾으세요?'
            }
            value={search}
            onChangeText={setSearch}
            style={styles.search}
            returnKeyType="search"
          />
        </View>
        <View style={styles.tabs}>
          {(
            [
              { value: 'stores', label: '가게별' },
              { value: 'products', label: '상품별' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.value }}
              onPress={() => {
                if (tab !== item.value) {
                  setTab(item.value);
                  setSearch('');
                  setKeyword('');
                  resetPage();
                }
              }}
              style={[styles.tab, tab === item.value && styles.selectedTab]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === item.value && styles.selectedLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === 'products' && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categories}
              contentContainerStyle={styles.categoryList}
            >
              {categories.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryId === item.id }}
                  key={item.id ?? 'all'}
                  onPress={() => {
                    if (categoryId !== item.id) {
                      setCategoryId(item.id);
                      resetPage();
                    }
                  }}
                  style={[
                    styles.category,
                    categoryId === item.id && styles.selectedCategory,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryLabel,
                      categoryId === item.id && styles.selectedLabel,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 8 }}>
              {[
                { label: '판매 중만', value: sellingOnly, set: setSellingOnly },
                { label: '할인만', value: saleOnly, set: setSaleOnly },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.value }}
                  onPress={() => {
                    item.set(!item.value);
                    resetPage();
                  }}
                  style={styles.filter}
                >
                  <AppIcon
                    name={
                      item.value
                        ? 'check-box-rounded'
                        : 'check-box-outline-blank'
                    }
                    size={24}
                    color={item.value ? theme.colors.primary : '#555555'}
                  />
                  <Text
                    style={[
                      styles.filterLabel,
                      item.value && styles.activeFilterLabel,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {preview === 'true' && (
            <Text style={styles.previewNotice}>
              홈 화면 예시 시장의 미리보기입니다.
            </Text>
          )}
          {tab === 'stores'
            ? stores.map((store) => (
                <Pressable
                  key={store.store_id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/stores/[storeId]',
                      params: {
                        storeId: String(store.store_id),
                        storeName: store.store_name,
                        ...distanceParams,
                        ...(store.address ? { address: store.address } : {}),
                        preview,
                      },
                    })
                  }
                  style={styles.row}
                >
                  <Thumbnail uri={store.image_url} />
                  <View style={styles.details}>
                    <Text style={styles.name}>{store.store_name}</Text>
                    {marketDistance !== null && (
                      <Text style={styles.meta}>
                        {formatMarketDistance(marketDistance)}
                      </Text>
                    )}
                    {!!store.category?.trim() && (
                      <Text style={styles.meta}>{store.category}</Text>
                    )}
                  </View>
                </Pressable>
              ))
            : products.map((product) => {
                const id = String(product.listing_id);
                const discounted =
                  product.is_on_sale === true &&
                  product.sale_price !== null &&
                  product.sale_price < product.price;
                return (
                  <View key={id} style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={product.is_sold_out}
                      accessibilityLabel={`${product.product_name}${product.is_sold_out ? ' 품절' : ' 상세'}`}
                      onPress={() =>
                        router.push({
                          pathname: '/products/[listingId]',
                          params: { listingId: id, preview, ...distanceParams },
                        })
                      }
                      style={styles.product}
                    >
                      <View style={styles.imageWrap}>
                        <ListingImage listingId={id} uri={product.image_url}
                          style={styles.image} label={`${product.product_name} 사진`}
                          preview={preview === 'true'} />
                        {product.is_sold_out && (
                          <View style={styles.soldOutOverlay}>
                            <Text style={styles.soldOutBadge}>품절</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.details}>
                        <Text
                          style={[
                            styles.name,
                            { fontWeight: '500' },
                            product.is_sold_out && { color: '#999999' },
                          ]}
                        >
                          {product.product_name}
                        </Text>
                        <Text style={styles.meta}>{product.store_name}</Text>
                        <View style={styles.priceRow}>
                          {discounted && (
                            <Text style={styles.originalPrice}>
                              {product.price.toLocaleString('ko-KR')}원
                            </Text>
                          )}
                          <Text
                            style={[
                              styles.price,
                              product.is_sold_out && { color: '#999999' },
                              discounted && styles.salePrice,
                            ]}
                          >
                            {(discounted
                              ? product.sale_price!
                              : product.price
                            ).toLocaleString('ko-KR')}
                            원
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${product.product_name} 관심 ${favorites.includes(id) ? '취소' : '추가'}`}
                      accessibilityState={{ selected: favorites.includes(id) }}
                      disabled={pendingFavorites.includes(id)}
                      onPress={() =>
                        void toggleFavorite(id, { preview: preview === 'true' })
                      }
                      style={styles.heart}
                    >
                      <AppIcon
                        name={
                          favorites.includes(id)
                            ? 'heart-filled'
                            : 'heart-outline'
                        }
                        color={favorites.includes(id) ? '#E84B4B' : '#858585'}
                        size={26}
                      />
                    </Pressable>
                  </View>
                );
              })}
          {loading && (
            <ActivityIndicator
              accessibilityLabel={
                tab === 'stores' ? '가게 목록 조회 중' : '상품 목록 조회 중'
              }
              color={theme.colors.primary}
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
                onPress={() => setRetry((v) => v + 1)}
                style={styles.more}
              >
                <Text style={styles.moreLabel}>다시 시도</Text>
              </Pressable>
            </View>
          )}
          {!loading &&
            !error &&
            (tab === 'stores' ? stores : products).length === 0 && (
              <Text style={styles.message}>
                조건에 맞는 {tab === 'stores' ? '가게' : '상품'}가 없어요.
              </Text>
            )}
          {!loading && !error && page * 10 < total && (
            <Pressable
              accessibilityRole="button"
              style={styles.more}
              onPress={() => setPage((v) => v + 1)}
            >
              <Text style={styles.moreLabel}>
                {tab === 'stores' ? '가게' : '상품'} 더 보기
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
      <BottomNavigation
        active="홈"
        onSelect={(selected) =>
          router.replace({ pathname: '/home', params: { tab: selected } })
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

  content: {
    flex: 1,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },

  searchBox: {
    marginTop: 12,
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

  tabs: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    backgroundColor: '#F2F4F3',
    marginTop: 12,
    marginBottom: 12,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 7,
  },

  selectedTab: {
    backgroundColor: theme.colors.primary,
  },

  tabLabel: {
    fontSize: 15,
    color: theme.colors.text,
  },

  selectedLabel: {
    color: 'white',
    fontWeight: '700',
  },

  categories: {
    flexGrow: 0,
    marginBottom: 8,
  },

  categoryList: {
    gap: 8,
    paddingVertical: 4,
  },

  category: {
    backgroundColor: '#F6F6F6',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  selectedCategory: {
    backgroundColor: '#4C4C4C',
  },

  categoryLabel: {
    color: '#444444',
    fontSize: 16,
  },

  filterLabel: {
    color: '#555555',
    fontSize: 17,
  },

  activeFilterLabel: {
    color: '#176735',
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingBottom: 24,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
    minHeight: 112,
    paddingVertical: 16,
  },

  salePrice: {
    color: '#EF4929',
  },
  imageWrap: {
    width: 82,
    height: 82,
    borderRadius: 10,
    overflow: 'hidden',
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
    fontSize: 14,
    fontWeight: '700',
    borderRadius: 4,
    padding: 5,
  },
  image: {
    width: 82,
    height: 82,
    borderRadius: 10,
    backgroundColor: '#DCDCDC',
  },

  details: {
    flex: 1,
    gap: 5,
  },

  name: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 20,
  },

  filter: {
    paddingVertical: 8,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    color: '#7C7C7C',
    fontSize: 16,
    lineHeight: 18,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 2,
  },

  originalPrice: {
    fontSize: 14,
    color: '#999999',
    textDecorationLine: 'line-through',
  },

  price: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '700',
  },

  heart: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  product: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  message: {
    color: theme.colors.muted,
    paddingVertical: 20,
    lineHeight: 22,
  },

  previewNotice: {
    color: theme.colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 10,
  },

  status: {
    paddingVertical: 18,
  },

  more: {
    padding: 16,
    alignItems: 'center',
  },

  moreLabel: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
});
