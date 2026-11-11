import { useLocationRevision } from '../services/locationChanges';
import { logAppError } from '../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { marketDistanceParams } from '../utils/marketDistance';
import { PageHeader } from '../components/ui/PageHeader';
import { LocationButton } from '../components/ui/LocationButton';
import { BottomNavigation } from '../components/ui/BottomNavigation';
import { LocationSettings } from '../components/maps/LocationSettings';
import { AppIcon } from '../components/ui/AppIcon';
import {
  getNearbyMarkets,
  searchKakaoMarkets,
  type KakaoMarketSearch,
  type NearbyMarket,
} from '../services/api/markets';
import {
  readLocation,
  getCurrentLocation,
  saveLocation,
  isLocation,
  type ExplorationLocation,
} from '../services/explorationLocation';

export default function MarketsScreen() {
  const sharedLocationRevision = useLocationRevision();
  const { selectedLocation } = useLocalSearchParams<{
    selectedLocation?: string;
  }>();
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [markets, setMarkets] = useState<NearbyMarket[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<KakaoMarketSearch | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const initialRevision = useRef(0);
  useEffect(() => {
    let active = true;
    setSearchResult(null);
    setSearchError('');
    if (!query.trim()) {
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void searchKakaoMarkets(query)
        .then((result) => {
          if (active) setSearchResult(result);
        })
        .catch((e) => {
          logAppError('app/markets.tsx', e);
          if (active)
            setSearchError(
              e instanceof Error ? e.message : '시장 검색에 실패했어요.',
            );
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, searchRetry]);
  function chooseMarket(market: {
    market_id: number | null;
    market_name: string;
    distance?: number;
  }) {
    if (market.market_id === null) {
      Alert.alert(
        market.market_name,
        '아직 서비스에 등록되지 않은 시장이에요.',
      );
      return;
    }
    const distance =
      market.distance ??
      markets.find((item) => item.market_id === market.market_id)?.distance ??
      null;
    router.push({
      pathname: '/markets/[marketId]',
      params: {
        marketId: String(market.market_id),
        marketName: market.market_name,
        ...marketDistanceParams(distance),
      },
    });
  }
  async function chooseLocation(next: ExplorationLocation) {
    if (selecting) return;
    setSelecting(true);
    try {
      await saveLocation(next);
      initialRevision.current++;
      setLocation(next);
      setError('');
      setLoading(false);
      setQuery('');
      setOpen(false);
    } catch (__caughtError) {
      logAppError('app/markets.tsx', __caughtError);
      Alert.alert('저장 실패', '위치를 저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSelecting(false);
    }
  }

  useEffect(() => {
    let active = true;
    const revision = initialRevision.current;
    void (async () => {
      try {
        let passed: unknown;
        try {
          passed = selectedLocation ? JSON.parse(selectedLocation) : null;
        } catch (__caughtError) {
          logAppError('app/markets.tsx', __caughtError);
          passed = null;
        }
        const saved = await readLocation();
        const next =
          saved ?? (isLocation(passed) ? passed : await getCurrentLocation());
        if (active && revision === initialRevision.current) setLocation(next);
      } catch (e) {
        logAppError('app/markets.tsx', e);
        if (active && revision === initialRevision.current)
          setError(e instanceof Error ? e.message : '위치를 확인할 수 없어요.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedLocation, sharedLocationRevision]);
  useEffect(() => {
    if (!location) return;
    let active = true;
    setMarkets([]);
    setMarketsError('');
    setMarketsLoading(true);
    void getNearbyMarkets(location)
      .then((result) => {
        if (active) setMarkets(result);
      })
      .catch((e) => {
        logAppError('app/markets.tsx', e);
        if (active)
          setMarketsError(
            e instanceof Error ? e.message : '시장 조회에 실패했어요.',
          );
      })
      .finally(() => {
        if (active) setMarketsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location, retry]);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader title="시장 찾기" onBack={() => router.back()} />
      <View style={styles.searchControls}>
        <LocationButton
          location={location}
          error={error}
          onPress={() => {
            setReady(false);
            setOpen(true);
          }}
        />
        <View style={styles.searchBox}>
          <AppIcon name="search" size={19} color="#858585" />
          <TextInput
            accessibilityLabel="시장 이름 검색"
            placeholder="시장 이름 검색 (예: 망원시장)"
            placeholderTextColor="#858585"
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              onPress={() => setQuery('')}
              style={styles.clear}
            >
              <Text style={styles.distance}>지우기</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {query.trim() ? (
          <>
            <Text style={styles.heading}>시장 검색 결과</Text>
            {searchLoading ? (
              <ActivityIndicator
                accessibilityLabel="시장 검색 중"
                color="#53B175"
              />
            ) : searchError ? (
              <View>
                <Text accessibilityRole="alert" style={styles.message}>
                  {searchError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSearchRetry((v) => v + 1)}
                >
                  <Text style={styles.link}>다시 검색</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {searchResult?.documents.length === 0 && (
                  <Text style={styles.message}>검색된 시장이 없어요.</Text>
                )}
                {searchResult?.documents.map((market) => (
                  <Pressable
                    key={market.place_id}
                    accessibilityRole="button"
                    accessibilityLabel={`${market.market_name} ${market.market_id === null ? '미등록 시장 안내' : '가게 목록 보기'}`}
                    onPress={() => chooseMarket(market)}
                    style={styles.row}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.marketName}>
                        {market.market_name}
                      </Text>
                      <Text style={styles.distance}>{market.address}</Text>
                    </View>
                    <AppIcon name="arrow-right" size={14} color="#AAAAAA" />
                  </Pressable>
                ))}
                {searchResult && !searchResult.is_end && (
                  <Text style={styles.message}>
                    검색 결과가 더 있을 수 있어요. 지역이나 시장 이름을 자세히
                    입력해주세요.
                  </Text>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.heading}>주변 시장</Text>
            {loading || marketsLoading ? (
              <ActivityIndicator
                accessibilityLabel="주변 시장 조회 중"
                color="#53B175"
              />
            ) : error ? (
              <Text style={styles.message}>{error}</Text>
            ) : marketsError ? (
              <View>
                <Text accessibilityRole="alert" style={styles.message}>
                  {marketsError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRetry((value) => value + 1)}
                >
                  <Text style={{ color: '#53B175', paddingVertical: 12 }}>
                    다시 시도
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {markets.length === 0 && (
                  <Text style={styles.message}>
                    반경 {location?.radius ?? 1}km 안에 시장이 없어요. 위치나
                    탐색 범위를 변경해보세요.
                  </Text>
                )}
                {markets.map((market, index) => (
                  <Pressable
                    key={
                      market.market_id === null
                        ? `unregistered:${index}`
                        : `market:${market.market_id}`
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${market.market_name} ${market.market_id === null ? '미등록 시장 안내' : '가게 목록 보기'}`}
                    onPress={() => chooseMarket(market)}
                    style={styles.row}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.marketName}>
                        {market.market_name}
                      </Text>
                      <Text style={styles.marketDistance}>
                        {market.market_id === null ? '미등록 시장 · ' : ''}
                        {(market.distance / 1000).toFixed(1)}km
                      </Text>
                    </View>
                    <AppIcon name="arrow-right" size={16} color="#7C7C7C" />
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
      <BottomNavigation
        onSelect={(tab) =>
          router.replace({ pathname: '/home', params: { tab } })
        }
      />
      <Modal
        visible={open}
        presentationStyle="fullScreen"
        animationType="slide"
        onShow={() => setReady(true)}
        onRequestClose={() => setOpen(false)}
      >
        {ready && (
          <LocationSettings
            initial={location}
            onClose={() => setOpen(false)}
            onApply={chooseLocation}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: 'white',
  },
  searchControls: {
    paddingHorizontal: 24,
    paddingTop: 18,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    flexShrink: 0,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F2F4F3',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: 18,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 15,
    color: '#181725',
    paddingVertical: 12,
  },
  clear: {
    paddingVertical: 10,
  },
  link: {
    color: '#53B175',
    fontSize: 14,
    paddingVertical: 8,
  },
  heading: {
    fontSize: 23,
    fontWeight: '800',
    color: '#181725',
    marginTop: 28,
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#858585',
    paddingVertical: 14,
  },
  row: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  rowText: {
    flex: 1,
  },
  marketName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#181725',
    marginBottom: 6,
  },
  marketDistance: {
    fontSize: 16,
    lineHeight: 18,
    color: '#858585',
  },
  distance: {
    fontSize: 14,
    color: '#858585',
  },
});
