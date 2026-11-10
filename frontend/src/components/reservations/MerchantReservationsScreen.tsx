import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { PageHeader } from '../ui/PageHeader';
import { PrimaryButton } from '../ui/PrimaryButton';
import { BottomNavigation } from '../ui/BottomNavigation';
import { getAuthSession } from '../../services/api/auth';
import {
  getMerchantReservations,
  type MerchantReservation,
} from '../../services/api/merchantReservations';
import {
  changeReservationStatus,
  type ReservationStatus,
} from '../../services/api/reservations';
import { logAppError } from '../../utils/appDiagnostics';

const filters: Array<{ value: ReservationStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '예약 접수' },
  { value: 'CONFIRMED', label: '상인 확인' },
  { value: 'READY', label: '준비 완료' },
  { value: 'COMPLETED', label: '픽업 완료' },
  { value: 'CANCELLED', label: '예약 취소' },
];
const statusLabel = (value: ReservationStatus) =>
  filters.find((filter) => filter.value === value)!.label;
function dateLabel(value: string) {
  const date = new Date(
    /(Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+09:00`,
  );
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
export function MerchantReservationsScreen({
  onTab,
}: { onTab?: (label: string) => void } = {}) {
  const [filter, setFilter] = useState<ReservationStatus | 'ALL'>('ALL');
  const [items, setItems] = useState<MerchantReservation[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [actionError, setActionError] = useState('');
  const [retry, setRetry] = useState(0);
  const [changing, setChanging] = useState<number | null>(null);
  const [owner, setOwner] = useState<string | undefined>();
  const generation = useRef(0);
  const focused = useRef(false);
  const mutationLock = useRef(false);
  const moreLock = useRef(false);
  const session = getAuthSession();
  const token = session?.access_token;
  const merchant =
    session?.role === 'MERCHANT' && session.expiresAt > Date.now();
  const visible = owner === token ? items : [];
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const visit = ++generation.current;
      const current = () =>
        focused.current &&
        generation.current === visit &&
        getAuthSession()?.access_token === token;
      setItems([]);
      setPage(1);
      setTotal(0);
      setError('');
      setMoreError('');
      setActionError('');
      setOwner(token);
      setMoreLoading(false);
      moreLock.current = false;
      if (!merchant) {
        setLoading(false);
        return () => {
          focused.current = false;
          generation.current++;
        };
      }
      setLoading(true);
      void getMerchantReservations({
        ...(filter !== 'ALL' ? { status: filter } : {}),
      })
        .then((result) => {
          if (current()) {
            setItems(result.reservations);
            setTotal(result.total_count);
            setPage(result.page);
          }
        })
        .catch((e) => {
          logAppError('merchant-reservations/list', e);
          if (current())
            setError(
              e instanceof Error ? e.message : '예약 목록을 불러오지 못했어요.',
            );
        })
        .finally(() => {
          if (current()) setLoading(false);
        });
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !mutationLock.current)
          setRetry((value) => value + 1);
      });
      return () => {
        focused.current = false;
        generation.current++;
        listener.remove();
      };
    }, [filter, retry, token, merchant]),
  );
  async function more() {
    if (loading || moreLock.current || mutationLock.current || !merchant)
      return;
    const visit = generation.current;
    moreLock.current = true;
    setMoreLoading(true);
    setMoreError('');
    const current = () =>
      focused.current &&
      generation.current === visit &&
      getAuthSession()?.access_token === token;
    try {
      const result = await getMerchantReservations({
        page: page + 1,
        ...(filter !== 'ALL' ? { status: filter } : {}),
      });
      if (!current()) return;
      const merged = new Map(
        visible.map((item) => [item.reservation_id, item]),
      );
      for (const item of result.reservations)
        merged.set(item.reservation_id, item);
      if (merged.size === visible.length && merged.size < result.total_count)
        throw new Error('예약 목록이 변경됐어요. 새로고침해주세요.');
      setItems([...merged.values()]);
      setTotal(result.total_count);
      setPage(result.page);
    } catch (e) {
      logAppError('merchant-reservations/more', e);
      if (current())
        setMoreError(
          e instanceof Error ? e.message : '다음 예약을 불러오지 못했어요.',
        );
    } finally {
      if (current()) {
        moreLock.current = false;
        setMoreLoading(false);
      }
    }
  }
  async function change(
    item: MerchantReservation,
    status: 'CONFIRMED' | 'READY',
  ) {
    if (
      mutationLock.current ||
      moreLock.current ||
      loading ||
      !focused.current ||
      getAuthSession()?.access_token !== token
    )
      return;
    mutationLock.current = true;
    setChanging(item.reservation_id);
    setActionError('');
    const visit = generation.current;
    const current = () =>
      focused.current &&
      generation.current === visit &&
      getAuthSession()?.access_token === token;
    try {
      const result = await changeReservationStatus(item.reservation_id, status);
      if (current()) {
        setItems((previous) =>
          previous.map((row) =>
            row.reservation_id === result.reservation_id
              ? { ...row, status: result.status }
              : row,
          ),
        );
      }
      if (focused.current && getAuthSession()?.access_token === token)
        setRetry((value) => value + 1);
    } catch (e) {
      logAppError('merchant-reservations/change', e);
      if (current())
        setActionError(
          e instanceof Error ? e.message : '예약 상태를 다시 확인해주세요.',
        );
    } finally {
      mutationLock.current = false;
      if (focused.current) setChanging(null);
    }
  }
  function confirm(item: MerchantReservation, status: 'CONFIRMED' | 'READY') {
    Alert.alert(
      status === 'READY' ? '픽업 준비 완료' : '예약 확인',
      `${item.product_name} · 예약 #${item.reservation_id}\n${status === 'READY' ? '준비 완료로 변경하고 고객 QR을 발급할까요?' : '예약을 확인 처리할까요?'}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '확인', onPress: () => void change(item, status) },
      ],
    );
  }
  const disabled = changing !== null || loading || moreLoading;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader
        title="예약 관리"
        onBack={onTab ? undefined : () => router.back()}
      />
      {merchant ? (
        <>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {filters.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === option.value }}
                  disabled={disabled}
                  onPress={() => setFilter(option.value)}
                  style={[
                    styles.filter,
                    filter === option.value && styles.selected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filter === option.value && styles.selectedText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={styles.summary}>
            <Text style={styles.note}>
              예약 {owner === token ? total : 0}건
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => setRetry((value) => value + 1)}
            >
              <Text style={styles.refresh}>새로고침</Text>
            </Pressable>
          </View>
          {!!actionError && (
            <Text style={styles.actionError} accessibilityRole="alert">
              {actionError}
            </Text>
          )}
          <ScrollView
            contentContainerStyle={[
              styles.list,
              (!visible.length || loading) && styles.center,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#53B175" />
            ) : error ? (
              <View style={styles.empty}>
                <Text style={styles.note} accessibilityRole="alert">
                  {error}
                </Text>
                <PrimaryButton
                  title="다시 시도"
                  onPress={() => setRetry((value) => value + 1)}
                />
              </View>
            ) : !visible.length ? (
              <Text style={styles.emptyText}>
                {filter === 'ALL'
                  ? '접수된 예약이 없어요.'
                  : '해당 상태의 예약이 없어요.'}
              </Text>
            ) : (
              visible.map((item) => (
                <View key={item.reservation_id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.note}>
                      예약 #{item.reservation_id} · 고객 #{item.customer_id}
                    </Text>
                    <Text
                      style={[
                        styles.status,
                        item.status === 'CANCELLED' && styles.cancelled,
                      ]}
                    >
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                  <Text style={styles.product}>{item.product_name}</Text>
                  <Text style={styles.detail}>
                    수량 {item.quantity} · 단가{' '}
                    {item.unit_price.toLocaleString('ko-KR')}원
                  </Text>
                  <Text style={styles.price}>
                    총 {item.total_price.toLocaleString('ko-KR')}원
                  </Text>
                  <Text style={styles.detail}>
                    픽업 예정: {dateLabel(item.pickup_at)}
                  </Text>
                  <Text style={styles.note}>
                    예약 신청: {dateLabel(item.created_at)}
                  </Text>
                  {!!item.request_note && (
                    <Text style={styles.detail}>
                      요청사항: {item.request_note}
                    </Text>
                  )}
                  {item.status === 'PENDING' && (
                    <PrimaryButton
                      title="예약 확인"
                      disabled={disabled}
                      loading={changing === item.reservation_id}
                      onPress={() => confirm(item, 'CONFIRMED')}
                    />
                  )}
                  {item.status === 'CONFIRMED' && (
                    <PrimaryButton
                      title="픽업 준비 완료"
                      disabled={disabled}
                      loading={changing === item.reservation_id}
                      onPress={() => confirm(item, 'READY')}
                    />
                  )}
                  {item.status === 'READY' && (
                    <PrimaryButton
                      title="픽업 QR 스캔"
                      disabled={disabled}
                      onPress={() => router.push('/pickup-scan')}
                    />
                  )}
                </View>
              ))
            )}
            {!loading && !!moreError && (
              <Text style={styles.error} accessibilityRole="alert">
                {moreError}
              </Text>
            )}
            {!loading &&
              !error &&
              visible.length > 0 &&
              visible.length < total && (
                <PrimaryButton
                  title={moreError ? '다시 불러오기' : '더 보기'}
                  disabled={changing !== null}
                  loading={moreLoading}
                  onPress={() => void more()}
                />
              )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            등록된 가게가 있는 상인 계정에서 이용할 수 있어요.
          </Text>
        </View>
      )}
      {onTab && <BottomNavigation active="예약" onSelect={onTab} />}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  filters: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 10,
  },
  filter: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F3F3',
  },
  selected: {
    backgroundColor: '#E3F3E9',
  },
  filterText: {
    fontSize: 17,
    color: '#666666',
  },
  selectedText: {
    color: '#23864C',
    fontWeight: '700',
  },
  summary: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  empty: {
    gap: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 17,
    lineHeight: 26,
    color: '#7C7C7C',
    textAlign: 'center',
  },
  card: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  note: {
    fontSize: 14,
    lineHeight: 22,
    color: '#7C7C7C',
  },
  status: {
    fontSize: 15,
    color: '#23864C',
    fontWeight: '600',
  },
  cancelled: {
    color: '#D33E3E',
  },
  product: {
    fontSize: 21,
    fontWeight: '700',
    color: '#181725',
  },
  price: {
    fontSize: 19,
    fontWeight: '700',
    color: '#181725',
  },
  detail: {
    fontSize: 16,
    lineHeight: 24,
    color: '#424743',
  },
  refresh: {
    fontSize: 16,
    color: '#23864C',
    paddingVertical: 4,
  },
  error: {
    fontSize: 16,
    lineHeight: 24,
    color: '#C43D3D',
    textAlign: 'center',
  },
  actionError: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    fontSize: 16,
    color: '#C43D3D',
  },
});
