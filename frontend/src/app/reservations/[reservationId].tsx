import { useCallback, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import { ReservationPickupQr } from '../../components/reservations/ReservationPickupQr';
import {
  getReservationDetail,
  reservationDetailId,
  type ReservationDetail,
} from '../../services/api/reservations';
import { getAuthSession } from '../../services/api/auth';
import { isMockMode } from '../../services/devMock';
import { logAppError } from '../../utils/appDiagnostics';

export default function ReservationDetailScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const id = reservationDetailId(reservationId);
  const token = getAuthSession()?.access_token;
  const [result, setResult] = useState<{
    token?: string;
    data: ReservationDetail;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useFocusEffect(
    useCallback(() => {
      let focused = true;
      function load() {
        const version = ++generation.current;
        const current = () =>
          focused &&
          generation.current === version &&
          getAuthSession()?.access_token === token;
        setResult(null);
        setLoading(true);
        setError('');
        if (id === null) {
          setLoading(false);
          setError('정수 예약 ID를 확인해주세요.');
          return;
        }
        void getReservationDetail(id)
          .then((data) => {
            if (current()) setResult({ token, data });
          })
          .catch((caught) => {
            logAppError('reservations/detail-route', caught);
            if (current())
              setError(
                caught instanceof Error
                  ? caught.message
                  : '예약 상세를 불러오지 못했어요.',
              );
          })
          .finally(() => {
            if (current()) setLoading(false);
          });
      }
      load();
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') load();
        else {
          generation.current++;
          setResult(null);
          setLoading(true);
        }
      });
      return () => {
        focused = false;
        generation.current++;
        setResult(null);
        listener.remove();
      };
    }, [id, token, retry]),
  );
  const detail = result && result.token === token ? result.data : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <PageHeader
        title="예약 상세"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace({ pathname: '/home', params: { tab: '예약' } })
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        {detail && (
          <View style={styles.card}>
            <Text style={styles.store}>{detail.store_name}</Text>
            <Text style={styles.product}>
              {detail.product_name} · 예약 {detail.quantity}개
            </Text>
            <Text style={styles.price}>
              {detail.total_price.toLocaleString('ko-KR')}원
            </Text>
            <Text
              style={[
                styles.status,
                detail.status === 'CANCELLED' && styles.cancelledStatus,
              ]}
            >
              {detail.status === 'CANCELLED'
                ? '예약 취소'
                : detail.status === 'COMPLETED'
                  ? '픽업 완료'
                  : '예약 완료'}
            </Text>
          </View>
        )}
        <ReservationPickupQr
          detail={detail}
          loading={loading}
          error={error}
          testMode={isMockMode()}
          onRefresh={() => {
            generation.current++;
            setResult(null);
            setLoading(true);
            setRetry((value) => value + 1);
          }}
        />
      </ScrollView>
      <BottomNavigation
        active="예약"
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
    backgroundColor: 'white',
  },
  body: {
    padding: 24,
    gap: 20,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingBottom: 32,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADADA',
    gap: 10,
  },
  store: {
    fontSize: 18,
    fontWeight: '600',
    color: '#181725',
  },
  product: {
    fontSize: 20,
    lineHeight: 28,
    color: '#181725',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#181725',
  },
  cancelledStatus: {
    color: '#FF3333',
  },
  status: {
    fontSize: 16,
    color: '#555555',
  },
});
