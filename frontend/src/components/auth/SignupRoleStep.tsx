import { logAppError } from '../../utils/appDiagnostics';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader } from '../ui/PageHeader';
import { PrimaryButton } from '../ui/PrimaryButton';
import { AuthField } from '../ui/AuthField';
import { AppIcon } from '../ui/AppIcon';
import { MerchantLocationSettings } from '../maps/MerchantLocationSettings';
import type { ExplorationLocation } from '../../services/explorationLocation';
import {
  searchKakaoMarkets,
  type KakaoMarket,
} from '../../services/api/markets';

export type SignupProfile =
  | { role: 'customer' }
  | {
      role: 'merchant';
      storeName: string;
      storeLocation: ExplorationLocation;
      market: KakaoMarket;
      description?: string;
    };
export function SignupRoleStep({
  onBack,
  onComplete,
  loading,
  error,
}: {
  onBack: () => void;
  onComplete: (profile: SignupProfile) => Promise<void>;
  loading: boolean;
  error: string;
}) {
  const [role, setRole] = useState<'customer' | 'merchant' | null>(null);
  const [storeName, setStoreName] = useState('');
  const [location, setLocation] = useState<ExplorationLocation | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState('');
  const [markets, setMarkets] = useState<KakaoMarket[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<KakaoMarket | null>(
    null,
  );
  const [marketQuery, setMarketQuery] = useState('');
  const [description, setDescription] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  useEffect(() => {
    let active = true;
    setMarkets([]);
    setMarketError('');
    if (role !== 'merchant' || !marketQuery.trim() || selectedMarket) {
      setMarketsLoading(false);
      return;
    }
    setMarketsLoading(true);
    const timer = setTimeout(() => {
      void searchKakaoMarkets(marketQuery)
        .then((result) => {
          if (active) setMarkets(result.documents);
        })
        .catch((e) => {
          logAppError('signup/market-search', e);
          if (active)
            setMarketError(
              e instanceof Error ? e.message : '시장 검색에 실패했어요.',
            );
        })
        .finally(() => {
          if (active) setMarketsLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [role, marketQuery, searchRetry, selectedMarket]);
  const lock = useRef(false);
  async function complete() {
    if (lock.current || !role) return;
    if (role === 'merchant' && (!storeName.trim() || !location)) {
      setValidation('가게 이름과 위치를 설정해주세요.');
      return;
    }
    if (
      role === 'merchant' &&
      (!selectedMarket || !selectedMarket.address.trim())
    ) {
      setValidation('소속 시장을 선택해주세요.');
      return;
    }
    setValidation('');
    lock.current = true;
    try {
      await onComplete(
        role === 'merchant'
          ? {
              role,
              storeName: storeName.trim(),
              storeLocation: location!,
              market: selectedMarket!,
              description: description.trim(),
            }
          : { role },
      );
    } finally {
      lock.current = false;
    }
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader
        rightAction={<></>}
        title=""
        onBack={() => {
          if (!loading) onBack();
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
        >
          <Text style={styles.title}>어떻게 이용하실 건가요?</Text>
          <View style={styles.roles}>
            {(
              [
                { value: 'customer', label: '고객', icon: 'account-outline' },
                { value: 'merchant', label: '상인', icon: 'storefront' },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: role === item.value }}
                disabled={loading}
                onPress={() => {
                  setRole(item.value);
                  setValidation('');
                }}
                style={[styles.role, role === item.value && styles.selected]}
              >
                <AppIcon
                  name={item.icon}
                  size={40}
                  color={role === item.value ? '#53B175' : '#858585'}
                />
                <Text style={styles.roleText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {role === 'merchant' && (
            <View style={styles.store}>
              <AuthField
                labelColor="#333333"
                label="가게 이름"
                value={storeName}
                onChangeText={setStoreName}
                editable={!loading}
                placeholder="가게 이름을 입력해주세요"
              />
              <Text style={styles.label}>가게 위치</Text>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => {
                  setReady(false);
                  setOpen(true);
                }}
                style={styles.location}
              >
                <AppIcon name="location-pin" color="#53B175" />
                <Text style={[styles.locationText, styles.storeLocationText]}>
                  {location?.name || '지도에서 가게 위치 설정'}
                </Text>
                <AppIcon name="arrow-right" size={16} color="#858585" />
              </Pressable>
            </View>
          )}
          {!!(validation || error) && (
            <Text accessibilityRole="alert" style={styles.error}>
              {validation || error}
            </Text>
          )}
          {role === 'merchant' && (
            <View style={{ marginTop: 24, gap: 10 }}>
              <Text style={[styles.label, styles.marketLabel]}>소속 시장</Text>
              <View style={styles.searchBox}>
                <AppIcon name="search" size={19} color="#858585" />
                <TextInput
                  accessibilityLabel="소속 시장 검색"
                  placeholder="시장 이름 검색 (예: 망원시장)"
                  placeholderTextColor="#B0B0B0"
                  value={marketQuery}
                  editable={!loading}
                  onChangeText={(value) => {
                    setMarketQuery(value);
                    setSelectedMarket(null);
                    setValidation('');
                  }}
                  style={styles.searchInput}
                />
              </View>
              {selectedMarket || !marketQuery.trim() ? null : marketsLoading ? (
                <Text style={styles.subtitle}>시장을 검색하고 있어요.</Text>
              ) : marketError ? (
                <View>
                  <Text accessibilityRole="alert" style={styles.subtitle}>
                    {marketError}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={loading}
                    onPress={() => setSearchRetry((v) => v + 1)}
                  >
                    <Text style={styles.retry}>다시 검색</Text>
                  </Pressable>
                </View>
              ) : markets.length === 0 ? (
                <Text style={styles.subtitle}>
                  검색된 시장이 없어요. 시장 이름을 다시 확인해주세요.
                </Text>
              ) : (
                <ScrollView
                  style={styles.marketResults}
                  contentContainerStyle={styles.marketResultsContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                {markets.map((market) => (
                  <Pressable
                    key={market.place_id}
                    disabled={loading}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: false,
                    }}
                    onPress={() => {
                      setSelectedMarket(market);
                      setMarketQuery(market.market_name);
                      setMarkets([]);
                      setMarketsLoading(false);
                      setMarketError('');
                      setValidation('');
                      Keyboard.dismiss();
                    }}
                    style={[
                      styles.location,
                      styles.marketResult,
                    ]}
                  >
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.locationText} numberOfLines={1}>
                        {market.market_name}
                      </Text>
                      <Text style={styles.marketAddress} numberOfLines={1}>{market.address}</Text>
                    </View>
                  </Pressable>
                ))}
                </ScrollView>
              )}
              <View style={styles.descriptionField}>
              <AuthField
                labelColor="#333333"
                label="가게 설명 (선택)"
                value={description}
                onChangeText={setDescription}
                editable={!loading}
                placeholder="가게를 소개해주세요"
              />
              </View>
            </View>
          )}
          <View style={{ marginTop: 32 }}>
            <PrimaryButton
              title="완료"
              disabled={
                !role ||
                loading ||
                (role === 'merchant' &&
                  (!storeName.trim() ||
                    !location ||
                    !selectedMarket ||
                    !selectedMarket.address.trim() ||
                    marketsLoading))
              }
              loading={loading}
              onPress={complete}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onShow={() => setReady(true)}
        onRequestClose={() => setOpen(false)}
      >
        {ready && (
          <MerchantLocationSettings
            initial={location}
            onClose={() => setOpen(false)}
            onApply={(next) => {
              setLocation(next);
              setOpen(false);
            }}
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
  body: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#000000',
  },
  subtitle: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
    marginTop: 10,
  },
  roles: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 30,
  },
  role: {
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    borderWidth: 1.5,
    borderColor: '#E2E2E2',
    borderRadius: 16,
  },
  selected: {
    backgroundColor: '#F1F9F4',
    borderColor: '#53B175',
  },
  roleText: {
    fontSize: 21,
    fontWeight: '600',
    color: '#000000',
  },
  store: {
    marginTop: 36,
  },
  label: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 14,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 12,
    padding: 16,
  },
  locationText: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  storeLocationText: {
    fontSize: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  marketLabel: {
    marginBottom: 0,
  },
  descriptionField: {
    marginTop: 22,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 20,
    color: '#000000',
  },
  marketAddress: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 20,
  },
  marketResults: {
    maxHeight: 272,
    flexGrow: 0,
  },
  marketResultsContent: {
    gap: 10,
  },
  marketResult: {
    height: 84,
  },
  retry: {
    paddingVertical: 10,
    color: '#53B175',
    fontSize: 15,
  },
  error: {
    color: '#C23D3D',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 20,
  },
});
