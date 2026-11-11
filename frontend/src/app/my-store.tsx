import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PageHeader } from '../components/ui/PageHeader';
import { ListingImage } from '../components/products/ListingImage';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { getAuthSession } from '../services/api/auth';
import {
  getMyStoreListings,
  type MyStoreListing,
} from '../services/api/myStoreListings';
import { useCatalogRevision } from '../services/catalogChanges';
import { logAppError } from '../utils/appDiagnostics';

export default function MyStoreScreen() {
  const token = getAuthSession()?.access_token;
  const revision = useCatalogRevision();
  const [items, setItems] = useState<MyStoreListing[]>([]);
  const [owner, setOwner] = useState<string>();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const moreLock = useRef(false);
  const visible = owner === token ? items : [];
  useFocusEffect(
    useCallback(() => {
      let focused = true;
      const visit = ++generation.current;
      const current = () =>
        focused &&
        generation.current === visit &&
        getAuthSession()?.access_token === token;
      setItems([]);
      setOwner(token);
      setTotal(0);
      setPage(1);
      setLoading(true);
      setMoreLoading(false);
      setError('');
      setMoreError('');
      moreLock.current = false;
      void getMyStoreListings()
        .then((result) => {
          if (!current()) return;
          setItems(result.listings);
          setTotal(result.total_count);
          setPage(result.page);
        })
        .catch((error) => {
          logAppError('my-store/list', error);
          if (current())
            setError(
              error instanceof Error
                ? error.message
                : '내 상품 목록을 불러오지 못했어요.',
            );
        })
        .finally(() => {
          if (current()) setLoading(false);
        });
      return () => {
        focused = false;
        generation.current++;
      };
    }, [token, revision, retry]),
  );
  async function more() {
    if (moreLock.current || loading || visible.length >= total) return;
    moreLock.current = true;
    const visit = generation.current;
    const current = () =>
      visit === generation.current && getAuthSession()?.access_token === token;
    setMoreLoading(true);
    setMoreError('');
    try {
      const result = await getMyStoreListings({ page: page + 1 });
      if (!current()) return;
      if (!result.listings.length && visible.length < result.total_count)
        throw new Error(
          '다음 상품 목록을 확인할 수 없어요. 다시 시도해주세요.',
        );
      setItems((previous) => [
        ...new Map(
          [...previous, ...result.listings].map((item) => [
            item.listing_id,
            item,
          ]),
        ).values(),
      ]);
      setTotal(result.total_count);
      setPage(result.page);
    } catch (error) {
      logAppError('my-store/more', error);
      if (current())
        setMoreError(
          error instanceof Error
            ? error.message
            : '다음 상품 목록을 불러오지 못했어요.',
        );
    } finally {
      if (current()) {
        moreLock.current = false;
        setMoreLoading(false);
      }
    }
  }
  const rows = Array.from(
    { length: Math.ceil(visible.length / 2) },
    (_, index) => visible.slice(index * 2, index * 2 + 2),
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="내 가게" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          (loading || !!error || !visible.length) && styles.center,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color="#53B175"
            accessibilityLabel="내 상품 목록 조회 중"
          />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.message} accessibilityRole="alert">
              {error}
            </Text>
            <PrimaryButton
              title="다시 시도"
              onPress={() => setRetry((value) => value + 1)}
            />
          </View>
        ) : !visible.length ? (
          <Text style={styles.message}>등록한 상품이 없어요.</Text>
        ) : (
          <>
            <Text style={styles.count}>상품 {total}개</Text>
            {rows.map((row) => (
              <View key={row[0].listing_id} style={styles.gridRow}>
                {row.map((item) => {
                  const discounted =
                    item.sale_price !== null && item.sale_price < item.price;
                  return (
                    <Pressable
                      key={item.listing_id}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.product_name} 상품 상세`}
                      style={styles.card}
                      onPress={() =>
                        router.push({
                          pathname: '/products/[listingId]',
                          params: { listingId: String(item.listing_id) },
                        })
                      }
                    >
                      <View
                        style={styles.cardImage}
                        accessibilityLabel="상품 사진 영역"
                      >
                          <ListingImage
                            listingId={item.listing_id}
                            uri={item.image_url}
                            style={styles.productPhoto}
                            label={`${item.product_name} 사진`}
                          />
                        {item.is_sold_out && (
                          <View style={styles.imageOverlay}>
                            <Text style={styles.badge}>품절</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.productName}>
                          {item.product_name}
                          {item.sale_quantity !== null
                            ? ` ${item.sale_quantity}`
                            : ''}
                          {item.sale_unit ? ` ${item.sale_unit}` : ''}
                        </Text>
                        <View style={styles.prices}>
                          {discounted && (
                            <Text style={styles.oldPrice}>
                              {item.price.toLocaleString('ko-KR')}원
                            </Text>
                          )}
                          <Text
                            style={[
                              styles.price,
                              discounted && styles.salePrice,
                            ]}
                          >
                            {(discounted
                              ? item.sale_price!
                              : item.price
                            ).toLocaleString('ko-KR')}
                            원
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
                {row.length === 1 && <View style={styles.spacer} />}
              </View>
            ))}
            {!!moreError && (
              <Text style={styles.message} accessibilityRole="alert">
                {moreError}
              </Text>
            )}
            {visible.length < total && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={moreError ? '다시 불러오기' : '더 보기'}
                disabled={moreLoading}
                onPress={() => void more()}
                style={styles.more}
              >
                {moreLoading ? (
                  <ActivityIndicator color="#53B175" />
                ) : (
                  <Text style={styles.moreText}>
                    {moreError ? '다시 불러오기' : '더 보기'}
                  </Text>
                )}
              </Pressable>
            )}
          </>
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
    backgroundColor: '#FFFFFF',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  center: {
    justifyContent: 'center',
  },
  empty: {
    gap: 20,
  },
  message: {
    fontSize: 18,
    lineHeight: 27,
    color: '#858585',
    textAlign: 'center',
  },
  count: {
    fontSize: 20,
    fontWeight: '600',
    color: '#181725',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  spacer: {
    flex: 1,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#E3E3E3',
  },
  productPhoto: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  cardInfo: {
    padding: 12,
    gap: 8,
  },
  productName: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '600',
    color: '#181725',
  },
  prices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 8,
    rowGap: 4,
  },
  oldPrice: {
    fontSize: 15,
    color: '#858585',
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '700',
    color: '#181725',
  },
  salePrice: {
    color: '#EF4929',
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
    fontSize: 16,
    fontWeight: '700',
    borderRadius: 4,
    padding: 5,
  },
  more: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  moreText: {
    fontSize: 18,
    color: '#176735',
  },
});
